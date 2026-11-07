import { useState, useMemo } from 'react';
import { rowMatchesSearch } from '../utils/rowMatchesSearch';

export default function useTableFilter(data, searchKeys = [], searchDigitKeys = []) {
  const [searchTerm, setSearchTerm] = useState('');
  // Callers usually pass the keys as an inline array literal, a new object every
  // render. Keying the memo on the list's contents keeps the filtered rows stable
  // across renders — otherwise a caller that stores the visible rows on each
  // change (DataTable's onVisibleRowsChange) re-renders forever while searching.
  const keysSignature = searchKeys.join('\u0000');
  const digitSignature = searchDigitKeys.join('\u0000');

  const filteredData = useMemo(() => {
    const keys = keysSignature ? keysSignature.split('\u0000') : [];
    const digitKeys = digitSignature ? digitSignature.split('\u0000') : [];
    // Spaces around the text (a pasted job number, a stray space bar) are not
    // part of what's being looked for; a box holding only spaces is empty.
    const term = searchTerm.trim().toLowerCase();
    if (!term || !data || (keys.length === 0 && digitKeys.length === 0)) return data;

    return data.filter(item => rowMatchesSearch(item, term, keys, digitKeys));
  }, [data, searchTerm, keysSignature, digitSignature]);

  return { searchTerm, setSearchTerm, filteredData };
}
