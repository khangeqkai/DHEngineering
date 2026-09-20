import { useState, useCallback } from 'react';

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

  return { fieldErrors, setFieldErrors, clearFieldError, clearAll, groupClass, errorFor };
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
