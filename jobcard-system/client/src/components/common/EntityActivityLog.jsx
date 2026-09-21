import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { History } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { formatHistoryValue, formatDateTime } from '../../utils/formatters';
import { actionColor } from '../../utils/activityColors';
import './EntityActivityLog.css';

const PAGE_SIZE = 50;

function formatAction(action) {
  return (
    <span className="eal-action" style={{ color: actionColor(action) }}>
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
            {formatHistoryValue(field, change.from) || '(empty)'}
          </span>
          <span className="eal-arrow">&rarr;</span>
          <span className="eal-to">
            {formatHistoryValue(field, change.to) || '(empty)'}
          </span>
        </span>
      )}
    </div>
  ));
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
  // Contact: show company name (contact)
  if (snapshot.companyName && snapshot.contactName) {
    return `${snapshot.companyName} (${snapshot.contactName})`;
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
                    <span className="eal-time">{formatDateTime(entry.createdAt)}</span>
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
  );
}
