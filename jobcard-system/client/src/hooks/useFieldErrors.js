import { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

// The one naming rule an input's aria-describedby and its message's id both have to
// agree on. Kept as a single module-level function (not duplicated inline in
// fieldProps/errorProps below) so the two can never drift apart and spell a field's
// message id two different ways.
const errorIdFor = (name) => `${name}-error`;

// null/undefined/'' all read as "empty" and compare equal to one another; a number
// and a string compare by their text; an array or object compares by its JSON shape
// (so a composite value — e.g. a date-range pair — can be raised and judged as one).
function same(a, b) {
  const isEmpty = (v) => v === null || v === undefined || v === '';
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) && isEmpty(b);
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
}

// Shared field-level validation-error state for a form. A mark belongs to the exact
// text it was raised against, not to the field's name: `valueOf(name)` (required —
// every caller passes one, held in a ref so a fresh function each render is fine)
// reads what the box for that mark holds right now, and the mark shows, counts and
// is announced only while the box still holds that same text — however the box's
// content changed since (typed over, a pick filled it in, a reset, a server reply).
// Put the box back to the exact text that was refused and the mark reappears, because
// that text really was refused. See index.css .field-error / .field-error-message for
// the styling.
export function useFieldErrors(valueOf) {
  // name -> { message, value } — value is what the box held at the moment the mark
  // was raised (or the text it was explicitly raised against, via setFieldErrors'
  // second argument). Stale entries (the box has since moved on) are simply not
  // surfaced in `fieldErrors` below; they're harmless left in state and may be
  // pruned lazily rather than needing their own timer.
  const [stored, setStoredState] = useState({});
  const valueOfRef = useRef(valueOf);
  valueOfRef.current = valueOf;

  const setFieldErrors = useCallback((errors, raisedAgainst) => {
    setStoredState(prev => {
      const next = { ...prev };
      for (const [name, message] of Object.entries(errors)) {
        const value = raisedAgainst && Object.prototype.hasOwnProperty.call(raisedAgainst, name)
          ? raisedAgainst[name]
          : valueOfRef.current(name);
        next[name] = { message, value };
      }
      return next;
    });
  }, []);

  // For exactly two purposes: a new form session (opened, switched to another
  // record, or reset to blank) and after a successful submit. See each call site.
  const clearAll = useCallback(() => setStoredState({}), []);

  // Only live marks — a stored mark whose box no longer holds the text it was
  // raised against is left out entirely, so every reader below (groupClass,
  // errorFor, fieldProps, and anything counting Object.keys(fieldErrors)) only
  // ever sees a mark that still applies right now.
  const fieldErrors = {};
  for (const name of Object.keys(stored)) {
    const entry = stored[name];
    if (same(valueOfRef.current(name), entry.value)) {
      fieldErrors[name] = entry.message;
    }
  }

  const groupClass = useCallback(
    (name) => (fieldErrors[name] ? 'form-group field-error' : 'form-group'),
    [fieldErrors]
  );

  const errorFor = useCallback((name) => fieldErrors[name] || null, [fieldErrors]);

  // The accessibility wiring a field's input needs, built from its name alone. This
  // exists so a call site can never forget it or spell it differently from its
  // FieldError's id — that was the actual defect: three forms wired aria-invalid /
  // aria-describedby by hand and fourteen didn't, and hand-wiring drifts again the
  // moment the next form is added. id matches what scrollFieldIntoView already
  // looks up by id (see below); aria-describedby is only ever set while the field
  // has an error, so it never points at a message element that isn't rendered.
  const fieldProps = useCallback((name) => {
    const hasError = Boolean(fieldErrors[name]);
    return {
      id: name,
      'aria-invalid': hasError || undefined,
      'aria-describedby': hasError ? errorIdFor(name) : undefined,
    };
  }, [fieldErrors]);

  // The matching half for the <FieldError> itself — same name in, same errorIdFor
  // rule, so it can never disagree with what fieldProps just pointed aria-describedby
  // at. Depends on nothing but the shared naming rule, so it never needs to change.
  const errorProps = useCallback((name) => ({ id: errorIdFor(name) }), []);

  return { fieldErrors, setFieldErrors, clearAll, groupClass, errorFor, fieldProps, errorProps };
}

// Splits a server refusal into marks for this form's boxes and whatever is left
// over. A 400 from the server's validation step (validation.js's
// handleValidationErrors) says which field each message belongs to in `fields`;
// `boxFor` maps a server field name to the box it lands on here (a name it doesn't
// list has no box on this form). Returns { marks, others }: marks is null when
// nothing landed on a box, others is every message that has no box of its own.
export function fieldErrorsFromRefusal(err, boxFor) {
  const fields = err?.data?.fields;
  if (!Array.isArray(fields)) return { marks: null, others: [] };
  const marks = {};
  const others = [];
  for (const { field, message } of fields) {
    const box = boxFor[field];
    if (box) {
      if (!marks[box]) marks[box] = message;
    } else {
      others.push(message);
    }
  }
  return { marks: Object.keys(marks).length > 0 ? marks : null, others };
}

// The one way a form with a Save/Create button reports a failed save: a message
// that belongs to one of its boxes marks that box (and brings the first into view);
// anything else — a message with no box, or a refusal that names no field at all —
// is a pop-up. The two never both fire for one message.
export function showSaveRefusal(err, { boxFor, setFieldErrors, fallback, toastId }) {
  const { marks, others } = fieldErrorsFromRefusal(err, boxFor);
  if (!marks) {
    toast.error(err?.message || fallback, toastId ? { id: toastId } : undefined);
    return;
  }
  setFieldErrors(marks);
  scrollFieldIntoView(Object.keys(marks)[0]);
  if (others.length > 0) toast.error(others.join('. '), toastId ? { id: toastId } : undefined);
}

// Scrolls a field's input into view when a submit-time error has just marked it
// off-screen. Matched by id first (the common case for a labelled form field), then
// by name attribute. A no-op when the element can't be found.
export function scrollFieldIntoView(name) {
  const el = document.getElementById(name) || document.querySelector(`[name="${name}"]`);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const inView = rect.top >= 0 && rect.bottom <= viewportHeight;
  if (!inView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (typeof el.focus === 'function') el.focus({ preventScroll: true });
}
