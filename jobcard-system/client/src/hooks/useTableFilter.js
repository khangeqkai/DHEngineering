import { useState, useMemo } from 'react';

export default function useTableFilter(data, searchKeys = []) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredData = useMemo(() => {
    if (!searchTerm || !data || searchKeys.length === 0) return data;

    const term = searchTerm.toLowerCase();
    return data.filter(item =>
      searchKeys.some(key => {
        const value = item[key];
        return value != null && String(value).toLowerCase().includes(term);
      })
    );
  }, [data, searchTerm, searchKeys]);

  return { searchTerm, setSearchTerm, filteredData };
}
