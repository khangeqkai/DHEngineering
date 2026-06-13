import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CheckboxDropdown.css';

// A closed dropdown that opens a checkbox list for picking several options at
// once. The button face summarises the current picks; the open panel lists each
// option with a tick box. Closes on an outside click or Escape.
// Each option: { value, label, sublabel?, disabled? }. `selectedValues` is an
// array of selected values; `onToggle(value)` fires when a row is ticked/unticked.
export default function CheckboxDropdown({
  options = [],
  selectedValues = [],
  onToggle,
  placeholder = 'Select...',
  ariaLabel,
  disabled = false
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

  const selectedLabels = options
    .filter(o => selectedValues.includes(o.value))
    .map(o => o.label);
  const hasSelection = selectedLabels.length > 0;
  const summary = hasSelection ? selectedLabels.join(', ') : placeholder;

  return (
    <div className="checkbox-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`checkbox-dropdown-toggle${hasSelection ? '' : ' is-placeholder'}`}
        onClick={() => !disabled && setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="checkbox-dropdown-summary">{summary}</span>
        <ChevronDown size={16} className={`checkbox-dropdown-caret${open ? ' is-open' : ''}`} />
      </button>

      {open && (
        <div className="checkbox-dropdown-panel" role="listbox" aria-multiselectable="true">
          {options.length === 0 && (
            <div className="checkbox-dropdown-empty">No options</div>
          )}
          {options.map(opt => {
            const checked = selectedValues.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                className={`checkbox-dropdown-option${checked ? ' is-checked' : ''}`}
                onClick={() => onToggle(opt.value)}
                role="option"
                aria-selected={checked}
                disabled={opt.disabled}
              >
                <span className={`checkbox-dropdown-box${checked ? ' is-checked' : ''}`}>
                  {checked && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="checkbox-dropdown-text">
                  <span className="checkbox-dropdown-label">{opt.label}</span>
                  {opt.sublabel && <span className="checkbox-dropdown-sub">{opt.sublabel}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
