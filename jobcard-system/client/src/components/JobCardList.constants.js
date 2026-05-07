export const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'QUOTE', label: 'Quotes' },
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_MATERIAL', label: 'Awaiting Material' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'TREATMENT', label: 'Treatment' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'OVERDUE', label: 'Overdue' }
];

export const STATUS_LABELS = {
  QUOTE: 'Quote',
  OPEN: 'Open',
  AWAITING_MATERIAL: 'Awaiting Material',
  IN_PROGRESS: 'In Progress',
  TREATMENT: 'Treatment',
  ON_HOLD: 'On Hold',
  DONE: 'Done',
  INVOICED: 'Invoiced'
};

export const PRIORITY_COLORS = {
  NONE: 'var(--text-secondary)',
  LOW: 'var(--badge-progress-text)',
  MEDIUM: '#d97706',
  HIGH: 'var(--danger-color)'
};

export const PRIORITY_LABELS = { NONE: 'None', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const PAGE_SIZE = 20;

export const DEFAULT_COLUMN_ORDER = [
  'jobNumber',
  'company',
  'customer',
  'assignedTo',
  'status',
  'priority',
  'dueDate',
  'createdAt',
  'updatedAt',
  'actions'
];

export const mergeColumnOrder = (saved) => {
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_COLUMN_ORDER;
  const missing = DEFAULT_COLUMN_ORDER.filter(c => !saved.includes(c));
  if (missing.length === 0) return saved;
  const actionsIdx = saved.indexOf('actions');
  if (actionsIdx === -1) return [...saved, ...missing];
  return [...saved.slice(0, actionsIdx), ...missing, ...saved.slice(actionsIdx)];
};

export const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'QUOTE': return 'badge-pending';
    case 'OPEN': return 'badge-pending';
    case 'IN_PROGRESS': return 'badge-in-progress';
    case 'AWAITING_MATERIAL': return 'badge-awaiting-material';
    case 'TREATMENT': return 'badge-treatment';
    case 'ON_HOLD': return 'badge-cancelled';
    case 'DONE': return 'badge-completed';
    case 'INVOICED': return 'badge-completed';
    default: return '';
  }
};
