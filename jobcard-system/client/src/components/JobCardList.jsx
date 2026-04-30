import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, ArchiveRestore, Check, Calendar, List, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import { exportJobCardList, exportJobCardsFull } from '../utils/excelExport';
import { getInitials, getAvatarColor } from '../utils/initials';
import JobCardModal from './jobcard/JobCardModal';
import QuickActionPanel from './jobcard/QuickActionPanel';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useActiveTimerIndicator } from '../hooks/useActiveTimerIndicator';
import useJobCardSort, { SORT_VALUE_GETTERS } from '../hooks/useJobCardSort';
import EmptyState from './common/EmptyState';
import JobCardListDensityToggle, { useJobCardListDensity } from './JobCardListDensity';
import JobCardCalendarView from './JobCardCalendarView';
import './JobCardList.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'QUOTE', label: 'Quotes' },
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_MATERIAL', label: 'Awaiting Material' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'TREATMENT', label: 'Treatment' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'OVERDUE', label: 'Overdue' }
];

const STATUS_LABELS = {
  QUOTE: 'Quote',
  OPEN: 'Open',
  AWAITING_MATERIAL: 'Awaiting Material',
  IN_PROGRESS: 'In Progress',
  TREATMENT: 'Treatment',
  ON_HOLD: 'On Hold',
  DONE: 'Done',
  INVOICED: 'Invoiced'
};

const PRIORITY_COLORS = {
  NONE: 'var(--text-secondary)',
  LOW: 'var(--badge-progress-text)',
  MEDIUM: '#d97706',
  HIGH: 'var(--danger-color)'
};

