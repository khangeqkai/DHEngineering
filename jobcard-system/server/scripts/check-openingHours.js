// Self-check for "a forgotten clock stops itself". Run: node server/scripts/check-openingHours.js
//
// Uses a throwaway database, so it never touches real data. It pins the window maths
// (an hour is open when its tier on the weekly grid is `normal` and its date is not a
// public holiday; a window is a contiguous stretch that may cross midnight) and the
// roll that cuts a clock left running past the end of normal hours: finished and
// flagged unconfirmed, or at midnight with a zero-length finish when it started outside
// normal hours.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'normalhours-'));
const { db, updateSettings } = require('../src/db/database');
const { windowAt, nextOpening, officeDayEndAfter } = require('../src/utils/openingHours');
const { wallClockToIso } = require('../src/utils/officeTime');
const { rollOpenTimers, forgetRollCache } = require('../src/utils/timerPause');

const TZ = 'Australia/Melbourne';
const at = (wall) => Date.parse(wallClockToIso(wall, TZ));
const iso = (wall) => wallClockToIso(wall, TZ);
const HOUR = 60 * 60 * 1000;

// Weekdays normal 07:00-17:00 (overtime 1 around it), weekends all overtime 1.
const weekday = [{ start: '00:00', tier: 'ot1' }, { start: '07:00', tier: 'normal' }, { start: '17:00', tier: 'ot1' }];
const weekend = [{ start: '00:00', tier: 'ot1' }];
const daySchedule = { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: weekend, sun: weekend };
// A night shift: normal from 22:00 through to 06:00 the next morning, every day. Hours
// before the earliest block take the last block's tier, so 00:00-06:00 is normal too.
const night = [{ start: '06:00', tier: 'ot1' }, { start: '22:00', tier: 'normal' }];
const nightSchedule = Object.fromEntries(Object.keys(daySchedule).map(d => [d, night]));
const allNormal = Object.fromEntries(Object.keys(daySchedule).map(d => [d, [{ start: '00:00', tier: 'normal' }]]));

const rules = { schedule: daySchedule, holidays: [], timezone: TZ };

// 1. Window maths.
assert.ok(windowAt(at('2026-10-12T09:00'), rules), 'Monday 09:00 is normal hours');
assert.strictEqual(windowAt(at('2026-10-12T06:59'), rules), null, 'Monday 06:59 is overtime');
assert.ok(windowAt(at('2026-10-12T07:00'), rules), 'the first normal instant is inside');
assert.strictEqual(windowAt(at('2026-10-12T17:00'), rules), null, 'the first overtime instant is outside');
assert.strictEqual(windowAt(at('2026-10-17T10:00'), rules), null, 'Saturday is all overtime');
const w = windowAt(at('2026-10-12T09:00'), rules);
assert.strictEqual(w.closeMs, at('2026-10-12T17:00'), 'window close');
assert.strictEqual(nextOpening(at('2026-10-12T17:00'), rules), at('2026-10-13T07:00'), 'next opening is Tuesday 07:00');
assert.strictEqual(nextOpening(at('2026-10-16T17:00'), rules), at('2026-10-19T07:00'), 'Friday evening waits for Monday');
assert.strictEqual(nextOpening(at('2026-10-12T07:00'), rules), at('2026-10-12T07:00'), 'a start at exactly ms counts');

// A public holiday is not normal hours, whatever the grid says.
const holidayRules = { ...rules, holidays: ['2026-10-13'] };
assert.strictEqual(windowAt(at('2026-10-13T09:00'), holidayRules), null, 'a holiday has no window');
assert.strictEqual(nextOpening(at('2026-10-12T17:00'), holidayRules), at('2026-10-14T07:00'), 'next opening skips the holiday');

// Normal hours that run across midnight are one window.
const nightRules = { ...rules, schedule: nightSchedule };
const nw = windowAt(at('2026-10-13T23:00'), nightRules);
assert.strictEqual(nw.closeMs, at('2026-10-14T06:00'), 'the window merges across midnight');
assert.strictEqual(windowAt(at('2026-10-14T01:00'), nightRules).closeMs, at('2026-10-14T06:00'), 'seen from after midnight, it closes the same morning');
assert.strictEqual(windowAt(at('2026-10-14T06:00'), nightRules), null, '06:00 is overtime');
// A holiday cuts a midnight-crossing window at midnight.
const nightHoliday = { ...nightRules, holidays: ['2026-10-14'] };
assert.strictEqual(windowAt(at('2026-10-13T23:00'), nightHoliday).closeMs, at('2026-10-14T00:00'), 'the holiday ends the window at midnight');

// An all-normal grid with no holidays never ends: the clock is never cut.
const allNormalRules = { ...rules, schedule: allNormal };
assert.strictEqual(windowAt(at('2026-10-12T09:00'), allNormalRules).closeMs, Infinity, 'no closing within 60 days');
assert.strictEqual(nextOpening(at('2026-10-12T09:00'), { ...rules, schedule: Object.fromEntries(Object.keys(daySchedule).map(d => [d, weekend])) }), null, 'nothing is normal within 60 days');

