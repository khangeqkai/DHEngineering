const jobStatuses = require('./jobStatuses.json');

// Single source of truth for "may this actor move this job from fromStatus to
// toStatus?" — called by BOTH PATCH /jobcards/:id/status (the one status route a
// worker can reach) and PUT /jobcards/:id (management-only, but it still has to
// refuse Invoiced from a manager), and mirrored by the job screen (client side)
// so the rule can never drift between them. A no-op (status unchanged) is always
// allowed, for anyone. Invoiced is decided by actor.canInvoice alone. Takes an
// actor of already-resolved booleans { canManage, canInvoice } rather than a
// role, so this file never has to know what a role is.
function canSetStatus(actor, fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  if (toStatus === 'INVOICED') return actor.canInvoice;
  if (actor.canManage) return true;
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
// allows, minus Invoiced unless the actor holds the invoiceJob permission (admin)
// AND (per the job-card screen, which also has to cover creating a brand-new job)
// isEdit is true. Invoicing runs the missing-files check and auto-archive, which
// only happen on an existing job, so it's never offered while creating one.
// isEdit defaults to true because a list of existing jobs (the only other
// caller) never needs to say otherwise.
function offeredStatusValues(actor, currentStatus, isEdit = true) {
  const settable = settableStatusValues(actor.canManage, currentStatus);
  return jobStatuses.statuses
    .map((s) => s.value)
    .filter((value) => {
      if (settable && !settable.has(value)) return false;
      if (value === 'INVOICED') return actor.canInvoice && isEdit;
      return true;
    });
}

module.exports = { canSetStatus, canChangeStatus, settableStatusValues, offeredStatusValues };
