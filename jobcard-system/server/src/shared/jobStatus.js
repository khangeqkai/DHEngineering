const jobStatuses = require('./jobStatuses.json');

const STATUS_BY_VALUE = Object.fromEntries(jobStatuses.statuses.map((s) => [s.value, s]));

// Whether an actor of already-resolved booleans { canManage, canInvoice } reaches
// a level named in jobStatuses.json: 'everyone', 'management' (admin or manager)
// or 'admin' (the invoiceJob permission — every billing decision sits with the
// person who can see the numbers). An unknown status has no level and is refused,
// so a stale or mistyped value can never be moved into or out of by accident.
function meetsLevel(actor, level) {
  if (level === 'everyone') return true;
  if (level === 'management') return Boolean(actor.canManage);
  if (level === 'admin') return Boolean(actor.canInvoice);
  return false;
}

function setLevel(status) {
  return STATUS_BY_VALUE[status]?.setBy;
}

// Taking a job out of a status needs the same level as putting it there, unless
// the status says otherwise (To be Costed: a manager hands a job over, only an
// admin moves it on).
function leaveLevel(status) {
  const s = STATUS_BY_VALUE[status];
  return s ? (s.leaveBy || s.setBy) : undefined;
}

// Whether the actor may take a job out of where it is. Action Required is a flag laid
// over the status the job really has (the one it remembers, previousStatus): taking the
// flag off needs whatever leaving that status needs too, so the office flagging a
// billed job never opens a side door for a worker to move it on.
function canLeave(actor, fromStatus, previousStatus) {
  if (!meetsLevel(actor, leaveLevel(fromStatus))) return false;
  if (fromStatus === jobStatuses.alertStatus && previousStatus) {
    return meetsLevel(actor, leaveLevel(previousStatus));
  }
  return true;
}

// Single source of truth for "may this actor move this job from fromStatus to
// toStatus?" — called by BOTH PATCH /jobcards/:id/status and PUT /jobcards/:id,
// and mirrored by the job list and the job screen so the rule can never drift
// between them. A no-op (status unchanged) is always allowed, for anyone. A move
// needs permission at both ends: the actor must be allowed to take the job out of
// where it is AND to put it where it's going — so a worker can't pull a job out
// of Quote Sent or Call for Payment, and a manager can't move one on from To be
// Costed. previousStatus is what the job remembers (see canLeave). A new job
// (fromStatus null) needs only the target end. Takes resolved booleans rather than
// a role, so this file never has to know what a role is.
function canSetStatus(actor, fromStatus, toStatus, previousStatus = null) {
  if (fromStatus === toStatus) return true;
  // No fromStatus: a brand-new job being created — only the target end applies.
  const leaveOk = fromStatus == null || canLeave(actor, fromStatus, previousStatus);
  return leaveOk && meetsLevel(actor, setLevel(toStatus));
}

// Whether the actor may change the status at all, given where the job stands now.
// A job not created yet (isEdit false) can always be picked for: the status it shows
// is only the form's starting pick (Open), not somewhere the job stands, so picking To
// be Costed by mistake must not lock a manager out of picking again before Create.
// Same argument order as offeredStatusValues below.
function canChangeStatus(actor, currentStatus, isEdit = true, previousStatus = null) {
  if (!currentStatus || !isEdit) return true;
  return canLeave(actor, currentStatus, previousStatus);
}

// The status values a status picker should offer, in list order: the one the job
// sits on now (so the control always has its current value to show as selected)
// plus every status the actor may move it to. The billing statuses are never
// offered while creating a job (isEdit false): their checks (time, files, sign-off,
// PO number) and the invoiced date belong to a move of an existing job, and the
// server refuses a new job on one. A job not created yet is judged as having no status
// (only the target end, as the server judges its create), so the form's current pick
// never limits the next one. isEdit defaults to true because a list of existing jobs
// (the only other caller) never needs to say otherwise.
function offeredStatusValues(actor, currentStatus, isEdit = true, previousStatus = null) {
  return jobStatuses.statuses
    .map((s) => s.value)
    .filter((value) => {
      if (value === currentStatus) return true;
      if (!isEdit && jobStatuses.billingStatuses.includes(value)) return false;
      return isEdit
        ? canSetStatus(actor, currentStatus, value, previousStatus)
        : canSetStatus(actor, null, value);
    });
}

// The status a job really stands on: Action Required is a flag laid over the status
// the job remembers, so a flagged job still counts as finished, billed or live by that
// one (the overdue mark, Workshop Statistics). A flag with nothing remembered stands on
// itself, as a live job.
function standingStatus(status, previousStatus) {
  return status === jobStatuses.alertStatus && previousStatus ? previousStatus : status;
}

module.exports = { canSetStatus, canChangeStatus, offeredStatusValues, standingStatus };
