import { useState, useMemo, useCallback } from 'react';

const STATUS_SORT_ORDER = {
  QUOTE: 0,
  OPEN: 1,
  AWAITING_MATERIAL: 2,
  IN_PROGRESS: 3,
  DONE: 4,
  INVOICED: 5
};

const PRIORITY_SORT_ORDER = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

export const SORT_VALUE_GETTERS = {
  jobNumber: (c) => c.jobNumber || '',
  company: (c) => (c.companyName || '').toLowerCase(),
  customer: (c) => (c.contactName || '').toLowerCase(),
  assignedTo: (c) => (c.assignees?.[0]?.userName || '').toLowerCase(),
  status: (c) => STATUS_SORT_ORDER[c.status] ?? 999,
  priority: (c) => PRIORITY_SORT_ORDER[c.priority] ?? 0,
  dueDate: (c) => (c.dueDate ? new Date(c.dueDate).getTime() : null),
  createdAt: (c) => (c.createdAt ? new Date(c.createdAt).getTime() : null),
  updatedAt: (c) => (c.updatedAt ? new Date(c.updatedAt).getTime() : null)
};

export default function useJobCardSort(cards) {
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState(null);

  const handleSort = useCallback((colId) => {
    if (!SORT_VALUE_GETTERS[colId]) return;
    if (sortBy !== colId) {
      setSortBy(colId);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortBy(null);
      setSortDir(null);
    }
  }, [sortBy, sortDir]);

  const sortedCards = useMemo(() => {
    if (!sortBy || !sortDir) return cards;
    const getter = SORT_VALUE_GETTERS[sortBy];
    if (!getter) return cards;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...cards].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [cards, sortBy, sortDir]);

  return { sortBy, sortDir, handleSort, sortedCards };
}
