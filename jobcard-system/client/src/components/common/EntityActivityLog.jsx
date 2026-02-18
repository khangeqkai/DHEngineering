import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { ChevronDown, ChevronRight } from 'lucide-react';

const ACTION_COLORS = {
  create: 'var(--accent-ready)',
  update: 'var(--primary-accent)',
  delete: 'var(--accent-caution)',
  login: 'var(--accent-info)',
  deactivate: 'var(--accent-safety)',
  activate: 'var(--accent-ready)',
  add_photo: 'var(--accent-ready)',
  remove_photo: 'var(--accent-caution)'
};

const PAGE_SIZE = 50;

function formatAction(action) {
  return (
    <span style={{
      color: ACTION_COLORS[action] || 'var(--text-secondary)',
      fontWeight: 600,
      textTransform: 'capitalize',
      fontSize: 'var(--text-xs)'
    }}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function formatChanges(changes) {
  if (!changes) return null;
  return Object.entries(changes).map(([field, change]) => (
    <div key={field} className="entity-activity-change">
      <strong>{field.replace(/_/g, ' ')}:</strong>{' '}
      {change.changed ? (
        <span style={{ color: 'var(--primary-accent)', fontStyle: 'italic' }}>modified</span>
      ) : (
        <>
          <span style={{ textDecoration: 'line-through', color: 'var(--accent-caution)' }}>
            {change.from != null && change.from !== '' ? change.from : '(empty)'}
          </span>
          {' → '}
          <span style={{ color: 'var(--accent-ready)' }}>{change.to != null && change.to !== '' ? change.to : '(empty)'}</span>
        </>
      )}
    </div>
  ));
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

export default function EntityActivityLog({ entityType }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setHistory([]);
    setPage(1);
    setTotal(0);
    setTotalPages(0);
    if (expanded) {
      loadHistory(1);
    }
  }, [entityType]);

  const loadHistory = useCallback(async (fetchPage) => {
    setLoading(true);
    try {
      const result = await api.getEntityHistory(entityType, fetchPage);
      setHistory(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
      setLoaded(true);
    } catch (err) {
      toast.error('Failed to load activity history');
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) {
      loadHistory(1);
    }
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    loadHistory(newPage);
  };

  const label = entityType === 'user' ? 'User' : entityType === 'supplier' ? 'Supplier' : 'Contact';
  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div
        className="card-header"
        onClick={handleToggle}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span style={{ fontWeight: 600 }}>{label} Activity Log</span>
          {loaded && (
            <span className="badge badge-pending" style={{ fontSize: 'var(--text-xs)' }}>
              {total}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading" style={{ padding: '1.5rem' }}>Loading activity log...</div>
          ) : history.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem' }}>No activity recorded.</div>
          ) : (
            <div className="entity-activity-list">
              {history.map((entry) => (
                <div key={entry.id} className="entity-activity-entry">
                  <div className="entity-activity-meta">
                    <span className="entity-activity-user">{entry.userName || 'System'}</span>
                    {formatAction(entry.action)}
                    <span className="entity-activity-time">{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.changes && (
                    <div className="entity-activity-changes">
                      {formatChanges(entry.changes)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && !loading && (
            <div className="eal-pagination-bar">
              <span className="eal-pagination-info">
                {rangeStart}–{rangeEnd} of {total}
              </span>
              <div className="eal-pagination-buttons">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (totalPages <= 7) return true;
                    if (p === 1 || p === totalPages) return true;
                    if (Math.abs(p - page) <= 1) return true;
                    return false;
                  })
                  .map((p, idx, arr) => {
                    const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                    return (
                      <span key={p} style={{ display: 'contents' }}>
                        {showEllipsis && <span className="eal-pagination-ellipsis">&hellip;</span>}
                        <button
                          className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => handlePageChange(p)}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .entity-activity-list {
          display: flex;
          flex-direction: column;
        }

        .entity-activity-entry {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .entity-activity-entry:last-child {
          border-bottom: none;
        }

        .entity-activity-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .entity-activity-user {
          font-weight: 600;
          font-size: var(--text-sm);
        }

        .entity-activity-time {
          color: var(--text-secondary);
          font-size: var(--text-xs);
          margin-left: auto;
        }

        .entity-activity-changes {
          margin-top: 0.375rem;
          padding-left: 0.5rem;
          font-size: var(--text-sm);
        }

        .entity-activity-change {
          line-height: 1.5;
        }

        .eal-pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-top: 1px solid var(--border-color);
          background: var(--surface-inset);
          flex-shrink: 0;
        }

        .eal-pagination-info {
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }

        .eal-pagination-buttons {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }

        .eal-pagination-ellipsis {
          padding: 0 0.25rem;
          color: var(--text-tertiary);
          font-size: var(--text-sm);
          user-select: none;
        }
      `}</style>
    </div>
  );
}