const PRIORITY_LABELS = { NONE: 'None', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

const PAGE_SIZE = 20;

const DEFAULT_COLUMN_ORDER = [
  'jobNumber',
  'company',
  'customer',
  'assignedTo',
  'status',
  'priority',
  'dueDate',
  'createdAt',
  'updatedAt',
  'actions'
];

const mergeColumnOrder = (saved) => {
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_COLUMN_ORDER;
  const missing = DEFAULT_COLUMN_ORDER.filter(c => !saved.includes(c));
  if (missing.length === 0) return saved;
  // Insert any new columns just before 'actions' (or append if actions is absent)
  const actionsIdx = saved.indexOf('actions');
  if (actionsIdx === -1) return [...saved, ...missing];
  return [...saved.slice(0, actionsIdx), ...missing, ...saved.slice(actionsIdx)];
};

export default function JobCardList() {
  const { user, updatePreferences } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [filter, setFilter] = useState(() => {
    const paramFilter = searchParams.get('filter');
    const valid = STATUS_OPTIONS.some(o => o.value === paramFilter);
    return valid ? paramFilter : 'all';
  });
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState(() => {
    return searchParams.get('assignee') || 'all';
  });
  const [employees, setEmployees] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [jobcards, setJobcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusPopoverId, setStatusPopoverId] = useState(null);
  const popoverRef = useRef(null);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();
  const [quickActionCard, setQuickActionCard] = useState(null);
  const [density, setDensity] = useJobCardListDensity();
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const { activeTimerJobcardId, formattedElapsed, refresh: refreshTimer } = useActiveTimerIndicator();
  
  const [columnOrder, setColumnOrder] = useState(() => mergeColumnOrder(user?.jobcardColumnOrder));

  useEffect(() => {
    if (user?.jobcardColumnOrder) {
      setColumnOrder(mergeColumnOrder(user.jobcardColumnOrder));
    }
  }, [user?.jobcardColumnOrder]);

  const [draggedCol, setDraggedCol] = useState(null);

  const handleDragStart = (e, colId) => {
    setDraggedCol(colId);
    e.dataTransfer.effectAllowed = 'move';
    // Set a slight opacity to the dragged header
    setTimeout(() => {
      if (e.target) e.target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e) => {
    if (e.target) e.target.style.opacity = '1';
    setDraggedCol(null);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetColId) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetColId) return;

    const draggedIdx = columnOrder.indexOf(draggedCol);
    const targetIdx = columnOrder.indexOf(targetColId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const newOrder = columnOrder.filter(c => c !== draggedCol);
    const insertAt = draggedIdx < targetIdx
      ? newOrder.indexOf(targetColId) + 1
      : newOrder.indexOf(targetColId);
    newOrder.splice(insertAt, 0, draggedCol);

    setColumnOrder(newOrder);
    updatePreferences({ jobcardColumnOrder: newOrder }).catch(() => {
      toast.error('Failed to save column order preference');
    });
  };

  const loadJobcards = useCallback(async () => {
    try {
      setLoading(true);
      const filters = {};
      if (showArchived) filters.archived = true;
      if (isAdmin && assigneeFilter !== 'all' && !showArchived) {
        filters.assigneeId = assigneeFilter;
      }
      const data = await api.getJobcards(filters);
      setJobcards(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load job cards');
    } finally {
      setLoading(false);
    }
  }, [showArchived, assigneeFilter, isAdmin]);

  useEffect(() => {
    loadJobcards();
  }, [loadJobcards]);

  // Fetch employees for assignee filter (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    api.getEmployees().then(setEmployees).catch(() => {});
  }, [isAdmin]);

  const handleDelete = async (id) => {
    const confirmed = await showConfirm({
      title: 'Delete Job Card',
      message: 'Are you sure you want to delete this job card?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteJobcard(id);
      await loadJobcards();
    } catch (err) {
      toast.error(err.message || 'Failed to delete job card');
    }
  };

  const handleUnarchive = async (id) => {
    const confirmed = await showConfirm({
      title: 'Unarchive Job Card',
      message: 'Are you sure you want to unarchive this job card? It will be restored to the active list.',
      confirmLabel: 'Unarchive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    try {
      await api.unarchiveJobcard(id);
      toast.success('Job card unarchived');
      await loadJobcards();
    } catch (err) {
      toast.error(err.message || 'Failed to unarchive job card');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'QUOTE': return 'badge-pending';
      case 'OPEN': return 'badge-pending';
      case 'IN_PROGRESS': return 'badge-in-progress';
      case 'AWAITING_MATERIAL': return 'badge-awaiting-material';
      case 'TREATMENT': return 'badge-treatment';
      case 'ON_HOLD': return 'badge-cancelled';
      case 'DONE': return 'badge-completed';
      case 'INVOICED': return 'badge-completed';
      default: return '';
    }
  };

  const handleQuickStatusChange = useCallback(async (cardId, newStatus) => {
    setStatusPopoverId(null);
    try {
      await api.updateJobcardStatus(cardId, newStatus);
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
      await loadJobcards();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    }
  }, [loadJobcards]);

  // Close status popover on click-outside or Escape
  useEffect(() => {
    if (!statusPopoverId) return;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setStatusPopoverId(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setStatusPopoverId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [statusPopoverId]);

  // Filter job cards based on status filter and search
  const filteredCards = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return jobcards.filter((card) => {
      let matchesFilter;
      if (filter === 'all') {
        matchesFilter = true;
      } else if (filter === 'OVERDUE') {
        matchesFilter = card.dueDate && card.dueDate < today &&
          !['DONE', 'INVOICED'].includes(card.status);
      } else {
        matchesFilter = card.status === filter;
      }
      const lowerSearch = search.toLowerCase();
      const matchesSearch =
        !search ||
        card.jobNumber?.toLowerCase().includes(lowerSearch) ||
        (isAdmin && card.contactName?.toLowerCase().includes(lowerSearch)) ||
        (isAdmin && card.companyName?.toLowerCase().includes(lowerSearch)) ||
        (isAdmin && card.assignees?.some(a => a.userName?.toLowerCase().includes(lowerSearch))) ||
        card.description?.toLowerCase().includes(lowerSearch);
      return matchesFilter && matchesSearch;
    });
  }, [jobcards, filter, search, isAdmin]);

  const { sortBy, sortDir, handleSort, sortedCards } = useJobCardSort(filteredCards);

  // Reset to page 1 when filters or sort change, sync filter to URL
  useEffect(() => {
    setCurrentPage(1);
    const params = new URLSearchParams(window.location.search);
    if (filter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', filter);
    }
    if (assigneeFilter === 'all') {
      params.delete('assignee');
    } else {
      params.set('assignee', assigneeFilter);
    }
    setSearchParams(params, { replace: true });
  }, [filter, search, showArchived, assigneeFilter, sortBy, sortDir, setSearchParams]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedCards.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCards = sortedCards.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );

  const openCreateModal = () => {
    setEditingCardId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cardId) => {
    setEditingCardId(cardId);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    loadJobcards();
  };

  const COLUMNS = [
    {
      id: 'jobNumber',
      label: 'Job #',
      renderCell: (card, isOverdue) => (
        <td key="jobNumber">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setQuickActionCard(card);
            }}
          >
            <strong>{card.jobNumber}</strong>
          </a>
          {card.id === activeTimerJobcardId && (
            <span className="timer-indicator">
              <span className="timer-dot" />
              {formattedElapsed}
            </span>
          )}
          {card.qualityLevel === 'CRITICAL' && (
            <span className="critical-badge">Critical QA</span>
          )}
          {card.description && (
            <p className="description-preview">
              {card.description.substring(0, 60)}
              {card.description.length > 60 ? '...' : ''}
            </p>
          )}
        </td>
      )
    },
    {
      id: 'company',
      label: 'Company',
      adminOnly: true,
      renderCell: (card) => <td key="company">{card.companyName || '-'}</td>
    },
    {
      id: 'customer',
      label: 'Customer',
      adminOnly: true,
      renderCell: (card) => <td key="customer">{card.contactName || '-'}</td>
    },
    {
      id: 'assignedTo',
      label: 'Assigned To',
      adminOnly: true,
      renderCell: (card) => (
        <td key="assignedTo" className="assignee-cell">
          {card.assignees?.length ? (() => {
            const MAX_VISIBLE = 3;
            const visible = card.assignees.slice(0, MAX_VISIBLE);
            const overflow = card.assignees.length - visible.length;
            return (
              <span className="assignee-preview">
                <span className="avatar-stack">
                  {visible.map(a => {
                    const c = getAvatarColor(a.userName || a.username || a.userId);
                    return (
                      <span
                        key={a.userId}
                        className="avatar-chip"
                        style={{ backgroundColor: c.bg, color: c.fg }}
                      >
                        {getInitials(a.userName)}
                      </span>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="avatar-chip avatar-overflow">
                      +{overflow}
                    </span>
                  )}
                </span>
                <span className="assignee-tooltip">
                  {card.assignees.map(a => (
                    <span key={a.userId} className="assignee-tooltip-item">{a.userName}</span>
                  ))}
                </span>
              </span>
            );
          })() : '-'}
        </td>
      )
    },
    {
      id: 'status',
      label: 'Status',
      renderCell: (card) => (
        <td key="status">
          {isAdmin && !showArchived ? (
            <div className="status-popover-wrapper" ref={statusPopoverId === card.id ? popoverRef : null}>
              <span
                className={`badge ${getStatusBadgeClass(card.status)} badge-clickable`}
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusPopoverId(statusPopoverId === card.id ? null : card.id);
                }}
              >
                {STATUS_LABELS[card.status] || card.status}
              </span>
              {statusPopoverId === card.id && (
                <div className="status-popover">
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <button
                      key={value}
                      className={`status-popover-item ${card.status === value ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (card.status !== value) {
                          handleQuickStatusChange(card.id, value);
                        } else {
                          setStatusPopoverId(null);
                        }
                      }}
                    >
                      <span className={`badge ${getStatusBadgeClass(value)}`}>{label}</span>
                      {card.status === value && <span className="status-check"><Check size={14} /></span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className={`badge ${getStatusBadgeClass(card.status)}`}>
              {STATUS_LABELS[card.status] || card.status}
            </span>
          )}
        </td>
      )
    },
    {
      id: 'priority',
      label: 'Priority',
      renderCell: (card) => (
        <td key="priority">
          <span style={{ color: PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.NONE, fontWeight: 500 }}>
            {PRIORITY_LABELS[card.priority] || 'None'}
          </span>
        </td>
      )
    },
    {
      id: 'dueDate',
      label: 'Due Date',
      renderCell: (card, isOverdue) => (
        <td key="dueDate" className={isOverdue ? 'overdue-date' : ''}>
          {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : '-'}
          {isOverdue && <span className="overdue-label">OVERDUE</span>}
        </td>
      )
    },
    {
      id: 'createdAt',
      label: 'Created At',
      renderCell: (card) => (
        <td key="createdAt">
          {card.createdAt ? new Date(card.createdAt).toLocaleString() : '-'}
        </td>
      )
    },
    {
      id: 'updatedAt',
      label: 'Last Edited',
      renderCell: (card) => (
        <td key="updatedAt">
          {card.updatedAt ? new Date(card.updatedAt).toLocaleString() : '-'}
        </td>
      )
    },
    {
      id: 'actions',
      label: 'Actions',
      renderCell: (card) => (
        <td key="actions">
          <div className="action-buttons">
            {showArchived && card.archived && (
              <button
                className="btn btn-outline-warning btn-sm"
                onClick={() => handleUnarchive(card.id)}
              >
                <ArchiveRestore size={14} /> Unarchive
              </button>
            )}
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={() => handleDelete(card.id)}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </td>
      )
    }
  ];

  const visibleColumns = columnOrder
    .map(id => COLUMNS.find(c => c.id === id))
    .filter(Boolean)
    .filter(col => !col.adminOnly || isAdmin);

  if (loading) {
    return <div className="loading">Loading job cards...</div>;
  }

  return (
    <div className="jobcard-list page-scroll-layout page-enter">
      <PageHeader title={showArchived ? 'Archived Job Cards' : 'Job Cards'}>
        <label className="archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show Archived
        </label>
        {isAdmin && (
          <ExportButton
            onExportView={() => sortedCards.length ? exportJobCardList(sortedCards) : false}
            onExportAll={() => exportJobCardsFull()}
          />
        )}
        {!showArchived && isAdmin && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> New Job Card
          </button>
        )}
      </PageHeader>

      <div className="filters">
        <input
          type="text"
          placeholder={isAdmin ? "Search by job #, company, customer, assignee, or description..." : "Search by job # or description..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        {isAdmin && !showArchived && (
          <select
            className="assignee-filter"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All Employees</option>
            <option value="UNASSIGNED">Unassigned</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name || emp.username}</option>
            ))}
          </select>
        )}
        {!showArchived && (
          <div className="filter-buttons">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`btn btn-sm ${filter === opt.value ? 'btn-primary' : 'btn-secondary'}${opt.value === 'OVERDUE' ? ' filter-btn-overdue' : ''}`}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <div className="view-toggle">
          <button
            className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            <List size={16} />
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('calendar')}
            title="Calendar View"
          >
            <Calendar size={16} />
          </button>
        </div>
        {viewMode === 'list' && <JobCardListDensityToggle density={density} onChange={setDensity} />}
      </div>

      {viewMode === 'calendar' ? (
        <div className="calendar-container" style={{ flex: 1, minHeight: '600px', marginBottom: '1rem' }}>
          <JobCardCalendarView
            jobcards={filteredCards}
            onCardClick={(card) => setQuickActionCard(card)}
            getStatusBadgeClass={getStatusBadgeClass}
            STATUS_LABELS={STATUS_LABELS}
          />
        </div>
      ) : (
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {filteredCards.length === 0 ? (
            jobcards.length === 0 ? (
              <EmptyState
                icon="jobcards"
                title="No job cards yet"
                description="Create your first job card to get started."
                actionLabel={isAdmin ? 'New Job Card' : undefined}
                onAction={isAdmin ? openCreateModal : undefined}
              />
            ) : (
              <EmptyState
                icon="jobcards"
                title="No results"
                description="Try adjusting your search or filters."
              />
            )
          ) : (
            <table className="table" data-density={density}>
              <thead>
                <tr>
                  {visibleColumns.map(col => {
                    const sortable = !!SORT_VALUE_GETTERS[col.id];
                    const active = sortable && sortBy === col.id;
                    return (
                      <th
                        key={col.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, col.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDrop={(e) => handleDrop(e, col.id)}
                        onClick={sortable ? () => handleSort(col.id) : undefined}
                        className={`jc-th${sortable ? ' jc-th-sortable' : ''}${active ? ' jc-th-sorted' : ''}`}
                        title={sortable ? 'Click to sort, drag to reorder' : 'Drag to reorder columns'}
                        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <span className="jc-th-label">{col.label}</span>
                        {sortable && (
                          <span className="jc-sort-icon" aria-hidden="true">
                            {!active && <ChevronsUpDown size={12} />}
                            {active && sortDir === 'asc' && <ChevronUp size={14} />}
                            {active && sortDir === 'desc' && <ChevronDown size={14} />}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginatedCards.map((card) => {
                  const isOverdue = card.dueDate &&
                    new Date(card.dueDate) < new Date() &&
                    !['DONE', 'INVOICED'].includes(card.status);

                  return (
                    <tr key={card.id} className={isOverdue ? 'overdue-row' : ''}>
                      {visibleColumns.map(col => col.renderCell(card, isOverdue))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              {(safeCurrentPage - 1) * PAGE_SIZE + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, sortedCards.length)} of {sortedCards.length}
            </span>
            <div className="pagination-buttons">
              <button
                className="btn btn-secondary btn-sm"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage(safeCurrentPage - 1)}
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  if (totalPages <= 7) return true;
                  if (page === 1 || page === totalPages) return true;
                  if (Math.abs(page - safeCurrentPage) <= 1) return true;
                  return false;
                })
                .map((page, idx, arr) => {
                  const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                  return (
                    <span key={page} style={{ display: 'contents' }}>
                      {showEllipsis && <span className="pagination-ellipsis">&hellip;</span>}
                      <button
                        className={`btn btn-sm ${page === safeCurrentPage ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    </span>
                  );
                })}
              <button
                className="btn btn-secondary btn-sm"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage(safeCurrentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      <QuickActionPanel
        isOpen={!!quickActionCard}
        onClose={() => setQuickActionCard(null)}
        jobCard={quickActionCard}
        onViewDetails={(cardId) => {
          setQuickActionCard(null);
          openEditModal(cardId);
        }}
        onTimerChange={refreshTimer}
      />

      <JobCardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        jobCardId={editingCardId}
        onSuccess={handleModalSuccess}
      />

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
