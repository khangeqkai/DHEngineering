import { useState, useRef, useCallback } from 'react';
import { ChevronDown, AlertTriangle, Check } from 'lucide-react';
import FieldError from '../../common/FieldError';
import { useDismissableMenu } from '../../../hooks/useDismissableMenu';

// A per-line-item multi-select stored as a comma-separated string of tag values.
// Rendered as a compact dropdown (closed state matches the Job Type / Material
// boxes) so it sits on one line beside the other line-item fields. Clicking opens
// a checklist; multiple values can be picked. One option (naValue) is exclusive:
// picking it clears the rest, and picking any other value clears it. An empty
// string means "not answered yet" (fails the required check). In read-only mode
// the selection shows as plain text.
//
// error: a saved part's own required-field check clearing it back to "not
// answered yet" (see useInstantItems.js) — marks the trigger and shows the
// message the same way a text field's FieldError does, since this control has
// no native <select> for the generic .field-error CSS to catch on its own.
export default function LineItemTagSelect({
  id,
  label,
  required = false,
  readOnly = false,
  value = '',
  options = [],
  labelOf = null,
  naValue,
  onChange,
  warning = false,
  attachedFiles = [],
  // The job's files were never looked at (no job-folders location set, or it
  // can't be reached right now) — see utils/attachmentWarnings.js.
  filesUnchecked = false,
  onAttach,
  // Opens one attached file (the { name, storedName } entry) in the file viewer.
  onViewFile,
  error = null
}) {
  const selected = value ? value.split(',').filter(Boolean) : [];
  // "Declares something" = a real value picked, not the explicit N/A answer.
  const isDeclared = selected.some(v => v && v !== naValue);
  // When the parent supplies an attach handler and this field declares something,
  // show an actionable button: amber "Attach file" while missing, or — once files
  // for this part exist — the attached file names as green chips plus a small
  // "Add" button to attach another. The green tick needs real file names: no
  // warning with no names (the files were never checked) is a neutral "Files not
  // checked", never a claim that something is attached. Without an attach handler
  // (e.g. the create form), fall back to a passive nudge.
  let warningPill = null;
  const listsFiles = isDeclared && !warning && (onAttach || (onViewFile && attachedFiles.length > 0));
  if (listsFiles) {
    warningPill = (
      <div className="lit-attach-done">
        {attachedFiles.length > 0
          ? attachedFiles.map((file) => (
              <button
                type="button"
                key={file.storedName}
                className="lit-attach-file"
                title={`Open ${file.name}`}
                onClick={() => onViewFile?.(file)}
              >
                <Check size={14} aria-hidden="true" /> {file.name}
              </button>
            ))
          : (
            <span
              className="lit-attach-unchecked"
              title={filesUnchecked ? "The main job folder isn't set or can't be reached, so we can't tell if this part has its files" : "This part's files haven't been checked yet"}
            >
              Files not checked
            </span>
          )}
        {onAttach && (
          <button type="button" className="lit-attach lit-attach--add" onClick={onAttach} title="Add another file">
            + Add
          </button>
        )}
      </div>
    );
  } else if (warning && onAttach && isDeclared) {
    warningPill = (
      <button type="button" className="lit-attach lit-attach--missing" onClick={onAttach} title="Add a file for this part">
        <AlertTriangle size={14} aria-hidden="true" /> Add file
      </button>
    );
  } else if (warning) {
    warningPill = <span className="lit-missing-file" title="No file added yet"><AlertTriangle size={14} aria-hidden="true" /> No file yet</span>;
  }
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Same `${id}-error` shape as useFieldErrors' fieldProps/errorProps, wired by hand:
  // this component owns exactly one field per instance (its `id` prop, already the
  // part-and-field key from useInstantItems.js's fieldErrorKey), but it only ever
  // receives the already-computed error string, not a hook instance to draw the
  // pairing from.
  const errorId = `${id}-error`;
  const closeMenu = useCallback(() => setOpen(false), []);

  useDismissableMenu({ open, onClose: closeMenu, containerRef: ref });

  // A value saved on this job whose option was since archived won't be in the
  // active `options` list. Add those selected-but-missing values to the menu (tagged
  // "(archived)") so the user can still see and untick them — they just can't be re-added.
  const missingSelected = selected.filter(v => v && !options.some(o => o.value === v));
  const menuOptions = [
    ...options,
    ...missingSelected.map(v => ({ value: v, label: `${labelOf ? labelOf(v) : v} (archived)`, retired: true }))
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
      const choosing = !selected.includes(naValue);
      onChange(choosing ? naValue : '');
      // N/A is the whole answer, so choosing it is done — the list closes. The other
      // picks stay open because several can be chosen.
      if (choosing) setOpen(false);
      return;
    }
    const current = selected.filter(v => v && v !== naValue);
    const updated = current.includes(val)
      ? current.filter(v => v !== val)
      : [...current, val];
    onChange(updated.join(','));
  };

  return (
    <div className={`line-item-tagselect${error ? ' field-error' : ''}`} ref={ref}>
      <label htmlFor={id}>{label} {required && <span className="required">*</span>}</label>
      <div className="lit-select">
        <button
          id={id}
          type="button"
          className={`lit-select-btn${value ? '' : ' lit-select-btn--empty'}${hasRetired ? ' lit-select-btn--retired' : ''}${error ? ' lit-select-btn--error' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          title={summary || undefined}
        >
          <span className="lit-select-text">{summary || 'Select…'}</span>
          <ChevronDown size={14} className={`lit-select-caret${open ? ' is-open' : ''}`} />
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
                  <span className="lit-select-check">{isSelected && <Check size={14} aria-hidden="true" />}</span>
                  <span className="lit-select-option-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {warningPill}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
