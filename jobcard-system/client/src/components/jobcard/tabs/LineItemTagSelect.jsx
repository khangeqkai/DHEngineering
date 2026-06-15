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
  labelOf = null,
  naValue,
  onChange,
  warning = false,
  onAttach
}) {
  const selected = value ? value.split(',').filter(Boolean) : [];
  // "Declares something" = a real value picked, not the explicit N/A answer.
  const isDeclared = selected.some(v => v && v !== naValue);
  // When the parent supplies an attach handler and this field declares something,
  // show an actionable button: amber "Attach file" while missing, green "✓ Attached"
  // once a file for this part exists (still clickable to add another). Without an
  // attach handler (e.g. the create form), fall back to a passive nudge.
  let warningPill = null;
  if (onAttach && isDeclared) {
    warningPill = warning ? (
      <button type="button" className="lit-attach lit-attach--missing" onClick={onAttach} title="Attach a file for this part">
        ⚠ Attach file
      </button>
    ) : (
      <button type="button" className="lit-attach lit-attach--done" onClick={onAttach} title="Attached — click to add another">
        ✓ Attached
      </button>
    );
  } else if (warning) {
    warningPill = <span className="lit-missing-file" title="No file attached yet">⚠ No file yet</span>;
  }
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

  // A value saved on this job whose option was since archived won't be in the
  // active `options` list. Add those selected-but-missing values to the menu (tagged
  // "(retired)") so the user can still see and untick them — they just can't be re-added.
  const missingSelected = selected.filter(v => v && !options.some(o => o.value === v));
  const menuOptions = [
    ...options,
    ...missingSelected.map(v => ({ value: v, label: `${labelOf ? labelOf(v) : v} (retired)`, retired: true }))
  ];
  const hasRetired = missingSelected.length > 0;

  const labelFor = v => menuOptions.find(o => o.value === v)?.label || v;
  const summary = selected.map(labelFor).join(', ');

  if (readOnly) {
    return (
      <div className="line-item-tagselect">
        <label>{label}</label>
        <div className="readonly-value">{summary || '-'}</div>
        {warningPill}
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
          className={`lit-select-btn${value ? '' : ' lit-select-btn--empty'}${hasRetired ? ' lit-select-btn--retired' : ''}`}
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
            {menuOptions.map(opt => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`lit-select-option${isSelected ? ' selected' : ''}${opt.retired ? ' retired-option' : ''}`}
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
      {warningPill}
    </div>
  );
}
