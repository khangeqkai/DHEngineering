// Tag-based options are now loaded dynamically from the database via useTags hook.
// These legacy exports are kept as empty fallbacks — components should use useTags() instead.

// The job status list, priority list and worker-status rule all come from one
// shared data file in the server folder (so the packaged app, which copies the
// whole server folder, carries it) — see server/src/shared/jobStatuses.json.
// This is the only place the client imports it from; every export below just
// re-shapes that one file's data, so adding/renaming a status or priority is a
// one-file edit.
import jobStatuses from '../../../../server/src/shared/jobStatuses.json';

export const PRIORITY_OPTIONS = jobStatuses.priorities;

export const STATUS_OPTIONS = jobStatuses.statuses;

// One workflow order for statuses, derived from STATUS_OPTIONS so every table
// that sorts a status column (job list, search, statistics) agrees with it.
export const STATUS_SORT_ORDER = Object.fromEntries(STATUS_OPTIONS.map((s, i) => [s.value, i]));

export const QA_FORM_OPTIONS = [
  { code: 'DHE-F39', name: 'Critical QA Inspection Form' },
  { code: 'DHE-F15', name: 'First Article Inspection' },
  { code: 'DHE-F09', name: 'Material Test Certificate' },
  { code: 'DHE-F43', name: 'Non-Conformance Report' }
];

// Mirrors the server-side rule (canSetStatus in server/src/middleware/auth.js),
// from the same shared jobStatuses.json: a non-management user may only set a
// job to In Progress or Material/Service, and only while the job is currently
// Open, In Progress or Material/Service — everything else (moving it further,
// or touching it from any other status) is management-only. In Progress and
// Done are driven by logged work automatically; a worker only needs to flag
// "waiting on material" and clear it again.
export const WORKER_SETTABLE_STATUSES = jobStatuses.workerSettableStatuses;
export const WORKER_STATUS_FROM = jobStatuses.workerStatusFrom;

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
