import { PRIORITY_OPTIONS, STATUS_OPTIONS as JOB_STATUS_OPTIONS, SETTLED_STATUSES, STATUS_GROUPS, STATUS_GROUP_OF, ALERT_STATUS } from './jobcard/constants';
import { standingStatus } from '../../../server/src/shared/jobStatus';

// The job list's filter buttons (active view only — the archived view has none):
// All, Action Required, one button per status group, then the list-only Overdue
// filter. Sixteen single statuses don't fit on one row; the Search page still
// filters by each one. The Closed group is left out — Paid – Archived always files
// a job away, so that button could only ever show an empty list — and so is the
// Alert group, which is the Action Required button itself.
export const ACTIVE_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: ALERT_STATUS, label: JOB_STATUS_OPTIONS.find(s => s.value === ALERT_STATUS).label },
  ...STATUS_GROUPS.filter(g => g.value !== 'closed' && g.value !== 'alert'),
  { value: 'OVERDUE', label: 'Overdue' }
];

// Whether one job card shows under the chosen filter button.
export const matchesStatusFilter = (card, filter, today) => {
  if (filter === 'all') return true;
  if (filter === 'OVERDUE') return isJobOverdue(card.dueDate, card.status, card.previousStatus, today);
  if (filter === ALERT_STATUS) return card.status === ALERT_STATUS;
  return STATUS_GROUP_OF[card.status] === filter;
};

// What the empty-list message calls a filter button.
export const FILTER_LABELS = Object.fromEntries(ACTIVE_FILTER_OPTIONS.map(o => [o.value, o.label]));

export const STATUS_LABELS = Object.fromEntries(JOB_STATUS_OPTIONS.map(s => [s.value, s.label]));

// Derived from the one list of priorities the job screen offers, so adding a priority
// in that list alone names it everywhere the app shows a priority.
export const PRIORITY_LABELS = Object.fromEntries(PRIORITY_OPTIONS.map(p => [p.value, p.label]));

export const PAGE_SIZE = 50;

export const DEFAULT_COLUMN_ORDER = [
  'jobNumber',
  'timer',
  'description',
  'company',
  'customer',
  'assignedTo',
  'status',
  'latestNote',
  'priority',
  'attachments',
  'print',
  'dueDate',
  'createdAt',
  'updatedAt',
  'actions'
];

// Columns hidden for someone who has never chosen their own set. A saved choice
// (even an empty one) always wins, so changing this never resets anyone's layout.
export const DEFAULT_HIDDEN_COLUMNS = ['timer', 'customer', 'latestNote', 'print', 'createdAt', 'updatedAt'];

// Every column except the job number can be hidden — the job number is the
// click-through to open a job, so it always stays visible.
export const HIDEABLE_COLUMN_IDS = DEFAULT_COLUMN_ORDER.filter(id => id !== 'jobNumber');

// Keep only known hideable ids, de-duped. Drops anything unknown or jobNumber so a
// stale/garbage saved value can never hide the job number or a column that's gone.
export const normalizeHiddenColumns = (saved) => {
  if (!Array.isArray(saved)) return [...DEFAULT_HIDDEN_COLUMNS];
  const seen = new Set();
  const out = [];
  for (const id of saved) {
    if (HIDEABLE_COLUMN_IDS.includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
};

// Folds any column the saved order doesn't know about into it, dropped in the
// place it sits by default (right after the column it normally follows) rather
// than tacked on the end — so someone who once dragged their columns around
// still gets a new column where it was designed to go, not lost at the far
// right. A new first column, or one whose neighbours were all hidden away,
// falls back to the front. The row buttons always end up last, whatever the
// saved order says — a new column must never land to the right of them.
export const mergeColumnOrder = (saved) => {
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_COLUMN_ORDER;
  const missing = DEFAULT_COLUMN_ORDER.filter(c => !saved.includes(c));
  if (missing.length === 0) return saved;

  const merged = [...saved];
  for (const id of missing) {
    const defaultIdx = DEFAULT_COLUMN_ORDER.indexOf(id);
    let insertAt = 0;
    for (let i = defaultIdx - 1; i >= 0; i--) {
      const anchor = merged.indexOf(DEFAULT_COLUMN_ORDER[i]);
      if (anchor !== -1) {
        insertAt = anchor + 1;
        break;
      }
    }
    merged.splice(insertAt, 0, id);
  }

  const actionsIdx = merged.indexOf('actions');
  if (actionsIdx !== -1 && actionsIdx !== merged.length - 1) {
    merged.splice(actionsIdx, 1);
    merged.push('actions');
  }
  return merged;
};

// Normalize a status value (e.g. 'HOLD_MATERIAL') into its color-class token
// (e.g. 'hold-material'). Shared by every screen that colors a job status.
export const statusToken = (status) => (status || '').toLowerCase().replace(/_/g, '-');

// Same treatment for priority, so a multi-word value like SAME_DAY yields the class
// suffix `same-day` instead of an underscored one.
export const priorityToken = (priority) => (priority || '').toLowerCase().replace(/_/g, '-');

export const getStatusBadgeClass = (status) => (status ? `status-${statusToken(status)}` : '');

// A job past its due date is only late while there is still something to do. Once the
// work is finished — done, ready to collect or deliver, or in costing and billing —
// the date has been met as far as the shop is concerned and the row stops going red.
// One rule, shared by the list, the table and the job screen, so the three can never
// disagree about which jobs are late. Dates are plain YYYY-MM-DD, so a string compare
// is the whole comparison. The settled statuses themselves come from the one shared
// jobStatuses.json (also read by statistics-helpers.js's FINISHED_STATUSES).

// A job flagged Action Required is judged by the status it remembers (standingStatus),
// so flagging a finished job never turns its row red.
export const isJobOverdue = (dueDate, status, previousStatus, today) =>
  Boolean(dueDate && String(dueDate).trim() && dueDate < today
    && !SETTLED_STATUSES.includes(standingStatus(status, previousStatus)));
