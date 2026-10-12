// When normal hours are. An hour is open when its tier on the company's weekly overtime
// grid is `normal` and its date is not a public holiday. utils/timerPause.js uses these
// windows to finish a forgotten running block when normal hours end.
//
// Everything here is pure: the functions take a `rules` object
// `{ schedule, holidays, timezone }` — exactly what readOvertimeSettings() returns,
// the COMPANY's live schedule (not a job's captured copy) — and never read the
// database. readOpeningRules is the one function that builds that object.
// Hour edges are built with the office-clock helpers in officeTime.js, so a
// daylight-saving changeover day opens and closes at the right instants.

const { DAYS, DEFAULT_DAY, cleanDayBlocks, gridFromBlocks } = require('../shared/overtimeSchedule');
const { officeDateString, wallClockToIso, makeOfficeFormatter } = require('./officeTime');
const { readOvertimeSettings } = require('./overtimeSettings');

const DAY_MS = 24 * 60 * 60 * 1000;
// How far a scan looks before giving up: no closing within this many days means the
// clock is never cut; no opening within it means there is nothing to wait for.
const LOOKAHEAD_DAYS = 60;

const pad2 = (n) => String(n).padStart(2, '0');

// The 'YYYY-MM-DD' that is `n` days after another (calendar arithmetic, no clock).
function addDays(dateStr, n) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

// One office-local calendar day's open stretches as [{ startMs, endMs, fromStart, toEnd }],
// where fromStart / toEnd say the stretch touches midnight at that end (so it may carry
// on into the neighbouring day). Only the stretch edges are converted to instants, not
// every hour. A holiday has none.
function dayRuns(dateStr, rules) {
  if (rules.holidays.includes(dateStr)) return [];
  const weekday = DAYS[(new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7];
  const blocks = cleanDayBlocks(rules.schedule[weekday]);
  const grid = gridFromBlocks(blocks.length ? blocks : DEFAULT_DAY);
  const edge = (hour) => hour === 24
    ? Date.parse(wallClockToIso(`${addDays(dateStr, 1)}T00:00`, rules.timezone))
    : Date.parse(wallClockToIso(`${dateStr}T${pad2(hour)}:00`, rules.timezone));
  const runs = [];
  let from = null;
  for (let h = 0; h <= 24; h++) {
    const open = h < 24 && grid[h] === 'normal';
    if (open && from === null) from = h;
    if (!open && from !== null) {
      const startMs = edge(from);
      const endMs = edge(h);
      // A changeover can squash an hour to nothing; such a stretch holds no time.
      if (endMs > startMs) runs.push({ startMs, endMs, fromStart: from === 0, toEnd: h === 24 });
      from = null;
    }
  }
  return runs;
}

// The open window an instant falls inside — { closeMs }, the moment that window ends
// (the instant is before it) — else null. A window is a maximal contiguous stretch of open hours, so one
// running across midnight is merged across the day boundary. When no closing is found
// within 60 days (an all-normal week with no holidays) closeMs is Infinity: the clock
// is never cut.
function windowAt(ms, rules) {
  const dateStr = officeDateString(new Date(ms), makeOfficeFormatter(rules.timezone));
  const run = dayRuns(dateStr, rules).find(r => r.startMs <= ms && ms < r.endMs);
  if (!run) return null;

  let closeMs = run.endMs;
  let toEnd = run.toEnd;
  for (let i = 1; toEnd; i++) {
    if (i > LOOKAHEAD_DAYS) { closeMs = Infinity; break; }
    const next = dayRuns(addDays(dateStr, i), rules).find(r => r.fromStart);
    if (!next) break;
    closeMs = next.endMs;
    toEnd = next.toEnd;
  }
  return { closeMs };
}

// The start of the first open hour at or after `ms`, or null when none begins within
// 60 days.
function nextOpening(ms, rules) {
  const today = officeDateString(new Date(ms), makeOfficeFormatter(rules.timezone));
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const run = dayRuns(addDays(today, i), rules).find(r => r.startMs >= ms);
    if (run) return run.startMs;
  }
  return null;
}

// The instant the office-local calendar day containing `ms` ends (the next midnight).
function officeDayEndAfter(ms, rules) {
  const dateStr = officeDateString(new Date(ms), makeOfficeFormatter(rules.timezone));
  return Date.parse(wallClockToIso(`${addDays(dateStr, 1)}T00:00`, rules.timezone));
}

// The live rules: the company's schedule, public holidays and office time zone. The
// only function here that touches the database.
function readOpeningRules() {
  const { schedule, holidays, timezone } = readOvertimeSettings();
  return { schedule, holidays, timezone };
}

module.exports = { windowAt, nextOpening, officeDayEndAfter, readOpeningRules };
