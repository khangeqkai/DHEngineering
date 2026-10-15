import { useEffect, useRef, useState } from 'react';
import { Play, Square, ChevronDown } from 'lucide-react';
import { workBelongsToItem } from './workMatch.mjs';
import { formatElapsed } from '../../utils/formatters';

export default function LineItemTimerButton({
  itemId,
  itemNumber,
  displayNumber,
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
    // A menu is not a window, so it stays off the modal stack. Escape is taken in the
    // capture phase and stopped there, so it never reaches the job card underneath
    // (which would close the whole window for what was meant as dismissing this list).
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      // A key aimed at a window opened over the menu (the inactivity warning) is not the menu's.
      if (e.target !== document.body && !rootRef.current?.contains(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // The Stop button sticks to the part the timer was actually started on, even
  // after a save renumbers the parts (the timer's remembered number goes stale
  // but its part identity doesn't — see workMatch.mjs).
  const activeOnThisItem = activeTimer && workBelongsToItem(activeTimer, { id: itemId, itemNumber });

  if (activeOnThisItem) {
    return (
      <button
        type="button"
        className="lit-btn lit-btn-stop"
        onClick={onStop}
        disabled={loading}
        title="Stop timer for this part"
      >
        <Square size={14} /> Stop ({formatElapsed(elapsed)})
      </button>
    );
  }

  // Regular worker: one button that starts their own timer immediately. The
  // part is identified to the server by its permanent id — displayNumber only
  // ever reaches the user, in the toasts onStart raises.
  if (!canManage || employees.length === 0) {
    return (
      <button
        type="button"
        className="lit-btn lit-btn-start"
        onClick={() => onStart(itemId, displayNumber)}
        disabled={loading}
        title="Start timer for this part"
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
    onStart(itemId, displayNumber, workerId, workerName);
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
        title="Start timer for this part"
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
