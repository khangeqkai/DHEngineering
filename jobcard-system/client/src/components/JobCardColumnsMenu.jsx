import { useState, useRef, useEffect } from 'react';
import { Columns3, Check, ChevronUp, ChevronDown } from 'lucide-react';

// "Columns" button + drop-down checklist for choosing which job-list columns show.
// `columns` is the toggleable set the user is allowed to see (job number excluded);
// `hiddenColumns` is the ids currently hidden. Toggling and resetting bubble up.
// `onMove` reorders a column — the keyboard/touch equivalent of dragging a header,
// since HTML5 drag-and-drop never fires on a touch screen and isn't reachable
// from the keyboard at all.
export default function JobCardColumnsMenu({ columns, hiddenColumns, onToggle, onReset, onMove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const hiddenCount = hiddenColumns.length;

  return (
    <div className="columns-menu" ref={ref}>
      <button
        className={`btn btn-sm ${open ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title="Choose which columns to show"
      >
        <Columns3 size={14} /> Columns{hiddenCount ? ` (${hiddenCount} hidden)` : ''}
      </button>
      {open && (
        <div className="columns-menu-dropdown" role="menu">
          <div className="columns-menu-title">Show columns</div>
          {columns.map((col, index) => {
            const visible = !hiddenColumns.includes(col.id);
            return (
              <div key={col.id} className="columns-menu-row" role="none">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={visible}
                  className="columns-menu-item"
                  onClick={() => onToggle(col.id)}
                >
                  <span className={`columns-menu-check${visible ? ' is-on' : ''}`}>
                    {visible && <Check size={14} />}
                  </span>
                  {col.label}
                </button>
                <span className="columns-menu-move" role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="columns-menu-move-btn"
                    aria-label={`Move ${col.label} earlier`}
                    disabled={index === 0}
                    onClick={() => onMove(col.id, 'earlier')}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="columns-menu-move-btn"
                    aria-label={`Move ${col.label} later`}
                    disabled={index === columns.length - 1}
                    onClick={() => onMove(col.id, 'later')}
                  >
                    <ChevronDown size={14} />
                  </button>
                </span>
              </div>
            );
          })}
          <button type="button" role="menuitem" className="columns-menu-reset" onClick={onReset}>
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
