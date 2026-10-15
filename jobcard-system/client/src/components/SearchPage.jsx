import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, X, ChevronLeft, ChevronRight, Briefcase, Users as UsersIcon, Clock, Timer, Filter } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFinishQuestion } from '../context/FinishQuestionContext';
import { isManagement, can } from '../utils/roles';
import useSearch from '../hooks/useSearch';
import PageHeader from './common/PageHeader';
import DataTable from './common/DataTable';
import JobCardModal from './jobcard/JobCardModal';
import { prefetchJobCardReferenceData } from './jobcard/useJobCardReferenceData';
import { ACTIVITY_FIELDS } from './searchFields';
import { formatDate, formatDateTime } from '../utils/formatters';
import { describeActivity, recordTypeName } from '../utils/activitySentences';
import { statusToken, priorityToken, PRIORITY_LABELS, STATUS_LABELS } from './JobCardList.constants';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from './jobcard/constants';
import { ACTION_NAMES } from '../utils/activityColors';
import { JOB_DELETED_MESSAGE, JOB_DELETED_TOAST_ID } from '../utils/jobLock';
import { QUALITY_LEVELS, QUALITY_LEVEL_LABELS } from '../../../server/src/shared/qualityLevels';
import './SearchPage.css';

// Both lists come from the job screen, so every chip can match and every stored value
// has a chip — adding a status or priority there gives it a search chip for free.
const STATUSES = STATUS_OPTIONS.map(s => s.value);
const PRIORITIES = PRIORITY_OPTIONS.map(p => p.value);
// Every entity type a recordHistory() call writes — a new one must be added here.
// 'qa_level' is no longer written (quality levels stopped being admin-managed), but
// the trail entries the old quality-levels page left behind are still stored, so
// the chip stays to keep them filterable.
const ENTITY_TYPES = ['jobcard', 'company', 'contact', 'supplier', 'user', 'machine', 'auth', 'tag', 'settings', 'system', 'qa_level'];
const fmtEntityType = recordTypeName;

// An activity result in a plain sentence — the Activity Log's wording: names in bold,
// the old value in small grey, and the job's number when it is a job's entry.
function ActivitySentence({ row }) {
  const { headline, details, jobNumber } = describeActivity(row);
  const sayLine = (line, i) => (
    <span key={i}>
      {line.parts.map((part, j) => (part.strong ? <strong key={j}>{part.text}</strong> : <span key={j}>{part.text}</span>))}
      {line.was && <span className="search-from"> was {line.was}</span>}
    </span>
  );
  return (
    <>
      {sayLine(headline, 'head')}
      {jobNumber && <span> · job {jobNumber}</span>}
      {details.length > 0 && <div className="search-changes">{details.map((line, i) => <div key={i} className="search-change-line">{sayLine(line, i)}</div>)}</div>}
    </>
  );
}
const activityAriaLabel = (row) => {
  const { headline } = describeActivity(row);
  return `Open activity: ${headline.parts.map((p) => p.text).join('')}`;
};
const SCOPES = [
  { key: 'all', label: 'All', icon: Search },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'people', label: 'People', icon: UsersIcon, managementOnly: true },
  { key: 'activity', label: 'Activity', icon: Clock, permission: 'activityTrail' },
  { key: 'time', label: 'Time', icon: Timer },
];
const GROUP_LABELS = { jobs: 'Job Cards', contacts: 'Contacts', suppliers: 'Suppliers', activity: 'Activity' };
const GROUP_TO_SCOPE = { jobs: 'jobs', contacts: 'people', suppliers: 'people', activity: 'activity' };

const fmt = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fmtDate = (d) => formatDateTime(d) || '-';
const fmtDateShort = (d) => formatDate(d) || '-';

function Chips({ options, selected, onToggle, multi = false, formatLabel }) {
  return (
    <div className="search-chips">
      {options.map(opt => {
        const value = typeof opt === 'string' ? opt : opt.value;
        const label = formatLabel ? formatLabel(value) : (typeof opt === 'string' ? fmt(opt) : opt.label);
        const isActive = multi ? selected.includes(value) : selected === value;
        return (
          <button key={value} type="button" className={`search-chip ${isActive ? 'active' : ''}`}
            onClick={() => onToggle(value)}>{label}</button>
        );
      })}
    </div>
  );
}

