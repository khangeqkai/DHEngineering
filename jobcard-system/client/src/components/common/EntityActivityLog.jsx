import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { History } from 'lucide-react';
import BottomSheet from './BottomSheet';

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
    <span className="eal-action" style={{ color: ACTION_COLORS[action] || 'var(--text-secondary)' }}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function formatChanges(changes) {
  if (!changes) return null;
  return Object.entries(changes).map(([field, change]) => (
    <div key={field} className="eal-change">
      <span className="eal-field">{field.replace(/_/g, ' ')}</span>
      {change.changed ? (
        <span className="eal-modified">modified</span>
      ) : (
        <span className="eal-diff">
          <span className="eal-from">
            {change.from != null && change.from !== '' ? change.from : '(empty)'}
          </span>
          <span className="eal-arrow">&rarr;</span>
          <span className="eal-to">
            {change.to != null && change.to !== '' ? change.to : '(empty)'}
          </span>
        </span>
      )}
    </div>
  ));
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

function formatTarget(snapshot) {
  if (!snapshot) return null;
  // User: show username (display name)
  if (snapshot.username) {
    return snapshot.name ? `${snapshot.username} (${snapshot.name})` : snapshot.username;
  }
  // Machine: show machine number (name)
  if (snapshot.machineNumber) {
    return snapshot.name ? `${snapshot.machineNumber} (${snapshot.name})` : snapshot.machineNumber;
  }
  // Contact: show contact name (company)
  if (snapshot.contactName) {
    return snapshot.companyName ? `${snapshot.contactName} (${snapshot.companyName})` : snapshot.contactName;
  }
  // Supplier: show company name
  if (snapshot.name) return snapshot.name;
  if (snapshot.companyName) return snapshot.companyName;
  return null;
}

export default function EntityActivityLog({ entityType, isOpen, onClose, refreshKey }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadHistory = useCallback(async (fetchPage) => {
    setLoading(true);
    try {
      const result = await api.getEntityHistory(entityType, fetchPage);
      setHistory(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (err) {
      toast.error('Failed to load activity history');
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  // Load on open
  useEffect(() => {
    if (isOpen) {
      loadHistory(1);
    } else {
      setHistory([]);
      setPage(1);
      setTotal(0);
      setTotalPages(0);
    }
  }, [isOpen, entityType, loadHistory]);

  // Refresh when parent signals data has changed
  useEffect(() => {
    if (isOpen && refreshKey) {
      loadHistory(page);
    }
  }, [refreshKey, isOpen, page, loadHistory]);

  const handlePageChange = (newPage) => {
    loadHistory(newPage);
  };

  const rangeStart = (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title="Activity Log"
        size="compact"
      >
        <div className="eal-modal">
          {loading ? (
            <div className="eal-status">Loading...</div>
          ) : history.length === 0 ? (
            <div className="eal-status">No activity recorded.</div>
          ) : (
            <>
              <div className="eal-list">
                {history.map((entry) => {
                  const target = formatTarget(entry.snapshot);
                  return (
                  <div key={entry.id} className="eal-entry">
                    <div className="eal-meta">
                      <span className="eal-user">{entry.userName || 'System'}</span>
                      {formatAction(entry.action)}
                      {target && <span className="eal-target">{target}</span>}
                      <span className="eal-time">{formatDate(entry.createdAt)}</span>
                    </div>
                    {entry.changes && (
                      <div className="eal-changes">
                        {formatChanges(entry.changes)}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="eal-pagination">
                  <span className="eal-pagination-info">
                    {rangeStart}&ndash;{rangeEnd} of {total}
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
                            {showEllipsis && <span className="eal-ellipsis">&hellip;</span>}
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
            </>
          )}
        </div>
      </BottomSheet>

      <style>{`
        .eal-modal {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }

        .eal-status {
          padding: 3rem 1.5rem;
          text-align: center;
          color: var(--text-secondary);
          font-size: var(--text-sm);
        }

        .eal-list {
          display: flex;
          flex-direction: column;
        }

        .eal-entry {
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid var(--border-color);
          transition: background 0.1s ease;
        }

        .eal-entry:last-child {
          border-bottom: none;
        }

        .eal-entry:hover {
          background: var(--surface-inset);
        }

        .eal-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .eal-user {
          font-weight: 600;
          font-size: var(--text-sm);
        }

        .eal-action {
          font-weight: 600;
          text-transform: capitalize;
          font-size: var(--text-xs);
        }

        .eal-target {
          font-size: var(--text-sm);
          color: var(--text-primary);
          font-weight: 500;
        }

        .eal-time {
          color: var(--text-secondary);
          font-size: var(--text-xs);
          margin-left: auto;
        }

        .eal-changes {
          margin-top: 0.375rem;
          padding-left: 0.75rem;
          font-size: var(--text-sm);
        }

        .eal-change {
          line-height: 1.6;
          display: flex;
          align-items: baseline;
          gap: 0.375rem;
          flex-wrap: wrap;
        }

        .eal-field {
          font-weight: 600;
          color: var(--text-secondary);
          font-size: var(--text-xs);
          text-transform: uppercase;
          letter-spacing: 0.025em;
          min-width: fit-content;
        }

        .eal-field::after {
          content: ':';
        }

        .eal-modified {
          color: var(--primary-accent);
          font-style: italic;
        }

        .eal-diff {
          display: inline-flex;
          align-items: baseline;
          gap: 0.375rem;
          flex-wrap: wrap;
          min-width: 0;
        }

        .eal-from {
          text-decoration: line-through;
          color: var(--accent-caution);
          word-break: break-word;
        }

        .eal-arrow {
          color: var(--text-tertiary);
          flex-shrink: 0;
        }

        .eal-to {
          color: var(--accent-ready);
          word-break: break-word;
        }

        .eal-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.625rem 1.25rem;
          border-top: 1px solid var(--border-color);
          background: var(--surface-inset);
          position: sticky;
          bottom: 0;
        }

        .eal-pagination-info {
          font-size: var(--text-xs);
          color: var(--text-secondary);
        }

        .eal-pagination-buttons {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }

        .eal-ellipsis {
          padding: 0 0.25rem;
          color: var(--text-tertiary);
          font-size: var(--text-sm);
          user-select: none;
        }
      `}</style>
    </>
  );
}
