import { useState, useMemo } from 'react';

export default function useTableFilter(data, searchKeys = []) {
  const [searchTerm, setSearchTerm] = useState('');
  // Callers usually pass the keys as an inline array literal, a new object every
  // render. Keying the memo on the list's contents keeps the filtered rows stable
  // across renders — otherwise a caller that stores the visible rows on each
  // change (DataTable's onVisibleRowsChange) re-renders forever while searching.
  const keysSignature = searchKeys.join('\u0000');

  const filteredData = useMemo(() => {
    const keys = keysSignature ? keysSignature.split('\u0000') : [];
    if (!searchTerm || !data || keys.length === 0) return data;

    const term = searchTerm.toLowerCase();
    return data.filter(item =>
      keys.some(key => {
        const value = item[key];
        return value != null && String(value).toLowerCase().includes(term);
      })
    );
  }, [data, searchTerm, keysSignature]);

  return { searchTerm, setSearchTerm, filteredData };
}
