import { useEffect, useRef, useState } from 'react';
import { Play, Square, ChevronDown } from 'lucide-react';

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function LineItemTimerButton({
  itemNumber,
  activeTimer,
  elapsed,
  loading,
  onStart,
  onStop,
  canManage = false,
  employees = [],
  currentUserId
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeOnThisItem = activeTimer && activeTimer.itemNumber === itemNumber;

  if (activeOnThisItem) {
    return (
      <button
        type="button"
        className="lit-btn lit-btn-stop"
        onClick={onStop}
        disabled={loading}
        title="Stop timer for this item"
      >
        <Square size={14} /> Stop ({formatElapsed(elapsed)})
      </button>
    );
  }

  // Regular worker: one button that starts their own timer immediately.
  if (!canManage || employees.length === 0) {
    return (
      <button
        type="button"
        className="lit-btn lit-btn-start"
        onClick={() => onStart(itemNumber)}
        disabled={loading}
        title="Start timer for this item"
      >
        <Play size={14} /> Start Timer
      </button>
    );
  }

  // Admin: pick who the timer is for (themselves or any staff member). "Myself"
  // leads the list, then everyone else.
  const me = employees.find(e => e.id === currentUserId);
  const others = employees.filter(e => e.id !== currentUserId);

  const startFor = (workerId, workerName) => {
    setOpen(false);
    onStart(itemNumber, workerId, workerName);
  };

  return (
    <div className="lit-timer-picker" ref={rootRef}>
      <button
        type="button"
        className="lit-btn lit-btn-start"
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Start timer for this item"
      >
        <Play size={14} /> Start Timer <ChevronDown size={14} />
      </button>

      {open && (
        <div className="lit-picker-panel" role="listbox">
          <button
            type="button"
            className="lit-picker-option lit-picker-option--me"
            role="option"
            onClick={() => startFor(currentUserId, me?.name || me?.username || 'Myself')}
          >
            Myself{me?.name ? ` (${me.name})` : ''}
          </button>
          {others.map(emp => (
            <button
              type="button"
              key={emp.id}
              className="lit-picker-option"
              role="option"
              onClick={() => startFor(emp.id, emp.name || emp.username)}
            >
              {emp.name || emp.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
