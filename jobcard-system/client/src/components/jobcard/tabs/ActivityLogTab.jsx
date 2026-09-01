import { formatHistoryValue, formatDateTime } from '../../../utils/formatters';
import { actionColor } from '../../../utils/activityColors';

export default function ActivityLogTab({ history = [], loading, onRefresh }) {
  const formatAction = (action) => (
    <span style={{
      color: actionColor(action),
      fontWeight: 600,
      textTransform: 'capitalize',
      fontSize: 'var(--text-xs)'
    }}>
      {action.replace(/_/g, ' ')}
    </span>
  );

  const formatChanges = (changes) => {
    if (!changes) return null;
    return Object.entries(changes).map(([field, change]) => (
      <div key={field} className="activity-log-change">
        <strong>{field.replace(/_/g, ' ')}:</strong>{' '}
        {change.changed ? (
          <span style={{ color: 'var(--primary-accent)', fontStyle: 'italic' }}>modified</span>
        ) : (
          <>
            <span style={{ textDecoration: 'line-through', color: 'var(--accent-caution)' }}>
              {formatHistoryValue(field, change.from) || '(empty)'}
            </span>
            {' → '}
            <span style={{ color: 'var(--accent-ready)' }}>{formatHistoryValue(field, change.to) || '(empty)'}</span>
          </>
        )}
      </div>
    ));
  };


  if (loading) {
    return <div className="loading" style={{ padding: '2rem' }}>Loading activity log...</div>;
  }

  return (
    <div className="form-section">
      <div className="form-section-header">
        <div className="form-section-title">Activity Log</div>
        <button type="button" className="btn" onClick={onRefresh}>Refresh</button>
      </div>

      {history.length === 0 ? (
        <div className="empty-state">No activity recorded for this job card.</div>
      ) : (
        <div className="activity-log-list">
          {history.map((entry, idx) => (
            <div key={entry.id || idx} className="activity-log-entry">
              <div className="activity-log-meta">
                <span className="activity-log-user">{entry.userName || 'System'}</span>
                {formatAction(entry.action)}
                <span className="activity-log-time">{formatDateTime(entry.createdAt)}</span>
              </div>
              {entry.changes && (
                <div className="activity-log-changes">
                  {formatChanges(entry.changes)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
