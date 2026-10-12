// The keyboard rules every blocking dialog shares: Tab wraps at the first and last
// control instead of leaving the dialog, and Escape either does something or nothing.
// Each dialog keeps its own listener, its own "am I the top dialog?" check and its own
// focus-on-open; this is only the Tab-wrap and the Escape decision.
//
// options:
//   focusable    function returning the dialog's controls in Tab order (read at the
//                moment of the key, so a step change or a disabled button is seen)
//   escape       function to call on Escape (the key's default is prevented, the event
//                is left to travel on); omit it and Escape is swallowed — prevented and
//                stopped — so it does nothing here and reaches nothing behind
//   container    optional; when given, focus that has strayed outside it is pulled back
//                in on Tab (to the first control, or the last on Shift+Tab)
//   holdWhenEmpty  optional; with no controls at all, Tab is held rather than let go
export function handleDialogKey(e, { focusable, escape, container, holdWhenEmpty = false }) {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (escape) {
      escape();
    } else {
      e.stopPropagation();
    }
    return;
  }
  if (e.key !== 'Tab') return;
  const controls = focusable();
  if (controls.length === 0) {
    if (holdWhenEmpty) e.preventDefault();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  const strayed = !!container && !container.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || strayed)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || strayed)) {
    e.preventDefault();
    first.focus();
  }
}
