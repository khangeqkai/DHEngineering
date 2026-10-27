// A forgotten clock stops itself — the roll.
//
// A running timer is an open time_entries row. A clock may be started at any time, but
// one left running past the end of normal hours (the company's overtime grid leaves
// `normal`, or a public holiday begins) is cut automatically: the row is finished and
// flagged finish_unconfirmed, and its worker is asked at next sign-in when they really
// finished (routes/jobcard-time-entries.js). One cut per row, no loop:
//   - a start inside a normal window is cut where that window closes;
//   - a start outside normal hours that runs into normal hours the same office day (an
//     early start) is cut where that next window closes;
//   - any other start outside normal hours is cut at midnight, and the row is stored with
//     its finish equal to its start (zero length): the real finish is not known, so
//     nothing is billed until the worker answers.
// With an all-normal grid and no holidays nothing ever closes, so the roll does nothing.
//
// Blocks the office opened by hand (auto_stop_exempt) are never cut: hand-entered time is
// never touched.
//
// Nothing runs on a timer of its own: the roll is called when the server boots, on every
// API request (index.js, before any route runs, at most once a second — see
// rollOpenTimersForRequest). A cut
// that was missed (server off over a weekend) is caught up on the next call, stored at the
// same moment it would have been.
//
// Calling it on every request is cheap (and a request-driven call is limited to once a second): the open clocks are always read fresh, but the
// company's rules (and each clock's cut moment worked out from them) are remembered
// for up to a minute, but the rules are always re-read, once per call, before any clock is
// cut and that clock's cut moment is checked again, so a clock is never cut on stale rules. Saving the schedule, holidays or
// time zone calls forgetRollCache, so a rule change is seen on the very next roll.
//
// A clock whose cut keeps throwing is not retried on every roll: its entry remembers a
// retry moment a minute ahead (FAILED_CUT_RETRY_MS) and the row is left alone until then.

const logger = require('./logger');
const { db, timeEntryQueries, recordHistory } = require('../db/database');
const { readOpeningRules, windowAt, nextOpening, officeDayEndAfter } = require('./openingHours');
const { criticalAtFinishForWrite, runContext } = require('./timeEntryHelpers');

// How long the company's rules are remembered between rolls before being read again.
const RULES_MEMORY_MS = 60 * 1000;

// How long a clock whose cut threw is left alone before the cut is tried again (real clock).
const FAILED_CUT_RETRY_MS = 60 * 1000;

// Each open block's cut moment, remembered between rolls: { startTime, key, cut,
// retryAtMs? } by row id (cut is { cutMs, finishMs, zeroLength }; retryAtMs is set only
// while a failed cut is backing off). Working it out walks the calendar day by day (up to 60 days
// when normal hours never end), and the roll runs on every poll of the running clock,
// so it is worked out once per block and again only when the block's start or the
// company's rules change (the key).
let cutCache = new Map();

// The company's rules as last read, their serialised form (the cut-cache key) and when
// they were read (real clock, not the roll's `nowMs`).
let rulesCache = null; // { rules, key, readAtMs }

function forgetRollCache() {
  cutCache = new Map();
  rulesCache = null;
}

// When a block is cut and what finish it is stored with, or null when it never is.
function cutFor(row, rules) {
  const startMs = Date.parse(row.start_time);
  if (!Number.isFinite(startMs)) return null;

  const win = windowAt(startMs, rules);
  if (win) return { cutMs: win.closeMs, finishMs: win.closeMs, zeroLength: false };

  const opening = nextOpening(startMs, rules);
  const dayEnd = officeDayEndAfter(startMs, rules);
  if (opening !== null && opening < dayEnd) {
    const next = windowAt(opening, rules);
    if (next) return { cutMs: next.closeMs, finishMs: next.closeMs, zeroLength: false };
  }
  return { cutMs: dayEnd, finishMs: startMs, zeroLength: true };
}

// Cut one open block if its cut moment has passed. Runs inside its own transaction.
function rollRow(row, cut, nowMs) {
  // Infinity: normal hours never end, so the clock is never cut.
  if (!cut || !Number.isFinite(cut.cutMs) || nowMs < cut.cutMs) return;

  const criticalAtFinish = criticalAtFinishForWrite(row.jobcard_id, row, true);
  timeEntryQueries.finishUnconfirmed.run(new Date(cut.finishMs).toISOString(), criticalAtFinish, row.id);
  recordHistory('jobcard', row.jobcard_id, 'auto_stop_timer', row.user_id, row.user_name, {
    timer: {
      from: 'running',
      to: cut.zeroLength ? 'stopped at midnight — finish time not known' : 'stopped at the end of normal hours'
    }
  }, { timeEntryId: row.id, startTime: row.start_time, ...runContext(row) });
}

