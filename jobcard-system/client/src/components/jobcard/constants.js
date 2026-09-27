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

// Priorities sort lowest to highest, in the order the shared list gives them.
export const PRIORITY_SORT_ORDER = Object.fromEntries(PRIORITY_OPTIONS.map((p, i) => [p.value, i]));

// Statuses where the work is finished as far as the shop is concerned.
export const SETTLED_STATUSES = jobStatuses.settledStatuses;

export const QA_FORM_OPTIONS = [
  { code: 'DHE-F39', name: 'Critical QA Inspection Form' },
  { code: 'DHE-F15', name: 'First Article Inspection' },
  { code: 'DHE-F09', name: 'Material Test Certificate' },
  { code: 'DHE-F43', name: 'Non-Conformance Report' }
];
