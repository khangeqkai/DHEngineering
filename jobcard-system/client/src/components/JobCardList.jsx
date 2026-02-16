import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';
import JobCardModal from './jobcard/JobCardModal';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'QUOTE', label: 'Quotes' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' }
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
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [jobcards, setJobcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  const loadJobcards = async () => {
    try {
      setLoading(true);
      const data = await api.getJobcards(showArchived);
      setJobcards(data);
    } catch (err) {
      console.error('Failed to load job cards:', err);
      toast.error(err.message || 'Failed to load job cards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobcards();
  }, [showArchived]);

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
      console.error('Failed to delete job card:', err);
      toast.error(err.message || 'Failed to delete job card');
    }
  };

  const handleArchive = async (id) => {
    const invoiceDate = prompt('Enter invoice date (YYYY-MM-DD):',
      new Date().toISOString().split('T')[0]);
    if (!invoiceDate) return;

    try {
      await api.archiveJobcard(id);
      await loadJobcards();
    } catch (err) {
      console.error('Failed to archive job card:', err);
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

  // Filter job cards based on status filter and search
  const filteredCards = useMemo(() => {
    return jobcards.filter((card) => {
      const matchesFilter = filter === 'all' || card.status === filter;
      const matchesSearch =
        !search ||
        card.jobNumber?.toLowerCase().includes(search.toLowerCase()) ||
        card.contactName?.toLowerCase().includes(search.toLowerCase()) ||
        card.description?.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [jobcards, filter, search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search, showArchived]);

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
        {!showArchived && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            + New Job Card
          </button>
        )}
      </PageHeader>

      <div className="filters">
        <input
          type="text"
          placeholder="Search by job #, customer, or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        {!showArchived && (
          <div className="filter-buttons">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`btn btn-sm ${filter === opt.value ? 'btn-primary' : 'btn-secondary'}`}
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
                  <th>Customer</th>
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
                        {card.description && (
                          <p className="description-preview">
                            {card.description.substring(0, 60)}
                            {card.description.length > 60 ? '...' : ''}
                          </p>
                        )}
                      </td>
                      <td>
                        {card.contactName || '-'}
                        {card.qualityLevel === 'CRITICAL' && (
                          <span className="critical-badge">Critical QA</span>
                        )}
                      </td>
                      <td>{card.jobType || '-'}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(card.status)}`}>
                          {STATUS_LABELS[card.status] || card.status}
                        </span>
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
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditModal(card.id)}
                          >
                            Edit
                          </button>
                          {card.status === 'INVOICED' && !card.archived && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleArchive(card.id)}
                            >
                              Archive
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(card.id)}
                          >
                            Delete
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

      <style>{`
        .filters {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .search-input {
          flex: 1;
          min-width: 250px;
          padding: 0.625rem 0.875rem;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          background: var(--surface);
          color: var(--text-primary);
        }

        .search-input:focus {
          outline: none;
          border-color: var(--border-focus);
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
        }

        .filter-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .archive-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: var(--text-sm);
          cursor: pointer;
        }

        .description-preview {
          font-size: var(--text-xs);
          color: var(--text-secondary);
          margin-top: 0.25rem;
          margin-bottom: 0;
        }

        .overdue-label {
          display: block;
          font-size: 0.625rem;
          margin-top: 0.25rem;
        }

        .pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-top: 1px solid var(--border-color);
          background: var(--surface-inset);
          flex-shrink: 0;
        }

        .pagination-info {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }

        .pagination-buttons {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }

        .pagination-ellipsis {
          padding: 0 0.25rem;
          color: var(--text-tertiary);
          font-size: var(--text-sm);
          user-select: none;
        }

        @media (max-width: 768px) {
          .filter-buttons {
            width: 100%;
            overflow-x: auto;
            padding-bottom: 0.5rem;
          }

          .pagination-bar {
            flex-direction: column;
            gap: 0.5rem;
          }

          .pagination-buttons {
            flex-wrap: wrap;
            justify-content: center;
          }
        }
      `}</style>

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
