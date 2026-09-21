import { useState, useCallback } from 'react';

// The one naming rule an input's aria-describedby and its message's id both have to
// agree on. Kept as a single module-level function (not duplicated inline in
// fieldProps/errorProps below) so the two can never drift apart and spell a field's
// message id two different ways.
const errorIdFor = (name) => `${name}-error`;

// Shared field-level validation-error state for a form. A submit-time check marks the
// offending field instead of firing a pop-up (see index.css .field-error /
// .field-error-message for the styling), and the mark clears the moment the field
// changes again.
export function useFieldErrors() {
  const [fieldErrors, setFieldErrorsState] = useState({});

  const setFieldErrors = useCallback((errors) => {
    setFieldErrorsState(prev => ({ ...prev, ...errors }));
  }, []);

  const clearFieldError = useCallback((name) => {
    setFieldErrorsState(prev => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setFieldErrorsState({}), []);

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

  return { fieldErrors, setFieldErrors, clearFieldError, clearAll, groupClass, errorFor, fieldProps, errorProps };
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
