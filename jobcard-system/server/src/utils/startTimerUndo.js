// Undo for an accidental Start/Stop tap.
//
// Pressing Start assigns the worker to the job. If the timer is stopped again within
// seconds the block is discarded as an accident — so that side effect has to go too, or
// an accidental tap silently changes the job's worker list with nothing left to explain it.
//
// The assignment is read back from when the worker was put on the job. Nothing is held
// in memory between the two taps, so a restart in between changes nothing and there is
// no second copy of a fact the database already has.

const {
  db, jobAssigneeQueries, timeEntryQueries, recordHistory
} = require('../db/database');
const logger = require('./logger');
const { assigneeNames } = require('./historyChanges');
const { runContext } = require('./timeEntryHelpers');
const { displayName } = require('../shared/names');

// A timer that ran for less than this is treated as an accidental start/stop tap.
const MIN_LOGGED_MS = 15 * 1000;

// Was this stop an accidental tap? If so the block is discarded rather than logged:
// it is removed, the Start's side effects are put back, and the reply that tells the
// screen to skip the fill-in form is returned. Returns null for a genuine run.
function discardIfAccidentalTap(jobcardId, entry, actor) {
  const ranMs = Date.now() - new Date(entry.start_time).getTime();
  // A negative span — a block whose start is still ahead of this clock, from a PC
  // clock that runs fast — counts as a tap too: saving it would record a finish
  // before its start. A start far in the future is refused when the block is
  // entered (validation.js), so only clock drift ever reaches here.
  if (!Number.isFinite(ranMs) || ranMs >= MIN_LOGGED_MS) return null;

  // The discard, what it puts back and its trail entry commit together.
  return db.transaction(() => {
    timeEntryQueries.delete.run(entry.id);

    // Put back what the Start changed, in history's { field: { from, to } } shape so it
    // folds into the discard entry below. Never throws — a failed undo must not fail the
    // discard.
    const changes = {};
    let unassignedUserId = null;
    try {
      // The undo is all-or-nothing within the discard (a savepoint).
      db.transaction(() => {
        // This Start put the worker on the job if their place on it is no older than the
        // block. Anyone assigned before that was already meant to be there.
        const before = jobAssigneeQueries.getByJobcard.all(jobcardId);
        const added = before.find(a => a.user_id === entry.user_id && a.assigned_at >= entry.start_time);
        if (added) {
          jobAssigneeQueries.delete.run(added.id);
          changes.assignees = {
            from: assigneeNames(before),
            to: assigneeNames(before.filter(a => a.id !== added.id))
          };
          // Name them back so an open job screen unticks them too — otherwise the next
          // Save would put them straight back.
          unassignedUserId = entry.user_id;
        }
      })();
    } catch (err) {
      logger.error({ err }, 'Undo of discarded start timer failed');
      // Nothing of the undo stuck, so the discard entry mustn't claim any of it.
      for (const k of Object.keys(changes)) delete changes[k];
      unassignedUserId = null;
    }

    recordHistory('jobcard', jobcardId, 'discard_timer', actor.userId, displayName(actor), {
      timer: { from: 'running', to: 'discarded (under 15s)' },
      ...changes
    }, { timeEntryId: entry.id, startTime: entry.start_time, ...runContext(entry) });

    return { discarded: true, unassignedUserId };
  })();
}

module.exports = { discardIfAccidentalTap };
