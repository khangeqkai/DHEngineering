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
      const results = await api.getJobcards();
      allJobsRef.current = results || [];
      lastLoadedAtRef.current = Date.now();
      setLoadVersion(v => v + 1);
    } catch (err) {
      toast.error('Failed to load jobs');
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
    handleFocus,
    handleBlur,
    setShowDropdown,
    selectMatch
  };
}
