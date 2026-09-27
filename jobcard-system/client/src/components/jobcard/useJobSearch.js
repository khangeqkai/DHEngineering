import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useSuggestionLifecycle } from './useSuggestionLifecycle';

// At most this many matches show in the dropdown — a person picking a previous
// job is scanning a short list, not browsing every job that ever matched.
const MAX_MATCHES = 10;

export function useJobSearch({ excludeJobNumber } = {}) {
  const {
    focused,
    setFocused,
    showDropdown,
    setShowDropdown,
    containerRef,
    handleFocus,
    handleBlur,
    noteTyping,
    cancelPendingClose
  } = useSuggestionLifecycle();
  const [matches, setMatches] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Search-as-you-type against the same jobs search the rest of the app uses —
  // at most MAX_MATCHES results across active AND invoiced (archived) jobs,
  // matching on job number and description (the server also matches company
  // name for management, and never sends company/contact data to anyone else).
  // Replaces the old behaviour of loading every active and archived job on
  // focus into a 30s browser-side cache and filtering it there.
  useEffect(() => {
    if (!focused) return;
    const id = ++requestIdRef.current;

    let cancelled = false;
    (async () => {
      try {
        const data = await api.search({
          scope: 'jobs',
          q: debouncedQuery.trim() || undefined,
          includeArchived: 'true'
        });
        if (cancelled || id !== requestIdRef.current) return;
        const results = (data?.results || [])
          .filter(j => j.jobNumber !== excludeJobNumber)
          .slice(0, MAX_MATCHES);
        setMatches(results);
        setShowDropdown(results.length > 0);
      } catch (err) {
        if (cancelled || id !== requestIdRef.current) return;
        // One message, replaced rather than stacked: focusing this box repeatedly
        // while the server is away would otherwise pile up a copy each time.
        toast.error('Could not search the job list. Type the job number in full instead.', { id: 'job-search-load-failed' });
      }
    })();

    return () => { cancelled = true; };
  }, [focused, debouncedQuery, excludeJobNumber, setShowDropdown]);

  const selectMatch = useCallback((value) => {
    cancelPendingClose();
    setQuery(value);
    setDebouncedQuery(value);
    setShowDropdown(false);
    setFocused(false);
  }, [cancelPendingClose, setShowDropdown, setFocused]);

  return {
    containerRef,
    focused,
    showDropdown,
    matches,
    query,
    setQuery,
    noteTyping,
    handleFocus,
    handleBlur,
    setShowDropdown,
    selectMatch
  };
}
