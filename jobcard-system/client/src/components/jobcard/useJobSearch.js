import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export function useJobSearch({ excludeJobNumber } = {}) {
  const [focused, setFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [matches, setMatches] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loadVersion, setLoadVersion] = useState(0);
  const containerRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  const allJobsRef = useRef([]);
  const lastLoadedAtRef = useRef(0);
  const CACHE_TTL_MS = 30 * 1000;

  const loadAllJobs = useCallback(async () => {
    if (Date.now() - lastLoadedAtRef.current < CACHE_TTL_MS) return;
    try {
      // Invoicing archives a job, so a repeat job's most recent run is very
      // often exactly the one this used to leave out — both lists are loaded
      // and merged rather than just the active one.
      const [active, archived] = await Promise.all([
        api.getJobcards(),
        api.getJobcards({ archived: true })
      ]);
      allJobsRef.current = [...(active || []), ...(archived || [])];
      lastLoadedAtRef.current = Date.now();
      setLoadVersion(v => v + 1);
    } catch (err) {
      // One message, replaced rather than stacked: focusing this box repeatedly
      // while the server is away would otherwise pile up a copy each time.
      toast.error('Could not load the job list to search. Type the job number in full instead.', { id: 'job-search-load-failed' });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!focused) return;

    const search = debouncedQuery.trim().toLowerCase();
    const all = allJobsRef.current.filter(j => j.jobNumber !== excludeJobNumber);

    if (!search) {
      setMatches(all.slice(0, 10));
      setShowDropdown(all.length > 0);
      return;
    }

    const filtered = all.filter(j =>
      (j.jobNumber || '').toLowerCase().includes(search) ||
      (j.companyName || '').toLowerCase().includes(search) ||
      (j.description || '').toLowerCase().includes(search)
    ).slice(0, 10);
    setMatches(filtered);
    setShowDropdown(filtered.length > 0);
  }, [focused, debouncedQuery, excludeJobNumber, loadVersion]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFocused(true);
    loadAllJobs();
  }, [loadAllJobs]);

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      setFocused(false);
      setShowDropdown(false);
    }, 200);
  }, []);

  // Same reason as the customer box: a pick closes the list by dropping the focus
  // flag, and an Enter pick leaves the cursor where it is, so typing afterwards is
  // the only thing that can say the box is being worked in again. Kept apart from
  // setQuery, which is also called to keep the box in step with the saved job and
  // must never open a list nobody asked for.
  const noteTyping = useCallback(() => setFocused(true), []);

  const selectMatch = useCallback((value) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setQuery(value);
    setDebouncedQuery(value);
    setShowDropdown(false);
    setFocused(false);
  }, []);

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
