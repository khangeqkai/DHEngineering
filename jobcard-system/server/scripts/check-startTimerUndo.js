// Self-check for the accidental start/stop tap undo. Run: node server/scripts/check-startTimerUndo.js
//
// Uses a throwaway database, so it never touches real data. It pins the two things the
// undo works out for itself instead of remembering them: the status the job was on
// before Start (read back from the Start's own trail entry), and whether that Start is
// what put the worker on the job (their place on it being no older than the block).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'startundo-'));
const { db, recordHistory } = require('../src/db/database');
const { discardIfAccidentalTap } = require('../src/utils/startTimerUndo');

const actor = { userId: 'user:worker', name: 'Test Worker' };

// One job, one part, one worker who was already on the job before today, and the
// worker whose tap we are testing.
function seed({ startedAgoMs, assignWorkerAgoMs }) {
  db.exec('DELETE FROM history; DELETE FROM time_entries; DELETE FROM job_assignees; DELETE FROM job_items; DELETE FROM jobcards; DELETE FROM users');
  db.prepare('INSERT INTO users (id, username, password, name) VALUES (?,?,?,?)').run('user:worker', 'worker', 'x', 'Test Worker');
  db.prepare('INSERT INTO users (id, username, password, name) VALUES (?,?,?,?)').run('user:mate', 'mate', 'x', 'Old Mate');
  db.prepare('INSERT INTO jobcards (id, job_number, status) VALUES (?,?,?)').run('job:1', 'DH-00001', 'IN_PROGRESS');
  db.prepare('INSERT INTO job_items (id, jobcard_id, item_number, description) VALUES (?,?,?,?)').run('item:1', 'job:1', 1, 'A part');

  const startTime = new Date(Date.now() - startedAgoMs).toISOString();
  db.prepare('INSERT INTO time_entries (id, jobcard_id, user_id, item_id, start_time) VALUES (?,?,?,?,?)')
    .run('timeentry:1', 'job:1', 'user:worker', 'item:1', startTime);
  // Start recorded the move out of Open, keyed by the block's start time.
  recordHistory('jobcard', 'job:1', 'start_timer', actor.userId, actor.name, {
    timer: { from: null, to: startTime },
    status: { from: 'OPEN', to: 'IN_PROGRESS' }
  }, null);

  db.prepare('INSERT INTO job_assignees (id, jobcard_id, user_id, assigned_at) VALUES (?,?,?,?)')
    .run('assignee:mate', 'job:1', 'user:mate', new Date(Date.now() - 86400000).toISOString());
  db.prepare('INSERT INTO job_assignees (id, jobcard_id, user_id, assigned_at) VALUES (?,?,?,?)')
    .run('assignee:worker', 'job:1', 'user:worker', new Date(Date.now() - assignWorkerAgoMs).toISOString());

  return db.prepare('SELECT * FROM time_entries WHERE id = ?').get('timeentry:1');
}

const status = () => db.prepare('SELECT status FROM jobcards WHERE id = ?').get('job:1').status;
const assignees = () => db.prepare('SELECT user_id FROM job_assignees WHERE jobcard_id = ?').all('job:1').map(r => r.user_id);
const blocks = () => db.prepare('SELECT id FROM time_entries').all().length;
const actions = () => db.prepare('SELECT action FROM history').all().map(r => r.action);

// 1. Tapped Start then Stop two seconds later, having been put on the job by that tap.
let entry = seed({ startedAgoMs: 2000, assignWorkerAgoMs: 1900 });
let result = discardIfAccidentalTap('job:1', entry, actor);
assert.deepStrictEqual(result, { discarded: true, unassignedUserId: 'user:worker' }, 'accidental tap should discard and name the worker');
assert.strictEqual(blocks(), 0, 'the empty block should be gone');
assert.strictEqual(status(), 'OPEN', 'the job should go back to the status it was on before Start');
assert.deepStrictEqual(assignees(), ['user:mate'], 'only the worker this tap added comes off the job');
assert.ok(actions().includes('discard_timer'), 'the discard should be written to the trail');

// 2. Same tap, but the worker was already on the job beforehand — they stay on it.
entry = seed({ startedAgoMs: 2000, assignWorkerAgoMs: 86400000 });
result = discardIfAccidentalTap('job:1', entry, actor);
assert.strictEqual(result.unassignedUserId, null, 'someone assigned before the tap is left alone');
assert.deepStrictEqual(assignees().sort(), ['user:mate', 'user:worker'], 'both workers stay on the job');
assert.strictEqual(status(), 'OPEN', 'the status still goes back');

// 3. A real run of a few minutes is left completely alone.
entry = seed({ startedAgoMs: 5 * 60 * 1000, assignWorkerAgoMs: 5 * 60 * 1000 });
assert.strictEqual(discardIfAccidentalTap('job:1', entry, actor), null, 'a genuine run is not a tap');
assert.strictEqual(blocks(), 1, 'the block stays');
assert.strictEqual(status(), 'IN_PROGRESS', 'the status stays');
assert.deepStrictEqual(assignees().sort(), ['user:mate', 'user:worker'], 'nobody comes off the job');

// 4. A Start that moved nothing (job already In Progress) leaves the status where it is.
entry = seed({ startedAgoMs: 2000, assignWorkerAgoMs: 1900 });
db.prepare("UPDATE history SET changes = ? WHERE action = 'start_timer'")
  .run(JSON.stringify({ timer: { from: null, to: entry.start_time } }));
result = discardIfAccidentalTap('job:1', entry, actor);
assert.strictEqual(status(), 'IN_PROGRESS', 'no recorded status move means no status to put back');
assert.strictEqual(result.unassignedUserId, 'user:worker', 'the worker still comes off');

db.close(); // Windows won't remove the file while it's still open.
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
console.log('startTimerUndo: all checks passed');
