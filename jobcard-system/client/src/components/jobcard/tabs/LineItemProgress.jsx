import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';
import TimeEntryCard from './TimeEntryCard';

function parseQty(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function computeProgress(entries, targetQty) {
  // Cumulative-after-each-session, walking oldest → newest among completed entries.
  const completed = entries.filter(e => e.endTime);
  const oldestFirst = [...completed].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime)
  );
  const cumulativeMap = new Map();
  let running = 0;
  let scrapTotal = 0;
  for (const e of oldestFirst) {
    running += parseQty(e.qty);
    scrapTotal += parseQty(e.scrapQty);
    cumulativeMap.set(e.id, running);
  }
  const completedQty = running;
  const scrapDenom = completedQty + scrapTotal;
  const scrapRate = scrapDenom > 0 ? (scrapTotal / scrapDenom) * 100 : 0;

  const target = parseFloat(targetQty);
  const hasTarget = Number.isFinite(target) && target > 0;
  const remaining = hasTarget ? Math.max(0, target - completedQty) : null;
  const overage = hasTarget ? Math.max(0, completedQty - target) : 0;
  const percent = hasTarget ? Math.min(100, (completedQty / target) * 100) : 0;
  const hasActive = entries.some(e => !e.endTime);
  const sessions = entries.length;

  let state = 'idle';
  if (hasActive && completedQty === 0) state = 'started';
  else if (hasActive) state = 'active';
  else if (hasTarget && completedQty >= target) state = 'done';
  else if (completedQty > 0) state = 'partial';
  else if (sessions > 0) state = 'logged';

  return {
    target: hasTarget ? target : null,
    hasTarget,
    completed: completedQty,
    scrapTotal,
    scrapRate,
    remaining,
    overage,
    percent,
    sessions,
    state,
    hasActive,
    cumulativeMap
  };
}

function formatNum(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function StatusPill({ state }) {
  switch (state) {
    case 'done':
      return <span className="lip-pill lip-pill--done"><span className="lip-pill-glyph">✓</span>Done</span>;
    case 'active':
      return <span className="lip-pill lip-pill--active"><span className="lip-pill-dot" />Active</span>;
    case 'started':
      return <span className="lip-pill lip-pill--started"><span className="lip-pill-dot" />Started</span>;
    case 'partial':
      return <span className="lip-pill lip-pill--partial">Partial</span>;
    case 'logged':
      return <span className="lip-pill lip-pill--logged">Logged</span>;
    case 'idle':
    default:
      return <span className="lip-pill lip-pill--idle">Not started</span>;
  }
}

export default function LineItemProgress({
  entries = [],
  targetQty = null,
  isAdmin = false,
  onAdd,
  onEdit,
  onDelete,
  onStop,
  onToggleSpecial
}) {
  const progress = useMemo(() => computeProgress(entries, targetQty), [entries, targetQty]);

  const [open, setOpen] = useState(progress.hasActive);
  const prevHasActive = useRef(progress.hasActive);

  useEffect(() => {
    if (progress.hasActive && !prevHasActive.current) setOpen(true);
    prevHasActive.current = progress.hasActive;
  }, [progress.hasActive]);

  const cardProps = isAdmin
    ? { onEdit, onDelete, onStop, onToggleSpecial }
    : { readOnly: true };

  const activeEntries = entries.filter(e => !e.endTime);
  const completedEntries = entries.filter(e => e.endTime);
  const showGroupLabels = activeEntries.length > 0 && completedEntries.length > 0;

  const renderCard = (e) => (
    <TimeEntryCard
      key={e.id}
      entry={e}
      cumulativeAfter={progress.cumulativeMap.get(e.id)}
      target={progress.hasTarget ? progress.target : null}
      {...cardProps}
    />
  );

  return (
    <details
      className={`line-item-progress lip--${progress.state}${progress.overage > 0 ? ' lip--over' : ''}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="lip-summary">
        <span className="lip-label">Progress</span>
        <StatusPill state={progress.state} />

        {progress.hasTarget && (
          <div className="lip-bar" aria-hidden="true">
            <div className="lip-bar-track">
              <div className="lip-bar-fill" style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="lip-bar-percent">{Math.round(progress.percent)}%</span>
          </div>
        )}

        <span className="lip-counts">
          {progress.hasTarget ? (
            <>
              <span className={`lip-counts-num${progress.overage > 0 ? ' lip-counts-num--over' : ''}`}>
                {formatNum(progress.completed)}
              </span>
              <span className="lip-counts-divider">/</span>
              <span className="lip-counts-target">{formatNum(progress.target)}</span>
              <span className="lip-counts-unit">done</span>
            </>
          ) : (
            <>
              <span className="lip-counts-num">{formatNum(progress.completed)}</span>
              <span className="lip-counts-unit">done</span>
            </>
          )}
        </span>

        {progress.hasTarget && progress.remaining > 0 && (
          <span className="lip-remaining">
            <span className="lip-remaining-num">{formatNum(progress.remaining)}</span>
            <span className="lip-remaining-unit">left</span>
          </span>
        )}

        {progress.overage > 0 && (
          <span className="lip-overage" title="Completed quantity exceeds target">
            <span className="lip-overage-num">+{formatNum(progress.overage)}</span>
            <span className="lip-overage-unit">over</span>
          </span>
        )}

        {progress.scrapTotal > 0 && (
          <span className="lip-scrap" title="Scrap pieces and scrap rate for this item">
            <span className="lip-scrap-glyph">⚠</span>
            <span className="lip-scrap-num">{formatNum(progress.scrapTotal)}</span>
            <span className="lip-scrap-unit">scrap</span>
            <span className="lip-scrap-rate">{Math.round(progress.scrapRate)}%</span>
          </span>
        )}

        <span className="lip-sessions">
          {progress.sessions} {progress.sessions === 1 ? 'session' : 'sessions'}
        </span>

        {isAdmin && onAdd && (
          <button
            type="button"
            className="lip-add"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(); }}
            aria-label="Add time entry"
            title="Add time entry"
          >
            <Plus size={14} />
          </button>
        )}

        <span className="lip-chevron" aria-hidden="true">▾</span>
      </summary>

      {entries.length === 0 ? (
        <p className="empty-message">No time entries for this item</p>
      ) : (
        <div className="te-list">
          {activeEntries.length > 0 && (
            <div className="te-group">
              {showGroupLabels && (
                <div className="te-group-label te-group-label--active">
                  <span className="te-group-dot" />
                  Active
                </div>
              )}
              {activeEntries.map(renderCard)}
            </div>
          )}
          {completedEntries.length > 0 && (
            <div className="te-group">
              {showGroupLabels && (
                <div className="te-group-label">Completed</div>
              )}
              {completedEntries.map(renderCard)}
            </div>
          )}
        </div>
      )}
    </details>
  );
}
