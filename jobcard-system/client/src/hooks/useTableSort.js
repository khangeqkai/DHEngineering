import { useState, useMemo, useCallback } from 'react';

export default function useTableSort(data, defaultSortKey = null, defaultSortOrder = 'asc') {
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

    return [...data].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

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
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      let result;
      if (aVal < bVal) result = -1;
      else if (aVal > bVal) result = 1;
      else result = 0;

      return sortOrder === 'desc' ? -result : result;
    });
  }, [data, sortKey, sortOrder]);

  return { sortKey, sortOrder, handleSort, sortedData };
}
