import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Activity, FileText, FolderOpen, Loader, Pause, AlertTriangle, CheckCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import PageHeader from './common/PageHeader';
import JobCardModal from './jobcard/JobCardModal';
import QuickActionPanel from './jobcard/QuickActionPanel';
import { useActiveTimerIndicator } from '../hooks/useActiveTimerIndicator';
import EmptyState from './common/EmptyState';
import CountUp from './common/CountUp';
import SpotlightCard from './common/SpotlightCard';
import StarBorder from './common/StarBorder';
import './common/SpotlightCard.css';
import './Dashboard.css';

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

const CHART_COLORS = {
  QUOTE: '#94a3b8',
  OPEN: '#eab308',
  AWAITING_MATERIAL: '#8b5cf6',
  IN_PROGRESS: '#3b82f6',
  TREATMENT: '#f97316',
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
  const [quickActionCard, setQuickActionCard] = useState(null);
  const { activeTimerJobcardId, formattedElapsed, refresh: refreshTimer } = useActiveTimerIndicator();

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
      awaitingMaterial: jobcards.filter(c => c.status === 'AWAITING_MATERIAL').length,
      treatment: jobcards.filter(c => c.status === 'TREATMENT').length,
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
      { name: 'Awaiting Material', value: stats.awaitingMaterial, key: 'AWAITING_MATERIAL' },
      { name: 'In Progress', value: stats.inProgress, key: 'IN_PROGRESS' },
      { name: 'Treatment', value: stats.treatment, key: 'TREATMENT' },
      { name: 'On Hold', value: stats.onHold, key: 'ON_HOLD' },
      { name: 'Done', value: stats.done, key: 'DONE' },
    ].filter(d => d.value > 0);
  }, [stats]);

  const handleModalClose = useCallback(() => setIsModalOpen(false), []);
  const handleQuickActionClose = useCallback(() => setQuickActionCard(null), []);
  const handleViewDetails = useCallback((cardId) => {
    setQuickActionCard(null);
    setEditingCardId(cardId);
    setIsModalOpen(true);
  }, []);

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
      case 'AWAITING_MATERIAL': return 'badge-awaiting-material';
      case 'TREATMENT': return 'badge-treatment';
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
    <div className="dashboard page-enter">
      <PageHeader title="Dashboard">
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> New Job Card
          </button>
        )}
      </PageHeader>

      {/* Compact stat chips */}
      <div className="stats-strip">
        <StarBorder as="div" color="rgba(37, 99, 235, 0.6)" speed="4s">
          <Link to="/jobcards" className="stat-chip stat-chip-hero">
            <div className="stat-chip-icon">
              <Activity size={15} />
            </div>
            <div className="stat-chip-text">
              <span className="stat-chip-value"><CountUp to={stats.total} duration={1.5} /></span>
              <span className="stat-chip-label">All Jobs</span>
            </div>
          </Link>
        </StarBorder>
        <Link to="/jobcards?filter=QUOTE" className="stat-chip stat-chip-quotes">
          <div className="stat-chip-icon">
            <FileText size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value"><CountUp to={stats.quotes} duration={1.5} /></span>
            <span className="stat-chip-label">Quotes</span>
          </div>
        </Link>
        <Link to="/jobcards?filter=OPEN" className="stat-chip stat-chip-open">
          <div className="stat-chip-icon">
            <FolderOpen size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value"><CountUp to={stats.open} duration={1.5} /></span>
            <span className="stat-chip-label">Open</span>
          </div>
        </Link>
        <Link to="/jobcards?filter=IN_PROGRESS" className="stat-chip stat-chip-progress">
          <div className="stat-chip-icon">
            <Loader size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value"><CountUp to={stats.inProgress} duration={1.5} /></span>
            <span className="stat-chip-label">In Progress</span>
          </div>
        </Link>
        <Link to="/jobcards?filter=ON_HOLD" className="stat-chip stat-chip-hold">
          <div className="stat-chip-icon">
            <Pause size={15} />
          </div>
          <div className="stat-chip-text">
            <span className="stat-chip-value"><CountUp to={stats.onHold} duration={1.5} /></span>
            <span className="stat-chip-label">On Hold</span>
          </div>
        </Link>
        {stats.overdue > 0 && (
          <Link to="/jobcards?filter=OVERDUE" className="stat-chip stat-chip-overdue">
            <div className="stat-chip-icon">
              <AlertTriangle size={15} />
            </div>
            <div className="stat-chip-text">
              <span className="stat-chip-value"><CountUp to={stats.overdue} duration={1.5} /></span>
              <span className="stat-chip-label">Overdue</span>
            </div>
          </Link>
        )}
      </div>

      {/* Two-column: Chart + Overdue */}
      <div className="dashboard-grid">
        {stats.total > 0 && (
          <SpotlightCard className="chart-card" spotlightColor="rgba(37, 99, 235, 0.06)">
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
          </SpotlightCard>
        )}

        {/* Overdue jobs table with full-width action button */}
        {overdueCards.length > 0 ? (
          <StarBorder as="div" color="rgba(239, 68, 68, 0.6)" speed="4s">
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
                    {isAdmin && <th>Company</th>}
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
                            setQuickActionCard(card);
                          }}
                        >
                          {card.jobNumber}
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
                      </td>
                      {isAdmin && (
                        <td>{card.companyName || '-'}</td>
                      )}
                      {isAdmin && (
                        <td>{card.contactName || '-'}</td>
                      )}
                      <td className="overdue-date">
                        {new Date(card.dueDate).toLocaleDateString()}
                      </td>
                      <td>
                        <span style={{ color: PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.NONE }}>
                          {PRIORITY_LABELS[card.priority] || 'None'}
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
          </StarBorder>
        ) : stats.total > 0 ? (
          <div className="card no-overdue-card">
            <div className="no-overdue-content">
              <div className="no-overdue-icon">
                <CheckCircle size={32} />
              </div>
              <h3>All On Track</h3>
              <p>No overdue jobs — everything is running on schedule.</p>
            </div>
          </div>
        ) : null}

        {/* Recent Job Cards - full width */}
        <SpotlightCard className="card dashboard-grid-full" spotlightColor="rgba(37, 99, 235, 0.06)">
          <div className="card-header">
            <h2>Recent Job Cards</h2>
            <Link to="/jobcards" className="btn btn-secondary btn-sm">
              View All
            </Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {recentCards.length === 0 ? (
              <EmptyState
                icon="jobcards"
                title="No job cards yet"
                description="Create your first job card to get started."
                actionLabel={isAdmin ? 'New Job Card' : undefined}
                onAction={isAdmin ? openCreateModal : undefined}
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Job #</th>
                    {isAdmin && <th>Company</th>}
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
                              setQuickActionCard(card);
                            }}
                          >
                            {card.jobNumber}
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
                        </td>
                        {isAdmin && (
                          <td>{card.companyName || '-'}</td>
                        )}
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
                            {PRIORITY_LABELS[card.priority] || 'None'}
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
        </SpotlightCard>
      </div>

      <QuickActionPanel
        isOpen={!!quickActionCard}
        onClose={handleQuickActionClose}
        jobCard={quickActionCard}
        onViewDetails={handleViewDetails}
        onTimerChange={refreshTimer}
      />

      <JobCardModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        jobCardId={editingCardId}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
