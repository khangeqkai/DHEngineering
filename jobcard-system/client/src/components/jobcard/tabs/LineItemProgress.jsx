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
    // Total scrap for the line = pieces binned + pieces recycled, across every session.
    scrapTotal += parseQty(e.scrapBinQty) + parseQty(e.scrapRecycleQty);
    cumulativeMap.set(e.id, running);
  }
  const completedQty = running;
  const target = parseFloat(targetQty);
  const hasTarget = Number.isFinite(target) && target > 0;
  const overage = hasTarget ? Math.max(0, completedQty - target) : 0;
  // Completion = GOOD pieces vs required. Uncapped, so over-production reads as 110%, not a flat 100%.
  // (qty is good-only; scrap is tracked separately, so it's already excluded here.)
  const percent = hasTarget ? (completedQty / target) * 100 : 0;
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
    overage,
    percent,
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
  canManage = false,
  activeTimerId = null,
  onAdd,
  onEdit,
  onDelete,
  onStop
}) {
  const progress = useMemo(() => computeProgress(entries, targetQty), [entries, targetQty]);

  // Total made = good pieces + scrap. Scrap rate divides into it, so every number on the
  // line ties together: scrap of total made = the percentage shown.
  const totalMade = progress.completed + progress.scrapTotal;
  const scrapRate = totalMade > 0 ? Math.round((progress.scrapTotal / totalMade) * 100) : 0;

  const [open, setOpen] = useState(progress.hasActive);
  const prevHasActive = useRef(progress.hasActive);

  useEffect(() => {
    if (progress.hasActive && !prevHasActive.current) setOpen(true);
    prevHasActive.current = progress.hasActive;
  }, [progress.hasActive]);

  const activeEntries = entries.filter(e => !e.endTime);
  const completedEntries = entries.filter(e => e.endTime);
  const showGroupLabels = activeEntries.length > 0 && completedEntries.length > 0;

  const renderCard = (e) => {
    // The part's own Stop button already covers the current user's running timer, so
    // don't show a second Stop for it here. Another worker's active run (e.g. one an
    // admin started for them) keeps its Stop — that's the only place to stop it.
    const ownActiveTimer = activeTimerId && e.id === activeTimerId;
    const cardProps = canManage
      ? { onEdit, onDelete, onStop: ownActiveTimer ? undefined : onStop }
      : { readOnly: true };
    return (
      <TimeEntryCard
        key={e.id}
        entry={e}
        cumulativeAfter={progress.cumulativeMap.get(e.id)}
        target={progress.hasTarget ? progress.target : null}
        {...cardProps}
      />
    );
  };

  return (
    <details
      className={`line-item-progress lip--${progress.state}${progress.overage > 0 ? ' lip--over' : ''}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="lip-summary">
        <StatusPill state={progress.state} />

        {progress.hasTarget && (
          <>
            <div
              className="lip-bar"
              title={`${formatNum(progress.completed)} good of ${formatNum(progress.target)} required`}
            >
              <div className="lip-bar-track">
                <div className="lip-bar-fill" style={{ width: `${Math.min(100, progress.percent)}%` }} />
              </div>
            </div>
            <span className="lip-bar-percent">{Math.round(progress.percent)}%</span>
          </>
        )}

        <span className="lip-stats">
          <span className="lip-stat">
            <span className="lip-stat-label">Required</span>
            <span className="lip-stat-value">{progress.hasTarget ? formatNum(progress.target) : '—'}</span>
          </span>
          <span className="lip-stat">
            <span className="lip-stat-label">Total made</span>
            <span className="lip-stat-value">{formatNum(totalMade)}</span>
          </span>
          <span className="lip-stat lip-stat--scrap">
            <span className="lip-stat-label">Scrap</span>
            <span className="lip-stat-value">{formatNum(progress.scrapTotal)}</span>
          </span>
          <span
            className="lip-stat lip-stat--scrap"
            title={totalMade > 0 ? `${formatNum(progress.scrapTotal)} scrap out of ${formatNum(totalMade)} made` : 'Nothing made yet'}
          >
            <span className="lip-stat-label">Scrap rate</span>
            <span className="lip-stat-value">{totalMade > 0 ? `${scrapRate}%` : '—'}</span>
          </span>
        </span>

        {canManage && onAdd && (
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
