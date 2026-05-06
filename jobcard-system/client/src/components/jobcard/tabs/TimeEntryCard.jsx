import { useState, useEffect } from 'react';

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function LiveElapsed({ startTime }) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="timer-indicator">
      <span className="timer-dot" />
      {formatElapsed(elapsed)}
    </span>
  );
}

function formatNum(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

export default function TimeEntryCard({
  entry,
  cumulativeAfter,
  target = null,
  readOnly = false,
  onEdit,
  onDelete,
  onStop,
  onToggleSpecial
}) {
  const isActive = !entry.endTime;
  const durationSec = entry.endTime
    ? Math.round((new Date(entry.endTime) - new Date(entry.startTime)) / 1000)
    : null;
  const machinesList = entry.machineNumber
    ? String(entry.machineNumber).split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const rawQty = entry.qty != null ? String(entry.qty).trim() : '';
  const qtyNum = rawQty === '' ? null : parseFloat(rawQty);
  const showQty = qtyNum !== null && Number.isFinite(qtyNum);
  const showCumulative =
    showQty && qtyNum > 0 && target != null && Number.isFinite(cumulativeAfter);
  const isOverAtThisSession =
    showCumulative && cumulativeAfter > target;
  const noteText = entry.description ? entry.description.trim() : '';

  const showActions = !readOnly && (onEdit || onDelete || onStop || onToggleSpecial);

  return (
    <div className={`te-card${isActive ? ' te-card--active' : ''}${entry.isSpecialLabour ? ' te-card--special' : ''}`}>
      <div className="te-topbar">
        <div className="te-duration-zone">
          {isActive ? (
            <LiveElapsed startTime={entry.startTime} />
          ) : (
            <span className="te-duration-badge">{formatElapsed(durationSec)}</span>
          )}
        </div>
        {showActions && (
          <div className="te-actions">
            {entry.endTime && onToggleSpecial && (
              <label className="te-special-toggle" title="Mark as special labour">
                <input
                  type="checkbox"
                  checked={entry.isSpecialLabour || false}
                  onChange={() => onToggleSpecial(entry.id)}
                />
                <span>Special</span>
              </label>
            )}
            {entry.endTime ? (
              <>
                {onEdit && <button type="button" className="te-btn te-btn--edit" onClick={() => onEdit(entry)}>Edit</button>}
                {onDelete && <button type="button" className="te-btn te-btn--del" onClick={() => onDelete(entry.id)}>Delete</button>}
              </>
            ) : (
              onStop && <button type="button" className="te-btn te-btn--stop" onClick={() => onStop(entry)}>Stop Timer</button>
            )}
          </div>
        )}
      </div>

      <div className="te-body">
        <div className="te-meta">
          <span className="te-worker">{entry.userName}</span>
          <span className="te-date">{new Date(entry.startTime).toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
          <span className="te-timerange">
            {new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {entry.endTime && (
              <> — {new Date(entry.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
            )}
          </span>
        </div>

        <div className="te-work">
          {(machinesList.length > 0 || (!isActive && showQty)) && (
            <div className="te-work-meta">
              {machinesList.length > 0 && (
                <div className="te-machines">
                  {machinesList.map((mn, i) => (
                    <span key={i} className="te-machine-tag">M{mn}</span>
                  ))}
                </div>
              )}
              {!isActive && showQty && (
                <div
                  className={
                    'te-qty-done' +
                    (qtyNum === 0 ? ' te-qty-done--zero' : '') +
                    (isOverAtThisSession ? ' te-qty-done--over' : '')
                  }
                >
                  {qtyNum > 0 ? (
                    <>
                      <span className="te-qty-delta">+{formatNum(qtyNum)}</span>
                      {showCumulative && (
                        <>
                          <span className="te-qty-arrow" aria-hidden="true">→</span>
                          <span className="te-qty-cumul">
                            <span className="te-qty-cumul-num">{formatNum(cumulativeAfter)}</span>
                            <span className="te-qty-cumul-divider">/</span>
                            <span className="te-qty-cumul-target">{formatNum(target)}</span>
                          </span>
                        </>
                      )}
                      <span className="te-qty-unit">pcs</span>
                    </>
                  ) : (
                    <>
                      <span className="te-qty-num">0</span>
                      <span className="te-qty-unit">pcs</span>
                      <span className="te-qty-label">no output</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {noteText && (
            <figure className="te-item-note te-item-note--solo">
              <span className="te-item-note-mark" aria-hidden="true">&ldquo;</span>
              <blockquote className="te-item-note-text">{noteText}</blockquote>
            </figure>
          )}

          {isActive && machinesList.length === 0 && (
            <p className="te-active-hint">In progress…</p>
          )}
        </div>
      </div>
    </div>
  );
}