const rollRowInTransaction = db.transaction(rollRow);

// Bring every open block up to `nowMs`. Each block is handled by itself, so one that
// fails is logged and skipped without holding up the others.
// The rules are remembered between calls, but a clock is never cut on remembered rules:
// before any cut the rules are read afresh (once per call at most) and that row's cut
// moment is checked again against them. Rows whose cut is not due cost a map lookup.
// A row whose cut throws is logged and backed off for FAILED_CUT_RETRY_MS: its remembered
// entry carries retryAtMs, and until then later rolls skip it before any rules read or cut
// attempt. A changed start or rules key discards the entry (and so the back-off), as does
// forgetRollCache; a success needs nothing, the row is no longer open.
// Never throws: a failed roll is logged and the request carries on.
function rollOpenTimers(nowMs = Date.now()) {
  try {
    const rows = timeEntryQueries.getAllOpen.all();
    if (rows.length === 0) {
      cutCache = new Map();
      return;
    }
    let fresh = false; // rules read afresh during this call
    const readFresh = () => {
      const rules = readOpeningRules();
      rulesCache = { rules, key: JSON.stringify(rules), readAtMs: Date.now() };
      fresh = true;
    };
    if (!rulesCache || Date.now() - rulesCache.readAtMs >= RULES_MEMORY_MS) readFresh();

    // The remembered cut for a row, worked out again when the row's start or the rules changed.
    const entryFor = (row) => {
      const entry = cutCache.get(row.id);
      if (entry && entry.startTime === row.start_time && entry.key === rulesCache.key) return entry;
      return { startTime: row.start_time, key: rulesCache.key, cut: cutFor(row, rulesCache.rules) };
    };
    const isDue = (cut) => !!cut && Number.isFinite(cut.cutMs) && nowMs >= cut.cutMs;

    const seen = new Map();
    for (const row of rows) {
      let entry;
      try {
        entry = entryFor(row);
        if (entry.retryAtMs !== undefined && Date.now() < entry.retryAtMs) {
          seen.set(row.id, entry);
          continue;
        }
        if (isDue(entry.cut)) {
          // Never cut on remembered rules: read them afresh (once per call) and re-judge this row.
          if (!fresh) {
            readFresh();
            entry = entryFor(row);
          }
          if (isDue(entry.cut)) {
            rollRowInTransaction(row, entry.cut, nowMs);
          }
        }
        seen.set(row.id, entry);
      } catch (err) {
        logger.error({ err, timeEntryId: row.id }, 'Forgotten-clock roll failed for one block');
        // Back off: keep the entry (when it was worked out) so the next rolls skip this row for a while.
        if (entry) {
          seen.set(row.id, { startTime: entry.startTime, key: entry.key, cut: entry.cut, retryAtMs: Date.now() + FAILED_CUT_RETRY_MS });
        }
      }
    }
    // Only blocks still open are kept.
    cutCache = seen;
  } catch (err) {
    logger.error({ err }, 'Forgotten-clock roll failed');
  }
}

// Every signed-in screen polls every few seconds, and a clock is cut at a whole hour, so a
// second's lag is invisible while the cost stops growing with clients x polls.
const REQUEST_ROLL_MIN_GAP_MS = 1000;
let lastRequestRollMs = 0;

// The per-request roll: rollOpenTimers, unless one ran less than a second ago (real clock).
function rollOpenTimersForRequest() {
  const now = Date.now();
  if (now - lastRequestRollMs < REQUEST_ROLL_MIN_GAP_MS) return;
  lastRequestRollMs = now;
  rollOpenTimers();
}

// Whether a clock with this row's start would be cut at `nowMs` under freshly read rules.
// Reads the rules afresh and writes no cache.
function cutIsDue(row, nowMs) {
  const cut = cutFor(row, readOpeningRules());
  return !!cut && Number.isFinite(cut.cutMs) && nowMs >= cut.cutMs;
}

module.exports = { rollOpenTimers, rollOpenTimersForRequest, cutIsDue, forgetRollCache };