// The end of the office day containing an instant is the next local midnight.
assert.strictEqual(officeDayEndAfter(at('2026-10-17T08:00'), rules), at('2026-10-18T00:00'), 'Saturday ends at Sunday 00:00');
assert.strictEqual(officeDayEndAfter(at('2026-10-17T23:59'), rules), at('2026-10-18T00:00'), 'late evening is the same day');
assert.strictEqual(officeDayEndAfter(at('2026-10-03T12:00'), rules) - at('2026-10-03T12:00'), 12 * HOUR + 0, 'ordinary day: 12 hours to midnight');
assert.strictEqual(officeDayEndAfter(at('2026-10-04T12:00'), rules) - at('2026-10-04T00:00'), 23 * HOUR, 'the changeover day is 23 hours long');

// Daylight-saving changeover (Melbourne, Sunday 4 Oct 2026: 02:00 jumps to 03:00).
const dstRules = { ...rules, schedule: { ...daySchedule, sun: [{ start: '00:00', tier: 'ot1' }, { start: '01:00', tier: 'normal' }, { start: '05:00', tier: 'ot1' }] } };
const dst = windowAt(at('2026-10-04T03:30'), dstRules);
assert.ok(dst, 'the changeover Sunday has a window');
assert.strictEqual(dst.closeMs - at('2026-10-04T03:30'), 1.5 * HOUR, '03:30 to the 05:00 close is an hour and a half');

// 2. The roll against the throwaway database.
db.exec('DELETE FROM history; DELETE FROM time_entries; DELETE FROM job_items; DELETE FROM jobcards; DELETE FROM users');
db.prepare('INSERT INTO users (id, username, password, name) VALUES (?,?,?,?)').run('user:worker', 'worker', 'x', 'Test Worker');
db.prepare('INSERT INTO jobcards (id, job_number, status) VALUES (?,?,?)').run('job:1', 'DH-00001', 'IN_PROGRESS');
db.prepare('INSERT INTO job_items (id, jobcard_id, item_number, description) VALUES (?,?,?,?)').run('item:1', 'job:1', 1, 'A part');

const startRun = (wall) => {
  db.exec('DELETE FROM history; DELETE FROM time_entries');
  forgetRollCache();
  db.prepare('INSERT INTO time_entries (id, jobcard_id, user_id, item_id, start_time) VALUES (?,?,?,?,?)')
    .run('timeentry:1', 'job:1', 'user:worker', 'item:1', wallClockToIso(wall, TZ));
};
const rows = () => db.prepare('SELECT * FROM time_entries ORDER BY start_time').all();
const trail = (action) => db.prepare('SELECT * FROM history WHERE action = ?').all(action);

updateSettings({ timezone: TZ, labour_public_holidays: '[]', labour_schedule: JSON.stringify(allNormal) });
forgetRollCache();

// An all-normal grid with no holidays: nothing ever ends, so the roll does nothing.
startRun('2026-10-12T14:00');
rollOpenTimers(at('2026-10-13T09:00'));
assert.strictEqual(rows().length, 1, 'all-normal: no new row');
assert.strictEqual(rows()[0].end_time, null, 'all-normal: the run is untouched');
assert.strictEqual(rows()[0].finish_unconfirmed, 0);

// Monday 14:00 start, Tuesday 09:00 now: ONE row, finished at 17:00 and flagged.
updateSettings({ labour_schedule: JSON.stringify(daySchedule) });
forgetRollCache();
rollOpenTimers(at('2026-10-13T09:00'));
let r = rows();
assert.strictEqual(r.length, 1, 'no other rows are created');
assert.strictEqual(r[0].start_time, iso('2026-10-12T14:00'));
assert.strictEqual(r[0].end_time, iso('2026-10-12T17:00'), 'finished when normal hours end');
assert.strictEqual(r[0].finish_unconfirmed, 1);
assert.strictEqual(r[0].description, null, 'description is left alone');
assert.strictEqual(r[0].awaiting_details, 0);
assert.strictEqual(r[0].critical_at_finish, 0);
const auto = trail('auto_stop_timer');
assert.strictEqual(auto.length, 1, 'the cut is on the trail');
assert.strictEqual(auto[0].user_id, 'user:worker', 'attributed to the worker');
assert.ok(auto[0].changes.includes('stopped at the end of normal hours'));

// A second run changes nothing.
rollOpenTimers(at('2026-10-13T09:00'));
assert.strictEqual(rows().length, 1, 'second run is a no-op');
assert.strictEqual(rows()[0].end_time, iso('2026-10-12T17:00'));
assert.strictEqual(trail('auto_stop_timer').length, 1, 'second run adds no trail entry');

