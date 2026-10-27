// The job status list, its groups, the priority list and who may set each status all come from one
// shared data file in the server folder (so the packaged app, which copies the
// whole server folder, carries it) — see server/src/shared/jobStatuses.json.
// This is the only place the client imports it from; every export below just
// re-shapes that one file's data, so adding/renaming a status or priority is a
// one-file edit.
import jobStatuses from '../../../../server/src/shared/jobStatuses.json';
import { offeredStatusValues } from '../../../../server/src/shared/jobStatus';

export const PRIORITY_OPTIONS = jobStatuses.priorities;

export const STATUS_OPTIONS = jobStatuses.statuses;

// One workflow order for statuses, derived from STATUS_OPTIONS so every table
// that sorts a status column (job list, search, statistics) agrees with it.
export const STATUS_SORT_ORDER = Object.fromEntries(STATUS_OPTIONS.map((s, i) => [s.value, i]));

// Priorities sort lowest to highest, in the order the shared list gives them.
export const PRIORITY_SORT_ORDER = Object.fromEntries(PRIORITY_OPTIONS.map((p, i) => [p.value, i]));

// Statuses where the work is finished as far as the shop is concerned.
export const SETTLED_STATUSES = jobStatuses.settledStatuses;

// The few statuses the screens treat specially, named once in the shared file.
export const DEFAULT_STATUS = jobStatuses.defaultStatus;
export const CLOSED_STATUS = jobStatuses.closedStatus;
// To be Invoiced, Call for Payment, Paid – Archived: the moves with billing checks.
export const BILLING_STATUSES = jobStatuses.billingStatuses;
export const ALERT_STATUS = jobStatuses.alertStatus;

// The headings the status drop-downs group their rows under, in list order.
export const STATUS_GROUPS = jobStatuses.groups;
export const STATUS_GROUP_OF = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.group]));

// The given status values (already filtered to what the person may pick) laid out
// under their headings, in list order: [{ group, label, options: [{ value, label }] }].
// A heading with nothing left under it is dropped.
export function groupStatusOptions(values) {
  const offered = new Set(values);
  return STATUS_GROUPS
    .map(g => ({
      group: g.value,
      label: g.label,
      options: STATUS_OPTIONS.filter(s => s.group === g.value && offered.has(s.value))
    }))
    .filter(g => g.options.length > 0);
}

// What a status drop-down shows, for both the job list's popover and the job screen's
// menu: the offered statuses under their headings, plus — on a job sitting on Action
// Required that remembers where it was — a "Put back to …" row at the top, when the
// person may move it back there. actor is { canManage, canInvoice }.
export function statusMenuModel(actor, status, previousStatus, isEdit = true) {
  const offered = offeredStatusValues(actor, status, isEdit, previousStatus);
  const putBack = status === ALERT_STATUS && previousStatus && previousStatus !== status && offered.includes(previousStatus)
    ? STATUS_OPTIONS.find(s => s.value === previousStatus) || null
    : null;
  return { putBack, groups: groupStatusOptions(offered) };
}
