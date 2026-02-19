import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Archive } from 'lucide-react';
import PageHeader from './common/PageHeader';
import JobCardModal from './jobcard/JobCardModal';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import './JobCardList.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'QUOTE', label: 'Quotes' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'OVERDUE', label: 'Overdue' }
];

const STATUS_LABELS = {
  QUOTE: 'Quote',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  DONE: 'Done',
  INVOICED: 'Invoiced'
};

const PRIORITY_COLORS = {
  NONE: 'var(--text-secondary)',
  LOW: 'var(--success-color)',
  MEDIUM: 'var(--warning-color)',
  HIGH: 'var(--danger-color)'
};

const PAGE_SIZE = 20;

export default function JobCardList() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(() => {
    const paramFilter = searchParams.get('filter');
    const valid = STATUS_OPTIONS.some(o => o.value === paramFilter);
    return valid ? paramFilter : 'all';
  });
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [jobcards, setJobcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusPopoverId, setStatusPopoverId] = useState(null);
  const popoverRef = useRef(null);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  const loadJobcards = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getJobcards(showArchived);
      setJobcards(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load job cards');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadJobcards();
  }, [loadJobcards]);

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

  const handleArchive = async (id) => {
    const confirmed = await showConfirm({
      title: 'Archive Job Card',
      message: 'Are you sure you want to archive this job card? This will set the invoice date to today.',
      confirmLabel: 'Archive',
      confirmVariant: 'success'
    });
    if (!confirmed) return;

    try {
      const invoiceDate = new Date().toISOString().split('T')[0];
      await api.archiveJobcard(id, invoiceDate);
      toast.success('Job card archived');
      await loadJobcards();
    } catch (err) {
      toast.error(err.message || 'Failed to archive job card');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'QUOTE': return 'badge-pending';
      case 'OPEN': return 'badge-pending';
      case 'IN_PROGRESS': return 'badge-in-progress';
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
      const matchesSearch =
        !search ||
        card.jobNumber?.toLowerCase().includes(search.toLowerCase()) ||
        (isAdmin && card.contactName?.toLowerCase().includes(search.toLowerCase())) ||
        card.description?.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [jobcards, filter, search, isAdmin]);

  // Reset to page 1 when filters change, sync filter to URL
  useEffect(() => {
    setCurrentPage(1);
    const params = new URLSearchParams(window.location.search);
    if (filter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', filter);
    }
    setSearchParams(params, { replace: true });
  }, [filter, search, showArchived, setSearchParams]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCards = filteredCards.slice(
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

  if (loading) {
    return <div className="loading">Loading job cards...</div>;
  }

  return (
    <div className="jobcard-list page-scroll-layout">
      <PageHeader title={showArchived ? 'Archived Job Cards' : 'Job Cards'}>
        <label className="archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show Archived
        </label>
        {!showArchived && isAdmin && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> New Job Card
          </button>
        )}
      </PageHeader>

      <div className="filters">
        <input
          type="text"
          placeholder={isAdmin ? "Search by job #, customer, or description..." : "Search by job # or description..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
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
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {filteredCards.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No job cards found.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Job #</th>
                  {isAdmin && <th>Customer</th>}
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCards.map((card) => {
                  const isOverdue = card.dueDate &&
                    new Date(card.dueDate) < new Date() &&
                    !['DONE', 'INVOICED'].includes(card.status);

                  return (
                    <tr key={card.id} className={isOverdue ? 'overdue-row' : ''}>
                      <td>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openEditModal(card.id);
                          }}
                        >
                          <strong>{card.jobNumber}</strong>
                        </a>
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
                      {isAdmin && (
                        <td>{card.contactName || '-'}</td>
                      )}
                      <td>{card.jobType || '-'}</td>
                      <td>
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
                                    {card.status === value && <span className="status-check">&#10003;</span>}
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
                      <td>
                        <span style={{ color: PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.NONE, fontWeight: 500 }}>
                          {card.priority || 'NONE'}
                        </span>
                      </td>
                      <td className={isOverdue ? 'overdue-date' : ''}>
                        {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : '-'}
                        {isOverdue && <span className="overdue-label">OVERDUE</span>}
                      </td>
                      <td>
                        <div className="action-buttons">
                          {card.status === 'INVOICED' && !card.archived && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleArchive(card.id)}
                            >
                              <Archive size={14} /> Archive
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(card.id)}
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
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
              {(safeCurrentPage - 1) * PAGE_SIZE + 1}–{Math.min(safeCurrentPage * PAGE_SIZE, filteredCards.length)} of {filteredCards.length}
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
