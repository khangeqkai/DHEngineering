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

export default function TimeEntryCard({
  entry,
  lineItems = [],
  readOnly = false,
  onEdit,
  onDelete,
  onStop,
  onToggleSpecial
}) {
  const itemNums = entry.itemNumber ? String(entry.itemNumber).split(',').map(s => s.trim()) : [];
  const qtys = entry.qty ? String(entry.qty).split(',').map(s => s.trim()) : [];
  const itemMap = new Map(lineItems.map(li => [String(li.itemNumber), li.description]));
  const descMap = new Map();
  if (entry.description && itemNums.length > 1) {
    const pattern = /#(\d+):\s*(.*?)(?=;\s*#\d+:|$)/g;
    let m;
    while ((m = pattern.exec(entry.description)) !== null) {
      descMap.set(m[1], m[2].trim());
    }
  }
  const isActive = !entry.endTime;
  const durationSec = entry.endTime
    ? Math.round((new Date(entry.endTime) - new Date(entry.startTime)) / 1000)
    : null;
  const machinesList = entry.machineNumber
    ? String(entry.machineNumber).split(',').map(s => s.trim()).filter(Boolean)
    : [];

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
          {machinesList.length > 0 && (
            <div className="te-machines">
              {machinesList.map((mn, i) => (
                <span key={i} className="te-machine-tag">M{mn}</span>
              ))}
            </div>
          )}
          {itemNums.length > 0 ? (
            <div className="te-items">
              {itemNums.map((num, i) => {
                const userDesc = descMap.get(num) || (itemNums.length === 1 ? entry.description : '');
                return (
                  <div key={i} className="te-item-row">
                    <span className="te-item-num">#{num}</span>
                    <span className="te-item-desc">{itemMap.get(num) || ''}</span>
                    {qtys[i] && <span className="te-item-qty">{qtys[i]} pcs</span>}
                    {userDesc && <span className="te-item-note">{userDesc}</span>}
                  </div>
                );
              })}
            </div>
          ) : entry.description ? (
            <div className="te-desc-only">{entry.description}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
