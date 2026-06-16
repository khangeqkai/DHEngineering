// Automatic, work-driven job status that always reflects the shop floor.
//
// Whenever work is logged on a job (a timer started or stopped, a time block added
// or its finished quantity edited), the job's status is recomputed:
//   - every line at (or over) its target quantity -> DONE
//   - otherwise                                   -> IN_PROGRESS
//
// This re-asserts on every work event, so it overrides a manual status change: if a
// manager moves a job elsewhere and a worker then logs work, it snaps straight back
// to DONE or IN_PROGRESS to match reality. The only status it never touches is
// INVOICED (terminal — the job is filed away). It no-ops when the status already
// matches. To deliberately hold a finished job in another state, the work itself must
// change (raise a quantity, add a part, or remove the logged pieces that met a
// target) — a bare status flip won't stick.
//
// It does NOT write its own history row. Instead it RETURNS the status change (or
// null), and the caller folds it into the history entry it already writes for the
// work event (start/stop timer, add/edit time block) — so one work action shows as
// one audit row carrying both the work change and the status move, never two adjacent
// rows where the status one reads like an unexplained manual edit.

const { jobcardQueries, jobItemQueries, timeEntryQueries } = require('../db/database');
const logger = require('./logger');

// Has every line on the job reached its required quantity? Sums the good pieces
// recorded against each line (finished time blocks only) and compares to the line's
// ordered quantity. A job with no lines is never "complete". Quantities are enforced
// on save to be positive whole numbers, so a line whose quantity is missing or zero
// can't be satisfied and blocks completion.
function isJobComplete(jobcardId) {
  const items = jobItemQueries.getByJobcard.all(jobcardId);
  if (items.length === 0) return false;

  const entries = timeEntryQueries.getByJobcard.all(jobcardId);
  const doneByItem = new Map();
  for (const e of entries) {
    if (!e.end_time) continue; // only finished work counts toward completion
    const n = parseInt(e.qty, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    doneByItem.set(e.item_id, (doneByItem.get(e.item_id) || 0) + n);
  }

  for (const item of items) {
    const target = parseInt(item.qty, 10);
    if (!Number.isFinite(target) || target <= 0) return false; // un-targeted line blocks DONE
    if ((doneByItem.get(item.id) || 0) < target) return false;
  }
  return true;
}

// Recompute and apply the work-driven status for a job, called after any work event.
// Returns the status change as { from, to } when it actually moved the job, or null
// when nothing changed (already correct, archived, invoiced, or it failed) — the
// caller folds a non-null result into the work event's own history entry. Never lets
// an auto-status failure break the work action that triggered it.
function syncStatusToWork(jobcardId, actor) {
  try {
    const job = jobcardQueries.getById.get(jobcardId);
    if (!job || job.archived === 1) return null;
    if (job.status === 'INVOICED') return null; // terminal — leave filed-away jobs alone

    const target = isJobComplete(jobcardId) ? 'DONE' : 'IN_PROGRESS';
    if (job.status === target) return null; // already correct — don't re-write

    jobcardQueries.updateStatus.run(target, actor.userId, jobcardId);
    return { from: job.status, to: target };
  } catch (err) {
    logger.error({ err }, 'Auto status sync failed');
    return null;
  }
}

module.exports = { isJobComplete, syncStatusToWork };
