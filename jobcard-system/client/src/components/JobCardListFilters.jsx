import { User, X } from 'lucide-react';
import { ACTIVE_FILTER_OPTIONS } from './JobCardList.constants';
import { displayName } from '../../../server/src/shared/names';

export default function JobCardListFilters({
  canManage,
  showArchived,
  search,
  onSearchChange,
  assigneeFilter,
  onAssigneeFilterChange,
  employees,
  myJobsOnly,
  onMyJobsOnlyChange,
  filter,
  onFilterChange,
  columnsMenu
}) {
  return (
    <div className="filters">
      <div className="search-box">
        <input
          type="text"
          placeholder={canManage ? "Search by job #, company, customer, assignee, or description…" : "Search by job #, worker, or description…"}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="search-input"
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {canManage && !showArchived && (
        <select
          className="assignee-filter"
          value={assigneeFilter}
          onChange={(e) => onAssigneeFilterChange(e.target.value)}
        >
          <option value="all">All workers</option>
          <option value="UNASSIGNED">Unassigned</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{displayName(emp)}</option>
          ))}
        </select>
      )}
      {!showArchived && (
        <div className="status-filter-cluster">
          <button
            className={`btn btn-sm filter-btn-mine ${myJobsOnly ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onMyJobsOnlyChange(!myJobsOnly)}
            aria-pressed={myJobsOnly}
            title="Show only jobs assigned to me"
          >
            <User size={14} /> My Jobs
          </button>
          <div className="filter-buttons">
            {ACTIVE_FILTER_OPTIONS.filter(opt => opt.value !== 'OVERDUE').map((opt) => (
              <button
                key={opt.value}
                className={`btn btn-sm ${filter === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onFilterChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="filter-divider" aria-hidden="true" />
          <button
            className={`btn btn-sm ${filter === 'OVERDUE' ? 'btn-primary' : 'btn-secondary'} filter-btn-overdue`}
            onClick={() => onFilterChange('OVERDUE')}
          >
            Overdue
          </button>
        </div>
      )}
      <div className="filters-right">
        {columnsMenu}
      </div>
    </div>
  );
}
