import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';
import JobCardModal from './JobCardModal';

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

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    quotes: 0,
    open: 0,
    inProgress: 0,
    onHold: 0,
    done: 0,
    overdue: 0
  });
  const [recentCards, setRecentCards] = useState([]);
  const [overdueCards, setOverdueCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const allCards = await api.getJobcards();

      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const overdueList = allCards.filter(c =>
        c.dueDate && c.dueDate < today &&
        !['DONE', 'INVOICED'].includes(c.status)
      );

      setStats({
        total: allCards.length,
        quotes: allCards.filter(c => c.status === 'QUOTE').length,
        open: allCards.filter(c => c.status === 'OPEN').length,
        inProgress: allCards.filter(c => c.status === 'IN_PROGRESS').length,
        onHold: allCards.filter(c => c.status === 'ON_HOLD').length,
        done: allCards.filter(c => c.status === 'DONE').length,
        overdue: overdueList.length
      });

      setOverdueCards(overdueList.slice(0, 5));

      // Get recent cards (sorted by date, limit 5)
      const sorted = [...allCards].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      setRecentCards(sorted.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingCardId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cardId) => {
    setEditingCardId(cardId);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    loadData();
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

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <PageHeader title="Dashboard">
        <button className="btn btn-primary" onClick={openCreateModal}>
          + New Job Card
        </button>
      </PageHeader>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Active</div>
        </div>
        <div className="stat-card stat-quotes">
          <div className="stat-value">{stats.quotes}</div>
          <div className="stat-label">Quotes</div>
        </div>
        <div className="stat-card stat-open">
          <div className="stat-value">{stats.open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat-card stat-progress">
          <div className="stat-value">{stats.inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card stat-hold">
          <div className="stat-value">{stats.onHold}</div>
          <div className="stat-label">On Hold</div>
        </div>
        {stats.overdue > 0 && (
          <div className="stat-card stat-overdue">
            <div className="stat-value">{stats.overdue}</div>
            <div className="stat-label">Overdue</div>
          </div>
        )}
      </div>

      {/* Overdue Alert */}
      {overdueCards.length > 0 && (
        <div className="card overdue-card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header overdue-header">
            <h2>Overdue Jobs</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Job #</th>
                  <th>Customer</th>
                  <th>Due Date</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {overdueCards.map((card) => (
                  <tr key={card.id} className="overdue-row">
                    <td>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          openEditModal(card.id);
                        }}
                      >
                        {card.jobNumber}
                      </a>
                    </td>
                    <td>
                      {card.customerName || '-'}
                      {card.customerIsCritical && (
                        <span className="critical-badge">Critical</span>
                      )}
                    </td>
                    <td className="overdue-date">
                      {new Date(card.dueDate).toLocaleDateString()}
                    </td>
                    <td>
                      <span style={{ color: PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.NONE }}>
                        {card.priority || 'NONE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h2>Recent Job Cards</h2>
          <Link to="/jobcards" className="btn btn-secondary btn-sm">
            View All
          </Link>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {recentCards.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No job cards yet. Create your first one!
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
                </tr>
              </thead>
              <tbody>
                {recentCards.map((card) => {
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
                          {card.jobNumber}
                        </a>
                      </td>
                      <td>
                        {card.customerName || '-'}
                        {card.customerIsCritical && (
                          <span className="critical-badge">Critical</span>
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
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 1rem;
        }

        .stat-card {
          background: var(--surface);
          border-radius: 0.75rem;
          padding: 1.25rem;
          box-shadow: var(--shadow);
        }

        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .stat-quotes .stat-value {
          color: var(--text-secondary);
        }

        .stat-open .stat-value {
          color: var(--warning-color);
        }

        .stat-progress .stat-value {
          color: var(--primary-color);
        }

        .stat-hold .stat-value {
          color: var(--text-secondary);
        }

        .stat-overdue {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--danger-color);
        }

        .stat-overdue .stat-value {
          color: var(--danger-color);
        }

        .overdue-card {
          border: 1px solid var(--danger-color);
        }

        .overdue-header {
          background: rgba(239, 68, 68, 0.1) !important;
        }

        .overdue-header h2 {
          color: var(--danger-color) !important;
        }

        .overdue-row {
          background: rgba(239, 68, 68, 0.05);
        }

        .overdue-date {
          color: var(--danger-color);
          font-weight: 600;
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

        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
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
