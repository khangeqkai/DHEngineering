import { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';
import JobCardModal from './jobcard/JobCardModal';

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

export default function JobCardList() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);
  const [jobcards, setJobcards] = useState([]);
  const [loading, setLoading] = useState(true);

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
    if (!confirm('Are you sure you want to delete this job card?')) return;

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
        card.job_number?.toLowerCase().includes(search.toLowerCase()) ||
        card.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        card.description?.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [jobcards, filter, search]);

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
    <div className="jobcard-list">
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
                {filteredCards.map((card) => {
                  const isOverdue = card.due_date &&
                    new Date(card.due_date) < new Date() &&
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
                          <strong>{card.job_number}</strong>
                        </a>
                        {card.description && (
                          <p className="description-preview">
                            {card.description.substring(0, 60)}
                            {card.description.length > 60 ? '...' : ''}
                          </p>
                        )}
                      </td>
                      <td>
                        {card.customer_name || '-'}
                        {card.customer_is_critical && (
                          <span className="critical-badge">Critical</span>
                        )}
                      </td>
                      <td>{card.job_type || '-'}</td>
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
                        {card.due_date ? new Date(card.due_date).toLocaleDateString() : '-'}
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
          border-radius: 0.5rem;
          font-size: 0.875rem;
          background: var(--surface);
          color: var(--text-primary);
        }

        .search-input:focus {
          outline: none;
          border-color: var(--primary-color);
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
          font-size: 0.875rem;
          cursor: pointer;
        }

        .description-preview {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
          margin-bottom: 0;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .critical-badge {
          background: var(--danger-color);
          color: white;
          font-size: 0.625rem;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          margin-left: 0.5rem;
          text-transform: uppercase;
          font-weight: 600;
        }

        .overdue-row {
          background: rgba(239, 68, 68, 0.05);
        }

        .overdue-date {
          color: var(--danger-color);
          font-weight: 600;
        }

        .overdue-label {
          display: block;
          font-size: 0.625rem;
          text-transform: uppercase;
          margin-top: 0.25rem;
        }

        @media (max-width: 768px) {
          .filter-buttons {
            width: 100%;
            overflow-x: auto;
            padding-bottom: 0.5rem;
          }
        }
      `}</style>

      <JobCardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        jobCardId={editingCardId}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
