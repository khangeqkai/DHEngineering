// Tag-based options are now loaded dynamically from the database via useTags hook.
// These legacy exports are kept as empty fallbacks — components should use useTags() instead.

export const PRIORITY_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'SAME_DAY', label: 'Same Day Service' }
];

export const STATUS_OPTIONS = [
  { value: 'QUOTE', label: 'Quote' },
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_MATERIAL', label: 'Material/Service' },
  { value: 'PO_REQUESTED', label: 'PO Requested' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
  { value: 'CUST_NOTIFIED', label: 'Cust. Notified' },
  { value: 'INVOICED', label: 'Invoiced' }
];

export const QA_FORM_OPTIONS = [
  { code: 'DHE-F39', name: 'Critical QA Inspection Form' },
  { code: 'DHE-F15', name: 'First Article Inspection' },
  { code: 'DHE-F09', name: 'Material Test Certificate' },
  { code: 'DHE-F43', name: 'Non-Conformance Report' }
];

// Mirrors the server-side rule (canSetStatus in server/src/middleware/auth.js; there is no
// shared import path between client and server, so the two lists are kept in step
// by hand): a non-management user may only set a job to In Progress or
// Material/Service, and only while the job is currently Open, In Progress or
// Material/Service — everything else (moving it further, or touching it from any
// other status) is management-only. In Progress and Done are driven by logged
// work automatically; a worker only needs to flag "waiting on material" and clear
// it again.
export const WORKER_SETTABLE_STATUSES = ['IN_PROGRESS', 'AWAITING_MATERIAL'];
export const WORKER_STATUS_FROM = ['OPEN', 'IN_PROGRESS', 'AWAITING_MATERIAL'];

// Whether a non-management user may change the status at all, given where the job
// currently stands. Management can always change it (subject to their own checks
// elsewhere, e.g. never offering Invoiced on a new job).
export const canChangeStatus = (canManage, currentStatus) =>
  canManage || WORKER_STATUS_FROM.includes(currentStatus);

// The set of status values a non-management user may pick from, given the job's
// current status — the statuses they're allowed to set, plus whatever the job is
// sitting on right now (even if it isn't one of them), so a control listing these
// values always has the current value to show as selected. Returns null for a
// management user, meaning "no restriction — every status stays offered."
export const getSettableStatusValues = (canManage, currentStatus) =>
  canManage ? null : new Set([...WORKER_SETTABLE_STATUSES, currentStatus]);
