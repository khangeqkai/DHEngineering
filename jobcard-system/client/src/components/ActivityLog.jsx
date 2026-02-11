import { useEffect, useState } from 'react';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';

export default function ActivityLog() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadActivities();
  }, [limit]);

  const loadActivities = async () => {
    try {
      const data = await api.getActivityHistory(limit);
      setActivities(data);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action) => {
    const colors = {
      create: '#16a34a',
      update: '#2563eb',
      delete: '#dc2626',
      login: '#8b5cf6',
      deactivate: '#f59e0b',
      activate: '#10b981',
      'add_photo': '#10b981',
      'remove_photo': '#dc2626'
    };
    return (
      <span style={{
        color: colors[action] || '#64748b',
        fontWeight: 500,
        textTransform: 'capitalize'
      }}>
        {action.replace('_', ' ')}
      </span>
    );
  };

  const formatChanges = (changes) => {
    if (!changes) return null;
    return Object.entries(changes).map(([field, change]) => (
      <div key={field} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <strong>{field.replace('_', ' ')}:</strong>{' '}
        {change.changed ? (
          <span style={{ color: '#2563eb', fontStyle: 'italic' }}>modified</span>
        ) : (
          <>
            <span style={{ textDecoration: 'line-through', color: '#dc2626' }}>
              {change.from || '(empty)'}
            </span>
            {' → '}
            <span style={{ color: '#16a34a' }}>{change.to || '(empty)'}</span>
          </>
        )}
      </div>
    ));
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (loading) {
    return <div className="loading">Loading activity log...</div>;
  }

  return (
    <div className="activity-log">
      <PageHeader title="Activity Log">
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="limit-select"
        >
          <option value={25}>Last 25</option>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={200}>Last 200</option>
        </select>
      </PageHeader>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {activities.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No activity recorded yet.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Type</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(activity.createdAt)}
                    </td>
                    <td>{activity.userName || 'System'}</td>
                    <td>{formatAction(activity.action)}</td>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>
                        {activity.entityType}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.875rem' }}>
                        <code style={{
                          fontSize: '0.7rem',
                          background: 'var(--background)',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem'
                        }}>
                          {activity.entityId}
                        </code>
                      </div>
                      {formatChanges(activity.changes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        .limit-select {
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          border: 1px solid var(--border-color);
          background: var(--surface);
          color: var(--text-primary);
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
