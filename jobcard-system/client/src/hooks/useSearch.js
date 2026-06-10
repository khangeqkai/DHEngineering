import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';

const INITIAL_FILTERS = {
  // Jobs
  status: [],
  assigneeId: '',
  priority: '',
  jobType: '',
  qaLevel: '',
  dateFrom: '',
  dateTo: '',
  dateField: 'created',
  includeArchived: false,
  // People
  peopleType: 'both',
  // Activity
  userId: '',
  action: [],
  entityType: '',
  field: '',
  // Time
  workerId: '',
  machineId: '',
  specialOnly: false,
  jobNumber: '',
};

export default function useSearch() {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('all');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);
  const [qaLevels, setQaLevels] = useState([]);
  const [jobTypes, setJobTypes] = useState([]);
  const [filtersError, setFiltersError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestId = useRef(0);

  // Manually re-run the current search (e.g. after a job's status changes
  // in the open popup) without altering the query or filters.
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Load the filter dropdown options. If any of them fails (e.g. a brief
  // network hiccup), flag the error so the screen can show it and offer a
  // retry, instead of leaving the dropdowns silently blank for the session.
  const loadFilterOptions = useCallback(async () => {
    setFiltersError(false);
    try {
      const [emp, mach, qa, jt] = await Promise.all([
        api.getEmployees(),
        api.getMachines(),
        api.getQaLevels(),
        api.getTags('job_type'),
      ]);
      setEmployees(emp);
      setMachines(mach);
      setQaLevels(qa);
      setJobTypes(jt);
    } catch (err) {
      setFiltersError(true);
    }
  }, []);

  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);

  // Execute search on state change
  useEffect(() => {
    const id = ++requestId.current;

    // All scope requires a text query
    if (scope === 'all' && !q.trim()) {
      setResults({ groups: {} });
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = { scope, page };
        if (q.trim()) params.q = q.trim();

        // Scope-specific filters
        if (scope === 'all') {
          if (filters.includeArchived) params.includeArchived = 'true';
        } else if (scope === 'jobs') {
          if (filters.status.length) params.status = filters.status.join(',');
          if (filters.assigneeId) params.assigneeId = filters.assigneeId;
          if (filters.priority) params.priority = filters.priority;
          if (filters.jobType) params.jobType = filters.jobType;
          if (filters.qaLevel) params.qaLevel = filters.qaLevel;
          if (filters.dateFrom) params.dateFrom = filters.dateFrom;
          if (filters.dateTo) params.dateTo = filters.dateTo;
          if (filters.dateField !== 'created') params.dateField = filters.dateField;
          if (filters.includeArchived) params.includeArchived = 'true';
        } else if (scope === 'people') {
          if (filters.peopleType !== 'both') params.peopleType = filters.peopleType;
        } else if (scope === 'activity') {
          if (filters.userId) params.userId = filters.userId;
          if (filters.action.length) params.action = filters.action.join(',');
          if (filters.entityType) params.entityType = filters.entityType;
          if (filters.dateFrom) params.dateFrom = filters.dateFrom;
          if (filters.dateTo) params.dateTo = filters.dateTo;
          if (filters.field) params.field = filters.field;
        } else if (scope === 'time') {
          if (filters.workerId) params.workerId = filters.workerId;
          if (filters.machineId) params.machineId = filters.machineId;
          if (filters.dateFrom) params.dateFrom = filters.dateFrom;
          if (filters.dateTo) params.dateTo = filters.dateTo;
          if (filters.specialOnly) params.specialOnly = 'true';
          if (filters.jobNumber) params.jobNumber = filters.jobNumber;
        }

        const data = await api.search(params);
        if (id === requestId.current) setResults(data);
      } catch (err) {
        if (id === requestId.current) toast.error('Search failed');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [q, scope, JSON.stringify(filters), page, refreshKey]);

  // Typing a new search must jump back to the first page, the same way
  // changing a filter does — otherwise a fresh search runs against whatever
  // page you were on and can show a misleading empty results screen.
  const changeQuery = useCallback((value) => {
    setQ(value);
    setPage(1);
  }, []);

  const changeScope = useCallback((newScope, filterOverrides = null) => {
    setScope(newScope);
    setFilters(filterOverrides ? { ...INITIAL_FILTERS, ...filterOverrides } : INITIAL_FILTERS);
    setPage(1);
    setResults(null);
  }, []);

  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const toggleArrayFilter = useCallback((key, value) => {
    setFilters(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  }, []);

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    if (k === 'dateField') return v !== 'created';
    if (k === 'peopleType') return v !== 'both';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return v;
    return v !== '';
  });

  return {
    q, setQ: changeQuery, scope, changeScope,
    filters, updateFilter, toggleArrayFilter, clearFilters, hasActiveFilters,
    page, setPage, results, loading,
    employees, machines, qaLevels, jobTypes,
    filtersError, retryFilters: loadFilterOptions, refresh
  };
}
