import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Activity, FileText, FolderOpen, Loader, Pause, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
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
      console.error('Failed to load job cards:', error);
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

    // Note: jobcards from API use camelCase (dueDate)
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

    // Get recent cards (already sorted by created_at desc in the hook)
    const recent = jobcards.slice(0, 5);

    return {
      stats: calculatedStats,
      overdueCards: overdueList.slice(0, 5),
      recentCards: recent
    };
  }, [jobcards]);

  // Chart data derived from stats
  const chartData = useMemo(() => {
    const statusData = [
      { name: 'Quotes', value: stats.quotes, key: 'QUOTE' },
      { name: 'Open', value: stats.open, key: 'OPEN' },
      { name: 'In Progress', value: stats.inProgress, key: 'IN_PROGRESS' },
      { name: 'On Hold', value: stats.onHold, key: 'ON_HOLD' },
      { name: 'Done', value: stats.done, key: 'DONE' },
    ].filter(d => d.value > 0);

    const barData = [
      { name: 'Quotes', count: stats.quotes, fill: CHART_COLORS.QUOTE },
      { name: 'Open', count: stats.open, fill: CHART_COLORS.OPEN },
      { name: 'In Progress', count: stats.inProgress, fill: CHART_COLORS.IN_PROGRESS },
      { name: 'On Hold', count: stats.onHold, fill: CHART_COLORS.ON_HOLD },
    ];

    return { statusData, barData };
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
    // Reload job cards when modal closes with success
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
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={16} /> New Job Card
        </button>
      </PageHeader>

      <div className="stats-grid">
        <div className="stat-card stat-hero">
          <div className="stat-icon-wrapper stat-icon-hero">
            <Activity size={24} />
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Active</div>
        </div>
        <div className="stat-card stat-quotes">
          <div className="stat-icon-wrapper stat-icon-quotes">
            <FileText size={24} />
          </div>
          <div className="stat-value">{stats.quotes}</div>
          <div className="stat-label">Quotes</div>
        </div>
        <div className="stat-card stat-open">
          <div className="stat-icon-wrapper stat-icon-open">
            <FolderOpen size={24} />
          </div>
          <div className="stat-value">{stats.open}</div>
          <div className="stat-label">Open</div>
        </div>
        <div className="stat-card stat-progress">
          <div className="stat-icon-wrapper stat-icon-progress">
            <Loader size={24} />
          </div>
          <div className="stat-value">{stats.inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card stat-hold">
          <div className="stat-icon-wrapper stat-icon-hold">
            <Pause size={24} />
          </div>
          <div className="stat-value">{stats.onHold}</div>
          <div className="stat-label">On Hold</div>
        </div>
        {stats.overdue > 0 && (
          <div className="stat-card stat-overdue">
            <div className="stat-icon-wrapper stat-icon-overdue">
              <AlertTriangle size={24} />
            </div>
            <div className="stat-value">{stats.overdue}</div>
            <div className="stat-label">Overdue</div>
          </div>
        )}
      </div>

      {/* Charts */}
      {stats.total > 0 && (
        <div className="charts-section">
          <div className="chart-card">
            <h3>Job Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData.statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {chartData.statusData.map((entry) => (
                    <Cell key={entry.key} fill={CHART_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <h3>Active Jobs by Status</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  tickLine={{ stroke: 'var(--border-color)' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                  axisLine={{ stroke: 'var(--border-color)' }}
                  tickLine={{ stroke: 'var(--border-color)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.barData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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

      <JobCardModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        jobCardId={editingCardId}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
