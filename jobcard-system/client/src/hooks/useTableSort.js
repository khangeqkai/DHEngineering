import { useState, useMemo, useCallback } from 'react';

export default function useTableSort(data, defaultSortKey = null, defaultSortOrder = 'asc', columns = []) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);

  const handleSort = useCallback((key) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  }, [sortKey]);

  const sortedData = useMemo(() => {
    if (!sortKey || !data) return data;

    // A column can say "sort me by this instead" (e.g. a status pill sorting by
    // workflow order rather than its label) by declaring sortValue(row).
    const sortCol = columns.find(c => c.key === sortKey);
    const getValue = sortCol?.sortValue ? sortCol.sortValue : (row) => row[sortKey];

    return [...data].sort((a, b) => {
      let aVal = getValue(a);
      let bVal = getValue(b);

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(aVal)) {
        const aTime = new Date(aVal).getTime();
        const bTime = new Date(bVal).getTime();
        if (!isNaN(aTime) && !isNaN(bTime)) {
          aVal = aTime;
          bVal = bTime;
        }
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        // no conversion needed
      } else {
        aVal = String(aVal);
        bVal = String(bVal);
      }

      let result;
      if (typeof aVal === 'string') {
        // Numeric-aware, case-insensitive compare so "Job 9" sorts before "Job 10"
        // instead of "Job 10" landing between "Job 1" and "Job 2".
        result = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      } else if (aVal < bVal) result = -1;
      else if (aVal > bVal) result = 1;
      else result = 0;

      return sortOrder === 'desc' ? -result : result;
    });
  }, [data, sortKey, sortOrder, columns]);

  return { sortKey, sortOrder, handleSort, sortedData };
}
