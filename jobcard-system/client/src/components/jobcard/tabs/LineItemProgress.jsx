import { useState, useEffect, useRef } from 'react';
import TimeEntryCard from './TimeEntryCard';

export default function LineItemProgress({
  entries = [],
  lineItems = [],
  isAdmin = false,
  onAdd,
  onEdit,
  onDelete,
  onStop,
  onToggleSpecial
}) {
  const hasActive = entries.some(e => !e.endTime);
  const [open, setOpen] = useState(hasActive);
  const prevHasActive = useRef(hasActive);

  useEffect(() => {
    if (hasActive && !prevHasActive.current) setOpen(true);
    prevHasActive.current = hasActive;
  }, [hasActive]);

  const cardProps = isAdmin
    ? { onEdit, onDelete, onStop, onToggleSpecial }
    : { readOnly: true };

  return (
    <details
      className="line-item-progress"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Progress ({entries.length})
        {hasActive && <span className="line-item-progress-active">● Active</span>}
      </summary>
      {isAdmin && onAdd && (
        <div className="line-item-progress-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd}>
            + Add Entry
          </button>
        </div>
      )}
      {entries.length === 0 ? (
        <p className="empty-message">No time entries for this item</p>
      ) : (
        <div className="te-list">
          {entries.map(e => (
            <TimeEntryCard key={e.id} entry={e} lineItems={lineItems} {...cardProps} />
          ))}
        </div>
      )}
    </details>
  );
}
