export const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_MATERIAL', label: 'Material/Treatment' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'OVERDUE', label: 'Overdue' }
];

export const STATUS_LABELS = {
  QUOTE: 'Quote',
  OPEN: 'Open',
  AWAITING_MATERIAL: 'Material/Treatment',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  INVOICED: 'Invoiced'
};

export const PRIORITY_LABELS = { NONE: 'None', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const PAGE_SIZE = 50;

export const DEFAULT_COLUMN_ORDER = [
  'jobNumber',
  'description',
  'company',
  'customer',
  'assignedTo',
  'status',
  'latestNote',
  'priority',
  'attachments',
  'dueDate',
  'createdAt',
  'updatedAt',
  'actions'
];

// Every column except the job number can be hidden — the job number is the
// click-through to open a job, so it always stays visible.
export const HIDEABLE_COLUMN_IDS = DEFAULT_COLUMN_ORDER.filter(id => id !== 'jobNumber');

// Keep only known hideable ids, de-duped. Drops anything unknown or jobNumber so a
// stale/garbage saved value can never hide the job number or a column that's gone.
export const normalizeHiddenColumns = (saved) => {
  if (!Array.isArray(saved)) return [];
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

// Normalize a status value (e.g. 'AWAITING_MATERIAL') into its color-class token
// (e.g. 'awaiting-material'). Shared by every screen that colors a job status.
export const statusToken = (status) => (status || '').toLowerCase().replace(/_/g, '-');

export const getStatusBadgeClass = (status) => (status ? `status-${statusToken(status)}` : '');
