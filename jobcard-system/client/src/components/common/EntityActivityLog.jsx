import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { History } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { describeActivity } from '../../utils/activitySentences';
import { dayTime } from '../../utils/historySentences';
import './EntityActivityLog.css';

const PAGE_SIZE = 50;

// One sentence: names in bold, the old value in small grey.
function Sentence({ line }) {
  return (
    <>
      {line.parts.map((part, i) => (
        part.strong
          ? <strong key={i} className="eal-strong">{part.text}</strong>
          : <span key={i}>{part.text}</span>
      ))}
      {line.was && <span className="eal-was"> was {line.was}</span>}
    </>
  );
}

// An entry in words, worded by the same code as the main Activity Log.
function EntityEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const { kind, ring, headline, details } = describeActivity(entry);
  const lone = details.length === 1;
  return (
    <div className="eal-entry">
      <span className={`eal-dot eal-dot-${kind}${ring ? ' eal-dot-ring' : ''}`} aria-hidden="true" />
      <div className="eal-entry-body">
        <div className="eal-entry-line">
          <p className="eal-sentence"><Sentence line={headline} /></p>
          <span className="eal-time">{dayTime(entry.createdAt)}</span>
        </div>
        {details.length > 1 && (
          <button type="button" className="eal-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide' : `Show ${details.length} more`}
          </button>
        )}
        {(lone || (expanded && details.length > 1)) && (
          <ul className="eal-details">
            {details.map((line, i) => <li key={i}><Sentence line={line} /></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function EntityActivityLog({ entityType, isOpen, onClose, refreshKey }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const startRequest = useLatestRequest();

  const loadHistory = useCallback(async (fetchPage) => {
    const isLatest = startRequest();
    setLoading(true);
    try {
      const result = await api.getEntityHistory(entityType, fetchPage);
      if (!isLatest()) return;
      setHistory(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (err) {
      if (isLatest()) toast.error('Couldn\'t load the activity history. Try again in a moment.');
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [entityType, startRequest]);

  // Load on open
  useEffect(() => {
    if (isOpen) {
      loadHistory(1);
    } else {
      startRequest(); // a page still loading when the panel closed must not land later
      setHistory([]);
      setPage(1);
      setTotal(0);
      setTotalPages(0);
    }
  }, [isOpen, entityType, loadHistory, startRequest]);

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
          <div className="eal-status">Loading…</div>
        ) : history.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <History size={40} strokeWidth={1.5} />
            <p>No activity recorded yet.</p>
          </div>
        ) : (
          <>
            <div className="eal-list">
              {history.map((entry) => <EntityEntry key={entry.id} entry={entry} />)}
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
