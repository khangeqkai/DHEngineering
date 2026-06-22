import { useState, useEffect, useRef } from 'react';
import { MoreVertical, Pencil, Trash2, Check } from 'lucide-react';
import ScrapStat from './ScrapStat';

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

  const scrapBin = Number(entry.scrapBinQty) || 0;
  const scrapRecycle = Number(entry.scrapRecycleQty) || 0;
  const showScrap = !isActive;
  const goodNum = qtyNum !== null && Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 0;

  // A finished block on a Critical job carries the inspection checklist answers.
  const inspectionChecks = [
    { label: 'First-off', value: entry.firstOffInspection },
    { label: 'In-process', value: entry.inProcessValidation },
    { label: 'Measuring equip.', value: entry.measuringEquipmentVerification },
    { label: 'Equipment', value: entry.equipmentChecks }
  ];
  const hasInspection = !isActive && inspectionChecks.some(c => c.value === true || c.value === false);
  const equipmentComments = entry.equipmentChecksComments ? String(entry.equipmentChecksComments).trim() : '';
  const showCumulative =
    showQty && qtyNum > 0 && target != null && Number.isFinite(cumulativeAfter);
  const noteText = entry.description ? entry.description.trim() : '';

  const showActions = !readOnly && (onEdit || onDelete || onStop || onToggleSpecial);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className={`te-card${isActive ? ' te-card--active' : ''}${entry.isSpecialLabour ? ' te-card--special' : ''}`}>
      <div className="te-topbar">
        <div className="te-duration-zone">
          <span className="te-worker">{entry.userName}</span>
          <span className="te-meta-divider" aria-hidden="true" />
          {isActive ? (
            <LiveElapsed startTime={entry.startTime} />
          ) : (
            <span className="te-duration-badge">{formatElapsed(durationSec)}</span>
          )}
          <span className="te-date">{new Date(entry.startTime).toLocaleDateString([], { day: '2-digit', month: 'short' })}</span>
          <span className="te-timerange">
            {new Date(entry.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {entry.endTime && (
              <> — {new Date(entry.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
            )}
          </span>
        </div>

        <div className="te-topbar-right">
          {(machinesList.length > 0 || (!isActive && showQty) || showScrap) && (
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
                  className={'te-qty-done' + (qtyNum === 0 ? ' te-qty-done--zero' : '')}
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
              {showScrap && <ScrapStat bin={scrapBin} recycle={scrapRecycle} good={goodNum} />}
            </div>
          )}

          {showActions && (
            entry.endTime ? (
              <div className="te-menu" ref={menuRef}>
                <button
                  type="button"
                  className="te-menu-btn"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-label="Entry options"
                  title="Options"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen && (
                  <div className="te-menu-dropdown" role="menu">
                    {onEdit && (
                      <button
                        type="button"
                        role="menuitem"
                        className="te-menu-item"
                        onClick={() => { setMenuOpen(false); onEdit(entry); }}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                    )}
                    {onToggleSpecial && (
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={!!entry.isSpecialLabour}
                        className={`te-menu-item te-menu-item--special${entry.isSpecialLabour ? ' is-on' : ''}`}
                        onClick={() => { setMenuOpen(false); onToggleSpecial(entry.id); }}
                      >
                        <Check size={14} className="te-menu-check" />
                        {entry.isSpecialLabour ? 'Special labour' : 'Mark as special'}
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        role="menuitem"
                        className="te-menu-item te-menu-item--del"
                        onClick={() => { setMenuOpen(false); onDelete(entry); }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              onStop && <button type="button" className="te-btn te-btn--stop" onClick={() => onStop(entry)}>Stop Timer</button>
            )
          )}
        </div>
      </div>

      <div className="te-body">
        {noteText ? (
          <figure className="te-item-note">
            <span className="te-item-note-mark" aria-hidden="true">&ldquo;</span>
            <blockquote className="te-item-note-text">{noteText}</blockquote>
          </figure>
        ) : (
          isActive ? (
            <p className="te-active-hint">In progress…</p>
          ) : (
            <p className="te-no-note">No comment left</p>
          )
        )}

        {hasInspection && (
          <div className="te-inspection">
            {inspectionChecks.map(({ label, value }) => (
              <span
                key={label}
                className={`te-insp-chip${value === true ? ' te-insp-chip--yes' : value === false ? ' te-insp-chip--no' : ' te-insp-chip--na'}`}
              >
                <span className="te-insp-name">{label}</span>
                <span className="te-insp-val">{value === true ? 'Yes' : value === false ? 'No' : '—'}</span>
              </span>
            ))}
            {equipmentComments && (
              <span className="te-insp-comments">Equipment: {equipmentComments}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
