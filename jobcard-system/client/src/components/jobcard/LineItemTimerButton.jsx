import { Play, Square } from 'lucide-react';

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
  onStop
}) {
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
