// Undo for an accidental Start/Stop tap.
//
// Pressing Start moves the job to In Progress and assigns the worker. If the timer is
// stopped again within seconds the block is discarded as an accident — so those two
// side effects have to go too, or an accidental tap silently changes the job's status
// and its worker list with nothing left to explain it.
//
// Both facts are read back from what the Start already wrote down: the status move from
// the Start's own trail entry, and the assignment from when the worker was put on the
// job. Nothing is held in memory between the two taps, so a restart in between changes
// nothing and there is no second copy of a fact the database already has.

const {
  jobcardQueries, jobAssigneeQueries, timeEntryQueries, historyQueries, recordHistory
} = require('../db/database');
const logger = require('./logger');

// A timer that ran for less than this is treated as an accidental start/stop tap.
const MIN_LOGGED_MS = 15 * 1000;

// Was this stop an accidental tap? If so the block is discarded rather than logged:
// it is removed, the Start's side effects are put back, and the reply that tells the
// screen to skip the fill-in form is returned. Returns null for a genuine run.
function discardIfAccidentalTap(jobcardId, entry, actor) {
  const ranMs = Date.now() - new Date(entry.start_time).getTime();
  if (!Number.isFinite(ranMs) || ranMs >= MIN_LOGGED_MS) return null;

  timeEntryQueries.delete.run(entry.id);

  // Put back what the Start changed, in history's { field: { from, to } } shape so it
  // folds into the discard entry below. Never throws — a failed undo must not fail the
  // discard. Deliberately does NOT recompute the automatic status: that would just
  // re-assert In Progress, the very thing the accidental tap left behind.
  const changes = {};
  let unassignedUserId = null;
  try {
    // The Start's own trail entry recorded the status move it made, if any.
    const logged = historyQueries.getStartTimer.get(jobcardId, entry.start_time);
    const status = logged && JSON.parse(logged.changes).status;
    // Only put the status back if nothing else has moved it since the Start.
    if (status && jobcardQueries.getById.get(jobcardId)?.status === status.to) {
      jobcardQueries.updateStatus.run(status.from, actor.userId, jobcardId);
      changes.status = { from: status.to, to: status.from };
    }

    // This Start put the worker on the job if their place on it is no older than the
    // block. Anyone assigned before that was already meant to be there.
    const before = jobAssigneeQueries.getByJobcard.all(jobcardId);
    const added = before.find(a => a.user_id === entry.user_id && a.assigned_at >= entry.start_time);
    if (added) {
      jobAssigneeQueries.delete.run(added.id);
      changes.assignees = {
        from: before.map(a => a.user_name).join(', ') || 'none',
        to: before.filter(a => a.id !== added.id).map(a => a.user_name).join(', ') || 'none'
      };
      // Name them back so an open job screen unticks them too — otherwise the next
      // Save would put them straight back.
      unassignedUserId = entry.user_id;
    }
  } catch (err) {
    logger.error({ err }, 'Undo of discarded start timer failed');
  }

  recordHistory('jobcard', jobcardId, 'discard_timer', actor.userId, actor.name || actor.username, {
    timer: { from: 'running', to: 'discarded (under 15s)' },
    ...changes
  }, { timeEntryId: entry.id, startTime: entry.start_time });

  return { discarded: true, unassignedUserId };
}

module.exports = { discardIfAccidentalTap };