function FilterRow({ label, children }) {
  return (
    <div className="search-filter-row">
      {label && <label className="search-filter-label">{label}</label>}
      <div className="search-filter-control">{children}</div>
    </div>
  );
}

// Wraps whatever part of `text` matches the search words in a <mark>. The whole
// phrase is tried first, then each word alone, so "acme bolt" lights up both the
// phrase and either word wherever they appear.
function Highlight({ text, query }) {
  const value = text == null ? '' : String(text);
  const phrase = (query || '').trim();
  if (!phrase || !value) return value;
  const parts = [...new Set([phrase, ...phrase.split(/\s+/)])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pieces = value.split(new RegExp(`(${parts.join('|')})`, 'gi'));
  if (pieces.length === 1) return value;
  // split() with one capture group puts every match at an odd index.
  return pieces.map((piece, i) => (i % 2 === 1 ? <mark key={i} className="search-mark">{piece}</mark> : piece));
}

function StatusBadge({ status }) {
  return <span className={`badge status-${statusToken(status)}`}>{STATUS_LABELS[status] || fmt(status)}</span>;
}

// Same soft-tinted pill as the job list, so status and priority read as one set here too.
function PriorityBadge({ priority }) {
  const p = priority || 'NONE';
  return <span className={`badge priority-${priorityToken(p)}`}>{PRIORITY_LABELS[p] || fmt(p)}</span>;
}

function Pagination({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * 25 + 1;
  const end = Math.min(page * 25, total);
  return (
    <div className="search-pagination">
      <span className="search-pagination-info">{start}–{end} of {total}</span>
      <div className="search-pagination-buttons">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} /></button>
        <span className="search-pagination-current">Page {page} of {totalPages}</span>
        <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

// Which tab of the job an activity result lands on. Everything but pricing lands on
// Details; History opens beside it for every activity result either way.
const ACTION_TO_TAB = { update_costing: 'costing' };

export default function SearchPage() {
  const { user } = useAuth();
  const canManage = isManagement(user);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const {
    q, setQ, scope, changeScope,
    filters, updateFilter, toggleArrayFilter, clearFilters, hasActiveFilters,
    page, setPage, results, loading,
    employees, machines, jobTypes,
    filtersError, retryFilters, refresh,
  } = useSearch(user?.role);

  // A stop form saved on the finish question's own job screen changes a job in these results.
  const subscribeJobChanged = useFinishQuestion()?.subscribeJobChanged;
  useEffect(() => subscribeJobChanged?.(refresh), [subscribeJobChanged, refresh]);

  // Archived workers/machines/job types still filter on old data, so the lists come
  // back with them included — sunk below the active ones and marked, so "currently
  // offered" still reads clearly at a glance.
  const employeeOptions = useMemo(() => (
    [...employees]
      .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1))
      .map(e => ({ ...e, displayName: e.active ? e.name : `${e.name} (archived)` }))
  ), [employees]);
  const machineOptions = useMemo(() => (
    [...machines]
      .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1))
      .map(m => ({ ...m, displayLabel: `${m.machineNumber} - ${m.name}${m.active ? '' : ' (archived)'}` }))
  ), [machines]);
  const jobTypeOptions = useMemo(() => (
    [...jobTypes]
      .sort((a, b) => (!!a.archived === !!b.archived ? 0 : a.archived ? 1 : -1))
      .map(t => ({ ...t, displayName: t.archived ? `${t.name} (archived)` : t.name }))
  ), [jobTypes]);

  // Job card modal state. Open/closed is tracked separately from which job is open, so
  // closing doesn't clear the job id in the same breath: the job screen saves pending
  // pricing edits on the way out, and that save needs to know which job it belongs to.
  const [modalJobId, setModalJobId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState(null);
  const [modalHistoryOpen, setModalHistoryOpen] = useState(false);

  const openJobModal = useCallback((jobId, tab = null, historyOpen = false) => {
    setModalTab(tab);
    setModalHistoryOpen(historyOpen);
    setModalJobId(jobId);
    setModalOpen(true);
  }, []);

  const navigateActivity = useCallback((row) => {
    if (row.entityType === 'jobcard') {
      // A delete entry's job is gone — say so rather than open a screen that can only
      // fail. An entry of a job deleted since is caught by the job screen's own 404.
      if (row.action === 'delete') {
        toast.error(JOB_DELETED_MESSAGE, { id: JOB_DELETED_TOAST_ID });
        return;
      }
      openJobModal(row.entityId, canManage ? (ACTION_TO_TAB[row.action] || 'details') : null, true);
    } else if (row.entityType === 'contact' || row.entityType === 'company') {
      navigate('/contacts');
    } else if (row.entityType === 'supplier') {
      navigate('/suppliers');
    } else if (row.entityType === 'user') {
      navigate('/users');
    } else if (row.entityType === 'machine') {
      navigate('/equipment');
    } else if (row.entityType === 'tag') {
      navigate('/tags');
    }
  }, [navigate, openJobModal, canManage]);

  const handleRowClick = useCallback((row) => {
    if (scope === 'jobs') {
      openJobModal(row.id);
    } else if (scope === 'people') {
      // Straight to that customer's or supplier's own form, not just their page.
      navigate(row.type === 'contact' ? `/contacts?open=${row.companyId}` : `/suppliers?open=${row.id}`);
    } else if (scope === 'activity') {
      navigateActivity(row);
    } else if (scope === 'time') {
      openJobModal(row.jobcardId);
    }
  }, [scope, navigate, openJobModal, navigateActivity]);

  // What pressing a row's open button says it does — same wording as the "all
  // scopes" preview buttons above, so a row reads the same whether it's found
  // there or in one scope's full table.
  const getResultRowAriaLabel = useCallback((row) => {
    if (scope === 'jobs') return `Open job ${row.jobNumber}`;
    if (scope === 'people') {
      return row.type === 'contact'
        ? `Open contact ${row.companyName || row.contactName || ''}`.trim()
        : `Open supplier ${row.name || ''}`.trim();
    }
    if (scope === 'activity') return activityAriaLabel(row);
    if (scope === 'time') return `Open job ${row.jobNumber}`;
    return undefined;
  }, [scope]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // Fill the picker lists now so the first job window opens with them already in place.
  useEffect(() => { prefetchJobCardReferenceData(); }, []);

  const handleSeeAll = (groupKey) => {
    const targetScope = GROUP_TO_SCOPE[groupKey];
    if (groupKey === 'contacts') {
      changeScope(targetScope, { peopleType: 'contacts' });
    } else if (groupKey === 'suppliers') {
      changeScope(targetScope, { peopleType: 'suppliers' });
    } else if (groupKey === 'jobs') {
      // Carry the combined view's archived choice into the full job list so the
      // set previewed matches the set shown.
      changeScope(targetScope, filters.includeArchived ? { includeArchived: true } : null);
    } else {
      changeScope(targetScope);
    }
  };

  // --- Column definitions ---
  const jobColumns = [
    { key: 'jobNumber', label: 'Job #', render: (v) => <Highlight text={v} query={q} /> },
    ...(canManage ? [{ key: 'companyName', label: 'Company', render: (v) => (v ? <Highlight text={v} query={q} /> : '-') }] : []),
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'priority', label: 'Priority', render: (v) => <PriorityBadge priority={v} /> },
    { key: 'dueDate', label: 'Due Date', render: (v) => fmtDateShort(v) },
    { key: 'description', label: 'Description', render: (v) => <span className="search-truncate">{v ? <Highlight text={v} query={q} /> : '-'}</span> },
  ];

  const peopleColumns = [
    { key: 'type', label: 'Type', render: (v) => <span className={`search-type-badge ${v}`}>{fmt(v)}</span> },
    { key: 'companyName', label: 'Company / Name', render: (_, row) => <Highlight text={row.type === 'contact' ? row.companyName : row.name} query={q} /> },
    { key: 'contactName', label: 'Contact', render: (v) => (v ? <Highlight text={v} query={q} /> : '-') },
    { key: 'phone', label: 'Phone', render: (_, row) => { const v = row.type === 'contact' ? row.phone : row.contactPhone; return v ? <Highlight text={v} query={q} /> : '-'; } },
    { key: 'email', label: 'Email', render: (_, row) => { const v = row.type === 'contact' ? row.email : row.contactEmail; return v ? <Highlight text={v} query={q} /> : '-'; } },
  ];

  const activityColumns = [
    { key: 'createdAt', label: 'Time', render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(v)}</span> },
    { key: 'action', label: 'What happened', render: (_, row) => <ActivitySentence row={row} /> },
  ];

  const timeColumns = [
    { key: 'jobNumber', label: 'Job #', render: (v) => <Highlight text={v} query={q} /> },
    { key: 'workerName', label: 'Worker', render: (v) => <Highlight text={v} query={q} /> },
    { key: 'machineNumber', label: 'Machine', render: (v) => v || '-' },
    { key: 'durationHours', label: 'Hours', render: (v) => v != null ? `${v.toFixed(2)}h` : 'Active' },
    { key: 'startTime', label: 'Start', render: (v) => fmtDate(v) },
    { key: 'endTime', label: 'End', render: (v) => v ? fmtDate(v) : '-' },
  ];

  // Says what the box really looks through. A worker's search never reaches
  // customers, people or suppliers, so the hint doesn't promise them.
  const searchPlaceholder = canManage
    ? 'Job numbers, descriptions, PO numbers, customers, people, suppliers…'
    : 'Job numbers, descriptions, logged time…';

  const columnsMap = { jobs: jobColumns, people: peopleColumns, activity: activityColumns, time: timeColumns };

  return (
    <div className="search-page page-enter">
      <PageHeader title="Search" />

      {/* Search input */}
      <div className="search-input-wrapper">
        <Search size={18} className="search-input-icon" />
        <input ref={inputRef} type="text" className="search-input" value={q}
          onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} />
        {q && <button type="button" className="search-input-clear" onClick={() => setQ('')}><X size={16} /></button>}
      </div>

      {/* Scope tabs */}
      <div className="search-scope-tabs">
        {SCOPES.filter(s => (!s.managementOnly || canManage) && (!s.permission || can(user, s.permission))).map(s => (
          <button key={s.key} type="button" className={`search-scope-tab ${scope === s.key ? 'active' : ''}`}
            onClick={() => changeScope(s.key)}>
            <s.icon size={16} /> {s.label}
          </button>
        ))}
      </div>

      {/* Combined-view options */}
      {scope === 'all' && (
        <div className="search-all-options">
          <label className="search-checkbox">
            <input type="checkbox" checked={filters.includeArchived} onChange={e => updateFilter('includeArchived', e.target.checked)} />
            Include archived jobs
          </label>
        </div>
      )}

      {/* Filters */}
      {scope !== 'all' && (
        <div className="search-filters card">
          <div className="card-body">
            <div className="search-filters-header">
              <span className="search-filters-title"><Filter size={14} /> Filters</span>
              {hasActiveFilters && <button type="button" className="btn btn-sm" onClick={clearFilters}>Clear</button>}
            </div>

            {filtersError && (
              <div className="search-filters-error">
                <span>Couldn't load the filter options.</span>
                <button type="button" className="btn btn-sm" onClick={retryFilters}>Retry</button>
              </div>
            )}

            {scope === 'jobs' && <>
              <FilterRow label="Status">
                <Chips options={STATUSES} selected={filters.status} onToggle={(v) => toggleArrayFilter('status', v)} formatLabel={(v) => STATUS_LABELS[v] || fmt(v)} multi />
              </FilterRow>
              {canManage && <FilterRow label="Assignee">
                <select className="search-select" value={filters.assigneeId} onChange={e => updateFilter('assigneeId', e.target.value)}>
                  <option value="">All</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  {employeeOptions.map(e => <option key={e.id} value={e.id}>{e.displayName}</option>)}
                </select>
              </FilterRow>}
              <FilterRow label="Priority">
                <Chips options={PRIORITIES} selected={filters.priority} onToggle={(v) => updateFilter('priority', filters.priority === v ? '' : v)} formatLabel={(v) => PRIORITY_LABELS[v] || fmt(v)} />
              </FilterRow>
              <FilterRow label="Job Type">
                <select className="search-select" value={filters.jobType} onChange={e => updateFilter('jobType', e.target.value)}>
                  <option value="">All</option>
                  {jobTypeOptions.map(t => <option key={t.id} value={t.value}>{t.displayName}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="Quality Level">
                <select className="search-select" value={filters.qualityLevel} onChange={e => updateFilter('qualityLevel', e.target.value)}>
                  <option value="">All</option>
                  {QUALITY_LEVELS.map(l => <option key={l} value={l}>{QUALITY_LEVEL_LABELS[l]}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="Date Range">
                <div className="search-date-range">
                  <select className="search-select search-select-sm" value={filters.dateField} onChange={e => updateFilter('dateField', e.target.value)}>
                    <option value="created">Created</option>
                    <option value="due">Due Date</option>
                  </select>
                  <input type="date" className="search-date" value={filters.dateFrom} onChange={e => updateFilter('dateFrom', e.target.value)} />
                  <span className="search-date-sep">to</span>
                  <input type="date" className="search-date" value={filters.dateTo} onChange={e => updateFilter('dateTo', e.target.value)} />
                </div>
              </FilterRow>
              <FilterRow label="">
                <label className="search-checkbox">
                  <input type="checkbox" checked={filters.includeArchived} onChange={e => updateFilter('includeArchived', e.target.checked)} />
                  Include archived
                </label>
              </FilterRow>
            </>}

            {scope === 'people' && (
              <FilterRow label="Type">
                <Chips options={[{ value: 'both', label: 'Both' }, { value: 'contacts', label: 'Contacts' }, { value: 'suppliers', label: 'Suppliers' }]}
                  selected={filters.peopleType} onToggle={(v) => updateFilter('peopleType', v)} />
              </FilterRow>
            )}

            {scope === 'activity' && <>
              <FilterRow label="User">
                <select className="search-select" value={filters.userId} onChange={e => updateFilter('userId', e.target.value)}>
                  <option value="">All users</option>
                  {employeeOptions.map(e => <option key={e.id} value={e.id}>{e.displayName}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="Action">
                <Chips options={ACTION_NAMES} selected={filters.action} onToggle={(v) => toggleArrayFilter('action', v)} multi />
              </FilterRow>
              <FilterRow label="Record Type">
                <Chips options={ENTITY_TYPES} selected={filters.entityType} formatLabel={fmtEntityType}
                  onToggle={(v) => updateFilter('entityType', filters.entityType === v ? '' : v)} />
              </FilterRow>
              <FilterRow label="Date Range">
                <div className="search-date-range">
                  <input type="date" className="search-date" value={filters.dateFrom} onChange={e => updateFilter('dateFrom', e.target.value)} />
                  <span className="search-date-sep">to</span>
                  <input type="date" className="search-date" value={filters.dateTo} onChange={e => updateFilter('dateTo', e.target.value)} />
                </div>
              </FilterRow>
              <FilterRow label="Field Changed">
                <select className="search-select" value={filters.field}
                  onChange={e => updateFilter('field', e.target.value)}>
                  <option value="">Any field</option>
                  {ACTIVITY_FIELDS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </FilterRow>
            </>}

            {scope === 'time' && <>
              {/* A worker's time search is limited to their own entries, so
                  picking a colleague could only ever come back empty. */}
              {canManage && <FilterRow label="Worker">
                <select className="search-select" value={filters.workerId} onChange={e => updateFilter('workerId', e.target.value)}>
                  <option value="">All workers</option>
                  {employeeOptions.map(e => <option key={e.id} value={e.id}>{e.displayName}</option>)}
                </select>
              </FilterRow>}
              <FilterRow label="Machine">
                <select className="search-select" value={filters.machineId} onChange={e => updateFilter('machineId', e.target.value)}>
                  <option value="">All machines</option>
                  {machineOptions.map(m => <option key={m.id} value={m.machineNumber}>{m.displayLabel}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="Job Number">
                <input type="text" className="search-field-input" value={filters.jobNumber}
                  onChange={e => updateFilter('jobNumber', e.target.value)} placeholder="Filter by job number" />
              </FilterRow>
              <FilterRow label="Date Range">
                <div className="search-date-range">
                  <input type="date" className="search-date" value={filters.dateFrom} onChange={e => updateFilter('dateFrom', e.target.value)} />
                  <span className="search-date-sep">to</span>
                  <input type="date" className="search-date" value={filters.dateTo} onChange={e => updateFilter('dateTo', e.target.value)} />
                </div>
              </FilterRow>
            </>}
          </div>
        </div>
      )}

      {/* Results */}
      {loading && <div className="search-loading">Searching…</div>}

      {!loading && scope === 'all' && results?.groups && (
        <div className="search-groups">
          {Object.entries(results.groups).every(([, g]) => g.count === 0) && q.trim() && (
            <div className="search-empty">No results for &ldquo;{q.trim()}&rdquo;. Try fewer words, or tick Include archived.</div>
          )}
          {Object.entries(results.groups).map(([key, group]) => group.count > 0 && (
            <div key={key} className="search-group card">
              <div className="card-body">
                <div className="search-group-header">
                  <h3 className="search-group-title">{GROUP_LABELS[key]} <span className="search-group-count">({group.count})</span></h3>
                  <button type="button" className="btn btn-sm" onClick={() => handleSeeAll(key)}>See all &rarr;</button>
                </div>
                <div className="search-group-items">
                  {key === 'jobs' && group.results.map(j => (
                    <button key={j.id} type="button" className="search-preview-item clickable" onClick={() => openJobModal(j.id)} aria-label={`Open job ${j.jobNumber}`}>
                      <strong><Highlight text={j.jobNumber} query={q} /></strong>
                      {canManage && j.companyName && <span className="search-preview-detail"> &middot; <Highlight text={j.companyName} query={q} /></span>}
                      <StatusBadge status={j.status} />
                      {j.dueDate && <span className="search-preview-meta">Due {fmtDateShort(j.dueDate)}</span>}
                    </button>
                  ))}
                  {key === 'contacts' && group.results.map(c => (
                    <button key={c.id} type="button" className="search-preview-item clickable" onClick={() => navigate(`/contacts?open=${c.companyId}`)} aria-label={`Open contact ${c.companyName}`}>
                      <strong><Highlight text={c.companyName} query={q} /></strong>
                      {c.contactName && <span className="search-preview-detail"> (<Highlight text={c.contactName} query={q} />)</span>}
                      {c.phone && <span className="search-preview-meta"><Highlight text={c.phone} query={q} /></span>}
                    </button>
                  ))}
                  {key === 'suppliers' && group.results.map(s => (
                    <button key={s.id} type="button" className="search-preview-item clickable" onClick={() => navigate(`/suppliers?open=${s.id}`)} aria-label={`Open supplier ${s.name}`}>
                      <strong><Highlight text={s.name} query={q} /></strong>
                      {s.contactName && <span className="search-preview-detail"> (<Highlight text={s.contactName} query={q} />)</span>}
                      {s.contactPhone && <span className="search-preview-meta"><Highlight text={s.contactPhone} query={q} /></span>}
                    </button>
                  ))}
                  {key === 'activity' && group.results.map(a => (
                    <button key={a.id} type="button" className="search-preview-item clickable" onClick={() => navigateActivity(a)} aria-label={activityAriaLabel(a)}>
                      <span className="search-preview-meta">{fmtDate(a.createdAt)}</span>
                      <span><ActivitySentence row={a} /></span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {!q.trim() && <div className="search-empty">Start typing to search across all data</div>}
        </div>
      )}

      {!loading && scope !== 'all' && results && (
        <>
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <DataTable
                columns={columnsMap[scope] || []}
                data={results.results || []}
                loading={false}
                onRowClick={handleRowClick}
                getRowAriaLabel={getResultRowAriaLabel}
                emptyState={{ icon: 'search', title: 'No results', description: q ? `No results for "${q.trim()}". Try fewer words${scope === 'jobs' ? ', or tick Include archived' : ''}.` : 'Adjust your filters to find results' }}
              />
            </div>
          </div>
          {scope === 'time' && results.totalHours > 0 && (
            <div className="search-totals">Total hours (all matching): <strong>{results.totalHours.toFixed(2)}h</strong></div>
          )}
          <Pagination page={results.page || 1} totalPages={results.totalPages || 1} total={results.total || 0} onPageChange={setPage} />
        </>
      )}

      <JobCardModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        jobCardId={modalJobId}
        initialTab={modalTab}
        initialHistoryOpen={modalHistoryOpen}
        onSuccess={refresh}
      />
    </div>
  );
}
