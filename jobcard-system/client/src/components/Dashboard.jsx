import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Activity, FileText, FolderOpen, Loader, Pause, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import PageHeader from './common/PageHeader';
import JobCardModal from './jobcard/JobCardModal';
import './Dashboard.css';

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

const CHART_COLORS = {
  QUOTE: '#94a3b8',
  OPEN: '#eab308',
  IN_PROGRESS: '#0284c7',
  ON_HOLD: '#64748b',
  DONE: '#22c55e',
  INVOICED: '#16a34a'
};

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [jobcards, setJobcards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState(null);

  // Load job cards from API
  const loadJobcards = async () => {
    try {
      setLoading(true);
      const data = await api.getJobcards();
      setJobcards(data);
    } catch (error) {
      toast.error('Failed to load job cards. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobcards();
  }, []);

  // Calculate stats and derived data from live query results
  const { stats, overdueCards, recentCards } = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    const overdueList = jobcards.filter(c =>
      c.dueDate && c.dueDate < today &&
      !['DONE', 'INVOICED'].includes(c.status)
    );

    const calculatedStats = {
      total: jobcards.length,
      quotes: jobcards.filter(c => c.status === 'QUOTE').length,
      open: jobcards.filter(c => c.status === 'OPEN').length,
      inProgress: jobcards.filter(c => c.status === 'IN_PROGRESS').length,
      onHold: jobcards.filter(c => c.status === 'ON_HOLD').length,
      done: jobcards.filter(c => c.status === 'DONE').length,
      overdue: overdueList.length
    };

    const recent = jobcards.slice(0, 5);

    return {
      stats: calculatedStats,
      overdueCards: overdueList.slice(0, 10),
      recentCards: recent
    };
  }, [jobcards]);

  // Chart data derived from stats
  const chartData = useMemo(() => {
    return [
      { name: 'Quotes', value: stats.quotes, key: 'QUOTE' },
      { name: 'Open', value: stats.open, key: 'OPEN' },
      { name: 'In Progress', value: stats.inProgress, key: 'IN_PROGRESS' },
      { name: 'On Hold', value: stats.onHold, key: 'ON_HOLD' },
      { name: 'Done', value: stats.done, key: 'DONE' },
    ].filter(d => d.value > 0);
  }, [stats]);

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
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> New Job Card
          </button>
        )}
      </PageHeader>

      {/* Compact stat chips */}
      <div className="stats-strip">
        <div className="stat-chip stat-chip-hero">
          <div className="stat-chip-icon">
            <Activity size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value">{stats.total}</span>
            <span className="stat-chip-label">Active</span>
          </div>
        </div>
        <div className="stat-chip stat-chip-quotes">
          <div className="stat-chip-icon">
            <FileText size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value">{stats.quotes}</span>
            <span className="stat-chip-label">Quotes</span>
          </div>
        </div>
        <div className="stat-chip stat-chip-open">
          <div className="stat-chip-icon">
            <FolderOpen size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value">{stats.open}</span>
            <span className="stat-chip-label">Open</span>
          </div>
        </div>
        <div className="stat-chip stat-chip-progress">
          <div className="stat-chip-icon">
            <Loader size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value">{stats.inProgress}</span>
            <span className="stat-chip-label">In Progress</span>
          </div>
        </div>
        <div className="stat-chip stat-chip-hold">
          <div className="stat-chip-icon">
            <Pause size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value">{stats.onHold}</span>
            <span className="stat-chip-label">On Hold</span>
          </div>
        </div>
        {stats.overdue > 0 && (
          <div className="stat-chip stat-chip-overdue">
            <div className="stat-chip-icon">
              <AlertTriangle size={15} />
            </div>
            <div className="stat-chip-text">
              <span className="stat-chip-value">{stats.overdue}</span>
              <span className="stat-chip-label">Overdue</span>
            </div>
          </div>
        )}
      </div>

      {/* Two-column: Chart + Overdue */}
      <div className="dashboard-grid">
        {stats.total > 0 && (
          <div className="chart-card">
            <h3>Job Status</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={CHART_COLORS[entry.key]} />
                  ))}
                </Pie>
                {/* Center label */}
                <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="donut-center-total">
                  {stats.total}
                </text>
                <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle" className="donut-center-label">
                  Total
                </text>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value, entry) => {
                    const item = chartData.find(d => d.name === value);
                    return `${value} (${item?.value || 0})`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Overdue jobs table with full-width action button */}
        {overdueCards.length > 0 ? (
          <div className="card overdue-card">
            <div className="card-header overdue-header">
              <h2>Overdue Jobs</h2>
              <span className="overdue-count">{stats.overdue}</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Job #</th>
                    {isAdmin && <th>Customer</th>}
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
                        {card.qualityLevel === 'CRITICAL' && (
                          <span className="critical-badge">Critical QA</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td>{card.contactName || '-'}</td>
                      )}
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
            <Link to="/jobcards?filter=OVERDUE" className="overdue-view-all-btn">
              <AlertTriangle size={16} />
              View All Overdue Jobs ({stats.overdue})
            </Link>
          </div>
        ) : stats.total === 0 ? null : (
          <div />
        )}

        {/* Recent Job Cards - full width */}
        <div className="card dashboard-grid-full">
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
                    {isAdmin && <th>Customer</th>}
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
                          {card.qualityLevel === 'CRITICAL' && (
                            <span className="critical-badge">Critical QA</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td>{card.contactName || '-'}</td>
                        )}
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
      </div>

      <JobCardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        jobCardId={editingCardId}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
