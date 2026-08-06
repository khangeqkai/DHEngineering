import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ChevronLeft, ChevronRight, Briefcase, Users as UsersIcon, Clock, Timer, Filter } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isManagement } from '../utils/roles';
import useSearch from '../hooks/useSearch';
import PageHeader from './common/PageHeader';
import DataTable from './common/DataTable';
import JobCardModal from './jobcard/JobCardModal';
import { ACTIVITY_FIELDS } from './searchFields';
import { formatDate, formatDateTime } from '../utils/formatters';
import { formatHistoryValue } from '../utils/formatters';
import { statusToken } from './JobCardList.constants';
import { actionColor } from '../utils/activityColors';

const STATUSES = ['QUOTE', 'OPEN', 'AWAITING_MATERIAL', 'IN_PROGRESS', 'DONE', 'INVOICED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const ACTIONS = ['create', 'update', 'delete', 'archive', 'unarchive', 'start_timer', 'stop_timer', 'discard_timer', 'add_time_entry', 'update_time_entry', 'delete_time_entry', 'add_note', 'delete_note', 'update_costing', 'update_qa_form', 'add_template', 'remove_template', 'upload_file', 'add_document', 'login', 'login_failed', 'data_export', 'data_import'];
const ENTITY_TYPES = ['jobcard', 'contact', 'supplier', 'user', 'machine', 'auth', 'tag', 'qa_level', 'system'];
const SCOPES = [
  { key: 'all', label: 'All', icon: Search },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'people', label: 'People', icon: UsersIcon, managementOnly: true },
  { key: 'activity', label: 'Activity', icon: Clock, adminOnly: true },
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

function StatusBadge({ status }) {
  return <span className={`badge status-${statusToken(status)}`}>{fmt(status)}</span>;
}

// Same soft-tinted pill as the job list, so status and priority read as one set here too.
function PriorityBadge({ priority }) {
  const p = priority || 'NONE';
  return <span className={`badge priority-${p.toLowerCase()}`}>{fmt(p)}</span>;
}

function ActionBadge({ action }) {
  return <span className="search-badge" style={{ color: actionColor(action), fontWeight: 600 }}>{fmt(action)}</span>;
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

// Map activity entity types + actions to a tab in JobCardModal
const ACTION_TO_TAB = {
  start_timer: 'details', stop_timer: 'details', discard_timer: 'details',
  add_time_entry: 'details', update_time_entry: 'details', delete_time_entry: 'details',
  add_note: 'details',  delete_note: 'details',
  update_costing: 'costing',
  // Files now live in the header paperwork hub, not a tab — land on Details.
  update_qa_form: 'details',
  upload_file: 'details', add_document: 'details',
};

export default function SearchPage() {
  const { user } = useAuth();
  const canManage = isManagement(user);
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const {
    q, setQ, scope, changeScope,
    filters, updateFilter, toggleArrayFilter, clearFilters, hasActiveFilters,
    page, setPage, results, loading,
    employees, machines, qaLevels, jobTypes,
    filtersError, retryFilters, refresh,
  } = useSearch(user?.role);

  // Job card modal state
  const [modalJobId, setModalJobId] = useState(null);
  const [modalTab, setModalTab] = useState(null);

  const openJobModal = useCallback((jobId, tab = null) => {
    setModalTab(tab);
    setModalJobId(jobId);
  }, []);

  const navigateActivity = useCallback((row) => {
    if (row.entityType === 'jobcard') {
      const tab = ACTION_TO_TAB[row.action] || (row.action === 'create' || row.action === 'update' ? 'details' : 'activity');
      openJobModal(row.entityId, canManage ? tab : null);
    } else if (row.entityType === 'contact') {
      navigate('/contacts');
    } else if (row.entityType === 'supplier') {
      navigate('/suppliers');
    } else if (row.entityType === 'user') {
      navigate('/users');
    } else if (row.entityType === 'machine' || row.entityType === 'tag') {
      navigate('/tags');
    } else if (row.entityType === 'qa_level') {
      navigate('/qa-levels');
    }
  }, [navigate, openJobModal, canManage]);

  const handleRowClick = useCallback((row) => {
    if (scope === 'jobs') {
      openJobModal(row.id);
    } else if (scope === 'people') {
      navigate(row.type === 'contact' ? '/contacts' : '/suppliers');
    } else if (scope === 'activity') {
      navigateActivity(row);
    } else if (scope === 'time') {
      openJobModal(row.jobcardId);
    }
  }, [scope, navigate, openJobModal, navigateActivity]);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
    { key: 'jobNumber', label: 'Job #' },
    ...(canManage ? [{ key: 'companyName', label: 'Company', render: (v) => v || '-' }] : []),
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'priority', label: 'Priority', render: (v) => <PriorityBadge priority={v} /> },
    { key: 'dueDate', label: 'Due Date', render: (v) => fmtDateShort(v) },
    { key: 'description', label: 'Description', render: (v) => <span className="search-truncate">{v || '-'}</span> },
  ];

  const peopleColumns = [
    { key: 'type', label: 'Type', render: (v) => <span className={`search-type-badge ${v}`}>{fmt(v)}</span> },
    { key: 'companyName', label: 'Company / Name', render: (_, row) => row.type === 'contact' ? row.companyName : row.name },
    { key: 'contactName', label: 'Contact', render: (v) => v || '-' },
    { key: 'phone', label: 'Phone', render: (_, row) => (row.type === 'contact' ? row.phone : row.contactPhone) || '-' },
    { key: 'email', label: 'Email', render: (_, row) => (row.type === 'contact' ? row.email : row.contactEmail) || '-' },
  ];

  const activityColumns = [
    { key: 'createdAt', label: 'Time', render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(v)}</span> },
    { key: 'userName', label: 'User', render: (v) => v || 'System' },
    { key: 'action', label: 'Action', render: (v) => <ActionBadge action={v} /> },
    { key: 'entityType', label: 'Type', render: (v) => fmt(v) },
    {
      key: 'entityId', label: 'Details', render: (v, row) => (
        <>
          <code className="search-entity-id">{v}</code>
          {row.changes && <div className="search-changes">{Object.entries(row.changes).map(([f, c]) => (
            <div key={f} className="search-change-line">
              <strong>{fmt(f)}:</strong>{' '}
              {c.changed ? <em style={{ color: 'var(--primary-accent)' }}>modified</em> : (
                <><span className="search-from">{formatHistoryValue(f, c.from) || '(empty)'}</span> → <span className="search-to">{formatHistoryValue(f, c.to) || '(empty)'}</span></>
              )}
            </div>
          ))}</div>}
        </>
      )
    },
  ];

  const timeColumns = [
    { key: 'jobNumber', label: 'Job #' },
    { key: 'workerName', label: 'Worker' },
    { key: 'machineNumber', label: 'Machine', render: (v) => v || '-' },
    { key: 'durationHours', label: 'Hours', render: (v) => v != null ? `${v.toFixed(2)}h` : 'Active' },
    { key: 'startTime', label: 'Start', render: (v) => fmtDate(v) },
    { key: 'endTime', label: 'End', render: (v) => v ? fmtDate(v) : '-' },
  ];

  const columnsMap = { jobs: jobColumns, people: peopleColumns, activity: activityColumns, time: timeColumns };

  return (
    <div className="search-page page-enter">
      <PageHeader title="Search" />

      {/* Search input */}
      <div className="search-input-wrapper">
        <Search size={18} className="search-input-icon" />
        <input ref={inputRef} type="text" className="search-input" value={q}
          onChange={(e) => setQ(e.target.value)} placeholder="Search across all data..." />
        {q && <button type="button" className="search-input-clear" onClick={() => setQ('')}><X size={16} /></button>}
      </div>

      {/* Scope tabs */}
      <div className="search-scope-tabs">
        {SCOPES.filter(s => (!s.managementOnly || canManage) && (!s.adminOnly || isAdmin)).map(s => (
          <button key={s.key} type="button" className={`search-scope-tab ${scope === s.key ? 'active' : ''}`}
            onClick={() => changeScope(s.key)}>
            <s.icon size={15} /> {s.label}
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
                <Chips options={STATUSES} selected={filters.status} onToggle={(v) => toggleArrayFilter('status', v)} multi />
              </FilterRow>
              {canManage && <FilterRow label="Assignee">
                <select className="search-select" value={filters.assigneeId} onChange={e => updateFilter('assigneeId', e.target.value)}>
                  <option value="">All</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </FilterRow>}
              <FilterRow label="Priority">
                <Chips options={PRIORITIES} selected={filters.priority} onToggle={(v) => updateFilter('priority', filters.priority === v ? '' : v)} />
              </FilterRow>
              <FilterRow label="Job Type">
                <select className="search-select" value={filters.jobType} onChange={e => updateFilter('jobType', e.target.value)}>
                  <option value="">All</option>
                  {jobTypes.map(t => <option key={t.id} value={t.value}>{t.name}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="QA Level">
                <select className="search-select" value={filters.qaLevel} onChange={e => updateFilter('qaLevel', e.target.value)}>
                  <option value="">All</option>
                  {qaLevels.map(l => <option key={l.id} value={l.name.toUpperCase()}>{l.name}</option>)}
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
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="Action">
                <Chips options={ACTIONS} selected={filters.action} onToggle={(v) => toggleArrayFilter('action', v)} multi />
              </FilterRow>
              <FilterRow label="Entity Type">
                <Chips options={ENTITY_TYPES} selected={filters.entityType}
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
              <FilterRow label="Worker">
                <select className="search-select" value={filters.workerId} onChange={e => updateFilter('workerId', e.target.value)}>
                  <option value="">All workers</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="Machine">
                <select className="search-select" value={filters.machineId} onChange={e => updateFilter('machineId', e.target.value)}>
                  <option value="">All machines</option>
                  {machines.map(m => <option key={m.id} value={m.machineNumber}>{m.machineNumber} - {m.name}</option>)}
                </select>
              </FilterRow>
              <FilterRow label="Job #">
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
      {loading && <div className="search-loading">Searching...</div>}

      {!loading && scope === 'all' && results?.groups && (
        <div className="search-groups">
          {Object.entries(results.groups).every(([, g]) => g.count === 0) && q.trim() && (
            <div className="search-empty">No results found for &ldquo;{q}&rdquo;</div>
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
                    <div key={j.id} className="search-preview-item clickable" onClick={() => openJobModal(j.id)}>
                      <strong>{j.jobNumber}</strong>
                      {canManage && j.companyName && <span className="search-preview-detail"> &middot; {j.companyName}</span>}
                      <StatusBadge status={j.status} />
                      {j.dueDate && <span className="search-preview-meta">Due {fmtDateShort(j.dueDate)}</span>}
                    </div>
                  ))}
                  {key === 'contacts' && group.results.map(c => (
                    <div key={c.id} className="search-preview-item clickable" onClick={() => navigate('/contacts')}>
                      <strong>{c.companyName}</strong>
                      {c.contactName && <span className="search-preview-detail"> ({c.contactName})</span>}
                      {c.phone && <span className="search-preview-meta">{c.phone}</span>}
                    </div>
                  ))}
                  {key === 'suppliers' && group.results.map(s => (
                    <div key={s.id} className="search-preview-item clickable" onClick={() => navigate('/suppliers')}>
                      <strong>{s.name}</strong>
                      {s.contactName && <span className="search-preview-detail"> ({s.contactName})</span>}
                      {s.contactPhone && <span className="search-preview-meta">{s.contactPhone}</span>}
                    </div>
                  ))}
                  {key === 'activity' && group.results.map(a => (
                    <div key={a.id} className="search-preview-item clickable" onClick={() => navigateActivity(a)}>
                      <span className="search-preview-meta">{fmtDate(a.createdAt)}</span>
                      <strong>{a.userName || 'System'}</strong>
                      <ActionBadge action={a.action} />
                      <span>{fmt(a.entityType)}</span>
                      <code className="search-entity-id">{a.entityId}</code>
                    </div>
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
                emptyState={{ icon: 'search', title: 'No results', description: q ? `No results for "${q}"` : 'Adjust your filters to find results' }}
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
        isOpen={!!modalJobId}
        onClose={() => setModalJobId(null)}
        jobCardId={modalJobId}
        initialTab={modalTab}
        onSuccess={refresh}
      />

      <style>{`
        .search-page { max-width: 1200px; }
        .search-input-wrapper { position: relative; margin-bottom: 1rem; }
        .search-input-icon { position: absolute; left: 0.875rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); pointer-events: none; }
        .search-input { width: 100%; padding: 0.75rem 2.5rem 0.75rem 2.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--surface); color: var(--text-primary); font-size: 1rem; }
        .search-input:focus { outline: none; border-color: var(--primary-accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .search-input-clear { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 0.25rem; border-radius: 0.25rem; }
        .search-input-clear:hover { color: var(--text-primary); background: var(--background); }
        .search-scope-tabs { display: flex; gap: 0.375rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .search-scope-tab { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 0.875rem; border: 1px solid var(--border-color); border-radius: 0.375rem; background: var(--surface); color: var(--text-secondary); font-size: 0.8125rem; font-weight: 500; cursor: pointer; transition: all 0.15s; }
        .search-scope-tab:hover { border-color: var(--primary-accent); color: var(--text-primary); }
        .search-scope-tab.active { background: var(--primary-accent); color: white; border-color: var(--primary-accent); }
        .search-all-options { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 0 0.25rem; }
        .search-filters { margin-bottom: 1rem; }
        .search-filters .card-body { padding: 0.75rem 1rem; }
        .search-filters-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .search-filters-error { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 6px; background: var(--accent-caution-bg, rgba(220, 80, 80, 0.1)); color: var(--accent-caution); font-size: 0.8125rem; }
        .search-filters-title { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .search-filter-row { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.5rem; }
        .search-filter-label { min-width: 5.5rem; padding-top: 0.375rem; font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); text-align: right; flex-shrink: 0; }
        .search-filter-control { flex: 1; }
        .search-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
        .search-chip { padding: 0.25rem 0.625rem; border: 1px solid var(--border-color); border-radius: 1rem; background: var(--surface); color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .search-chip:hover { border-color: var(--primary-accent); color: var(--text-primary); }
        .search-chip.active { background: var(--primary-accent); color: white; border-color: var(--primary-accent); }
        .search-select { padding: 0.375rem 0.5rem; border: 1px solid var(--border-color); border-radius: 0.375rem; background: var(--surface); color: var(--text-primary); font-size: 0.8125rem; min-width: 10rem; }
        .search-select-sm { min-width: 6rem; }
        .search-date-range { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .search-date { padding: 0.375rem 0.5rem; border: 1px solid var(--border-color); border-radius: 0.375rem; background: var(--surface); color: var(--text-primary); font-size: 0.8125rem; }
        .search-date-sep { color: var(--text-secondary); font-size: 0.8125rem; }
        .search-checkbox { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-secondary); cursor: pointer; }
        .search-field-input { padding: 0.375rem 0.5rem; border: 1px solid var(--border-color); border-radius: 0.375rem; background: var(--surface); color: var(--text-primary); font-size: 0.8125rem; width: 100%; max-width: 20rem; }
        .search-loading { text-align: center; padding: 2rem; color: var(--text-secondary); }
        .search-empty { text-align: center; padding: 3rem 1rem; color: var(--text-secondary); font-size: 0.9375rem; }
        .search-groups { display: flex; flex-direction: column; gap: 0.75rem; }
        .search-group-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .search-group-title { font-size: 0.9375rem; font-weight: 600; margin: 0; }
        .search-group-count { color: var(--text-secondary); font-weight: 400; }
        .search-group-items { display: flex; flex-direction: column; gap: 0.25rem; }
        .search-preview-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0; font-size: 0.8125rem; flex-wrap: wrap; border-bottom: 1px solid var(--border-color); }
        .search-preview-item:last-child { border-bottom: none; }
        .search-preview-item.clickable { cursor: pointer; }
        .search-preview-item.clickable:hover { background: var(--background); }
        .search-preview-detail { color: var(--text-secondary); }
        .search-preview-meta { color: var(--text-secondary); font-size: 0.75rem; margin-left: auto; }
        /* Status color comes from the shared .status-* class (text only here) */
        .search-badge { font-size: 0.75rem; font-weight: 500; background: none; border: none; padding: 0; }
        .search-entity-id { font-size: 0.6875rem; background: var(--background); padding: 0.0625rem 0.375rem; border-radius: 0.25rem; }
        .search-changes { margin-top: 0.25rem; }
        .search-change-line { font-size: 0.6875rem; color: var(--text-secondary); }
        .search-from { text-decoration: line-through; color: var(--accent-caution); }
        .search-to { color: var(--accent-ready); }
        .search-truncate { max-width: 20rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; }
        .search-type-badge { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; padding: 0.125rem 0.5rem; border-radius: 1rem; }
        .search-type-badge.contact { background: rgba(37,99,235,0.1); color: var(--primary-accent); }
        .search-type-badge.supplier { background: rgba(139,92,246,0.1); color: #8b5cf6; }
        .search-totals { padding: 0.75rem 1rem; font-size: 0.875rem; color: var(--text-secondary); text-align: right; }
        .search-pagination { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; }
        .search-pagination-info { font-size: 0.8125rem; color: var(--text-secondary); }
        .search-pagination-buttons { display: flex; align-items: center; gap: 0.5rem; }
        .search-pagination-current { font-size: 0.8125rem; color: var(--text-secondary); }
      `}</style>
    </div>
  );
}