// Early start: 06:30 Monday runs into normal hours; now 18:00 -> cut at 17:00.
startRun('2026-10-12T06:30');
rollOpenTimers(at('2026-10-12T12:00'));
assert.strictEqual(rows()[0].end_time, null, 'still inside the window it runs into: left running');
rollOpenTimers(at('2026-10-12T18:00'));
r = rows();
assert.strictEqual(r.length, 1);
assert.strictEqual(r[0].end_time, iso('2026-10-12T17:00'), 'early start is cut where the next window closes');
assert.strictEqual(r[0].finish_unconfirmed, 1);

// Saturday 08:00 start (outside normal hours, nothing opens that day): left running all day,
// then cut at midnight with a zero-length finish.
startRun('2026-10-17T08:00');
rollOpenTimers(at('2026-10-17T20:00'));
r = rows();
assert.strictEqual(r[0].end_time, null, 'Saturday 20:00: still running');
assert.strictEqual(r[0].finish_unconfirmed, 0);
rollOpenTimers(at('2026-10-18T00:30'));
r = rows();
assert.strictEqual(r.length, 1);
assert.strictEqual(r[0].end_time, r[0].start_time, 'zero-length: the finish is not known');
assert.strictEqual(r[0].finish_unconfirmed, 1);
assert.ok(trail('auto_stop_timer')[0].changes.includes('stopped at midnight'));
rollOpenTimers(at('2026-10-18T09:00'));
assert.strictEqual(rows()[0].end_time, r[0].start_time, 'second run is a no-op');

// A start in the evening of a weekday (after normal hours, next opening is tomorrow): midnight cut.
startRun('2026-10-12T19:00');
rollOpenTimers(at('2026-10-13T00:01'));
r = rows();
assert.strictEqual(r[0].end_time, r[0].start_time);
assert.strictEqual(r[0].finish_unconfirmed, 1);

// A cut missed while the server was off is stored at the same moment it would have been.
startRun('2026-10-12T14:00');
rollOpenTimers(at('2026-10-15T09:00'));
assert.strictEqual(rows().length, 1);
assert.strictEqual(rows()[0].end_time, iso('2026-10-12T17:00'));

// Night shift: a run started at 23:00 carries on past midnight and is cut at 06:00.
updateSettings({ labour_schedule: JSON.stringify(nightSchedule) });
forgetRollCache();
startRun('2026-10-13T23:00');
rollOpenTimers(at('2026-10-14T03:00'));
assert.strictEqual(rows()[0].end_time, null, 'still inside the window after midnight: nothing to do');
rollOpenTimers(at('2026-10-14T08:00'));
r = rows();
assert.strictEqual(r.length, 1);
assert.strictEqual(r[0].end_time, iso('2026-10-14T06:00'), 'cut at 06:00, not at midnight');
assert.strictEqual(r[0].finish_unconfirmed, 1);

// The stop-form reminder: every finished run still marked is offered, and the one-time
// conversion clears only unanswered runs that finished before its stored baseline.
{
  const { clearStaleAwaitingDetails } = require('../src/db/legacyMigrations');
  const { timeEntryQueries } = require('../src/db/database');
  db.exec('DELETE FROM time_entries; DELETE FROM settings WHERE key = \'stop_form_reminder_baseline_at\'');
  const put = db.prepare('INSERT INTO time_entries (id, jobcard_id, user_id, item_id, start_time, end_time, awaiting_details, finish_confirmed_at) VALUES (?,?,?,?,?,?,?,?)');
  put.run('te:old', 'job:1', 'user:worker', 'item:1', '2020-01-01T01:00:00.000Z', '2020-01-01T02:00:00.000Z', 1, null);
  put.run('te:oldAnswered', 'job:1', 'user:worker', 'item:1', '2020-01-02T01:00:00.000Z', '2020-01-02T02:00:00.000Z', 1, '2020-01-02T03:00:00.000Z');
  clearStaleAwaitingDetails();
  const flag = (id) => db.prepare('SELECT awaiting_details FROM time_entries WHERE id = ?').get(id).awaiting_details;
  assert.strictEqual(flag('te:old'), 0, 'an old unanswered form is cleared once');
  assert.strictEqual(flag('te:oldAnswered'), 1, 'an answered run keeps its form');
  const future = new Date(Date.now() + 60000).toISOString();
  put.run('te:new', 'job:1', 'user:worker', 'item:1', future, future, 1, null);
  clearStaleAwaitingDetails();
  assert.strictEqual(flag('te:new'), 1, 'a run finished after the baseline is never cleared');
  assert.deepStrictEqual(timeEntryQueries.getUnfilledStopFormsByUser.all('user:worker').map(x => x.id), ['te:oldAnswered', 'te:new'],
    'every finished run still marked is offered, oldest first');
}

db.close(); // Windows won't remove the file while it's still open.
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
console.log('normalHours: all checks passed');
