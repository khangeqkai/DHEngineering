import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// A per-line-item multi-select stored as a comma-separated string of tag values.
// Rendered as a compact dropdown (closed state matches the Job Type / Material
// boxes) so it sits on one line beside the other line-item fields. Clicking opens
// a checklist; multiple values can be picked. One option (naValue) is exclusive:
// picking it clears the rest, and picking any other value clears it. An empty
// string means "not answered yet" (fails the required check). In read-only mode
// the selection shows as plain text.
export default function LineItemTagSelect({
  label,
  required = false,
  readOnly = false,
  value = '',
  options = [],
  naValue,
  onChange
}) {
  const selected = value ? value.split(',').filter(Boolean) : [];
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  const labelFor = v => options.find(o => o.value === v)?.label || v;
  const summary = selected.map(labelFor).join(', ');

  if (readOnly) {
    return (
      <div className="line-item-tagselect">
        <label>{label}</label>
        <div className="readonly-value">{summary || '-'}</div>
      </div>
    );
  }

  const toggle = (val) => {
    if (naValue && val === naValue) {
      onChange(selected.includes(naValue) ? '' : naValue);
      return;
    }
    const current = selected.filter(v => v && v !== naValue);
    const updated = current.includes(val)
      ? current.filter(v => v !== val)
      : [...current, val];
    onChange(updated.join(','));
  };

  return (
    <div className="line-item-tagselect" ref={ref}>
      <label>{label} {required && <span className="required">*</span>}</label>
      <div className="lit-select">
        <button
          type="button"
          className={`lit-select-btn${value ? '' : ' lit-select-btn--empty'}`}
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={summary || undefined}
        >
          <span className="lit-select-text">{summary || 'Select…'}</span>
          <ChevronDown size={14} className="lit-select-caret" />
        </button>
        {open && (
          <div className="lit-select-menu" role="listbox" aria-multiselectable="true">
            {options.map(opt => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`lit-select-option${isSelected ? ' selected' : ''}`}
                  onClick={() => toggle(opt.value)}
                >
                  <span className="lit-select-check">{isSelected ? '✓' : ''}</span>
                  <span className="lit-select-option-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
