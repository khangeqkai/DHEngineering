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

export const mergeColumnOrder = (saved) => {
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_COLUMN_ORDER;
  const missing = DEFAULT_COLUMN_ORDER.filter(c => !saved.includes(c));
  if (missing.length === 0) return saved;
  const actionsIdx = saved.indexOf('actions');
  if (actionsIdx === -1) return [...saved, ...missing];
  return [...saved.slice(0, actionsIdx), ...missing, ...saved.slice(actionsIdx)];
};

// Normalize a status value (e.g. 'AWAITING_MATERIAL') into its color-class token
// (e.g. 'awaiting-material'). Shared by every screen that colors a job status.
export const statusToken = (status) => (status || '').toLowerCase().replace(/_/g, '-');

export const getStatusBadgeClass = (status) => (status ? `status-${statusToken(status)}` : '');
