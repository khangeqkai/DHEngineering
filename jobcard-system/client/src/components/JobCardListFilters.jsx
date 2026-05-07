import { Calendar, List, User } from 'lucide-react';
import JobCardListDensityToggle from './JobCardListDensity';
import { STATUS_OPTIONS } from './JobCardList.constants';

export default function JobCardListFilters({
  isAdmin,
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
  viewMode,
  onViewModeChange,
  density,
  onDensityChange
}) {
  return (
    <div className="filters">
      <input
        type="text"
        placeholder={isAdmin ? "Search by job #, company, customer, assignee, or description..." : "Search by job # or description..."}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="search-input"
      />
      {isAdmin && !showArchived && (
        <select
          className="assignee-filter"
          value={assigneeFilter}
          onChange={(e) => onAssigneeFilterChange(e.target.value)}
        >
          <option value="all">All Employees</option>
          <option value="UNASSIGNED">Unassigned</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name || emp.username}</option>
          ))}
        </select>
      )}
      {!showArchived && (
        <>
          <button
            className={`btn btn-sm filter-btn-mine ${myJobsOnly ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => onMyJobsOnlyChange(!myJobsOnly)}
            aria-pressed={myJobsOnly}
            title="Show only jobs assigned to me"
          >
            <User size={14} /> My Jobs
          </button>
          <div className="filter-buttons">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`btn btn-sm ${filter === opt.value ? 'btn-primary' : 'btn-secondary'}${opt.value === 'OVERDUE' ? ' filter-btn-overdue' : ''}`}
                onClick={() => onFilterChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="view-toggle">
        <button
          className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewModeChange('list')}
          title="List View"
        >
          <List size={16} />
        </button>
        <button
          className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewModeChange('calendar')}
          title="Calendar View"
        >
          <Calendar size={16} />
        </button>
      </div>
      {viewMode === 'list' && <JobCardListDensityToggle density={density} onChange={onDensityChange} />}
    </div>
  );
}
