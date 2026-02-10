import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../services/db';

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0
  });
  const [recentCards, setRecentCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    // Reload on sync changes
    const unsubscribe = db.onSyncEvent((type) => {
      if (type === 'change') {
        loadData();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      const allCards = await db.getAllJobCards();

      // Calculate stats
      setStats({
        total: allCards.length,
        pending: allCards.filter((c) => c.status === 'pending').length,
        inProgress: allCards.filter((c) => c.status === 'in-progress').length,
        completed: allCards.filter((c) => c.status === 'completed').length
      });

      // Get recent cards (sorted by date, limit 5)
      const sorted = allCards.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      setRecentCards(sorted.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <Link to="/jobcards/new" className="btn btn-primary">
          + New Job Card
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Job Cards</div>
        </div>
        <div className="stat-card stat-pending">
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card stat-progress">
          <div className="stat-value">{stats.inProgress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card stat-completed">
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
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
                  <th>Title</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentCards.map((card) => (
                  <tr key={card._id}>
                    <td>
                      <Link to={`/jobcards/${card._id}`}>{card.title}</Link>
                    </td>
                    <td>{card.customer?.name || '-'}</td>
                    <td>
                      <span className={`badge badge-${card.status}`}>
                        {card.status}
                      </span>
                    </td>
                    <td>{new Date(card.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .stat-card {
          background: var(--surface);
          border-radius: 0.75rem;
          padding: 1.5rem;
          box-shadow: var(--shadow);
        }

        .stat-value {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .stat-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        .stat-pending .stat-value {
          color: var(--warning-color);
        }

        .stat-progress .stat-value {
          color: var(--primary-color);
        }

        .stat-completed .stat-value {
          color: var(--success-color);
        }
      `}</style>
    </div>
  );
}
