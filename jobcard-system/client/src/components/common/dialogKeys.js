// The keyboard rules every blocking dialog shares: Tab wraps at the first and last
// control instead of leaving the dialog, and Escape either does something or nothing.
// Each dialog keeps its own listener, its own "am I the top dialog?" check and its own
// focus-on-open; this is only the Tab-wrap and the Escape decision.
//
// Every dialog pulls strayed focus back in: when a focused control disables itself or
// unmounts, focus falls to the page behind, and the next Tab must not walk that page.
// So `container` is required, never optional.
//
// handleDialogKey = the Escape decision + handleDialogTab. A dialog that keeps its own
// Escape rule (the job window) calls handleDialogTab directly.
//
// options:
//   focusable    function returning the dialog's controls in Tab order (read at the
//                moment of the key, so a step change or a disabled button is seen)
//   escape       (handleDialogKey only) function to call on Escape (the key's default is
//                prevented, the event is left to travel on); omit it and Escape is
//                swallowed — prevented and stopped — so it does nothing here and
//                reaches nothing behind
//   container    required; the dialog's element. Focus outside it, or (on Shift+Tab) on
//                the element itself just after opening, is pulled to the first or last
//                control
//   holdWhenEmpty  optional; with no controls at all, Tab is held rather than let go
export function handleDialogTab(e, { focusable, container, holdWhenEmpty = false }) {
  if (e.key !== 'Tab') return;
  const controls = focusable();
  if (controls.length === 0) {
    if (holdWhenEmpty) e.preventDefault();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  const active = document.activeElement;
  const strayed = !container.contains(active);
  if (e.shiftKey && (active === first || active === container || strayed)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || strayed)) {
    e.preventDefault();
    first.focus();
  }
}

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
  handleDialogTab(e, { focusable, container, holdWhenEmpty });
}
