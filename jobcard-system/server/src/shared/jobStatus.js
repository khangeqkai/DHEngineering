const jobStatuses = require('./jobStatuses.json');

// Single source of truth for "may this actor move this job from fromStatus to
// toStatus?" — used by both the status-only route and the general job update
// route (server side) and mirrored by the job screen (client side) so the rule
// can never drift between any of them. A no-op (status unchanged) is always
// allowed, for anyone. Takes a boolean (already-resolved "is this actor
// management") rather than a role, so this file never has to know what a role
// is.
function canSetStatus(canManage, fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  if (canManage) return true;
  return jobStatuses.workerSettableStatuses.includes(toStatus) &&
    jobStatuses.workerStatusFrom.includes(fromStatus);
}

// Whether a non-management user may change the status at all, given where the
// job currently stands. Management can always change it (subject to their own
// checks elsewhere, e.g. never offering Invoiced on a new job).
function canChangeStatus(canManage, currentStatus) {
  return canManage || jobStatuses.workerStatusFrom.includes(currentStatus);
}

// The set of status values a non-management user may pick from, given the job's
// current status — the statuses they're allowed to set, plus whatever the job is
// sitting on right now (even if it isn't one of them), so a control listing these
// values always has the current value to show as selected. Returns null for a
// management user, meaning "no restriction — every status stays offered."
function settableStatusValues(canManage, currentStatus) {
  return canManage ? null : new Set([...jobStatuses.workerSettableStatuses, currentStatus]);
}

// The status values a status picker should offer: whatever settableStatusValues
// allows, minus Invoiced unless the actor is management AND (per the job-card
// screen, which also has to cover creating a brand-new job) isEdit is true.
// Invoicing runs the missing-files check and auto-archive, which only happen on
// an existing job, so it's never offered while creating one. isEdit defaults to
// true because a list of existing jobs (the only other caller) never needs to
// say otherwise.
function offeredStatusValues(canManage, currentStatus, isEdit = true) {
  const settable = settableStatusValues(canManage, currentStatus);
  return jobStatuses.statuses
    .map((s) => s.value)
    .filter((value) => {
      if (settable && !settable.has(value)) return false;
      if (value === 'INVOICED') return canManage && isEdit;
      return true;
    });
}

module.exports = { canSetStatus, canChangeStatus, settableStatusValues, offeredStatusValues };
