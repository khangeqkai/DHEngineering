// The mouse wheel scrolls the page. In this app that is its only job.
//
// The browser disagrees by default: a focused `<input type="number">` — and the other
// spinner-backed types listed below, and a focused `<select>` in some browsers — has its
// VALUE changed by a wheel that rolls over it. On the screens that write themselves (the
// pricing sheet, the job's details, the parts list) that silently rewrites a figure and
// saves it a moment later, with nobody having typed anything and nothing on screen saying
// so. A quantity or a price is exactly the kind of number nobody re-reads.
//
// One listener installed once, rather than an `onWheel` prop on each box: a prop has to
// be remembered on every box anyone ever adds, and the one that had been forgotten was a
// part's quantity. This cannot be forgotten, it needs nothing from the component that
// renders the box, and it covers every screen in the app — the ones that exist now and
// the ones that don't yet.
//
// It blurs rather than calling preventDefault, because the page must still scroll.
// Dropping focus during the wheel event means the control is no longer focused by the
// time the browser gets to its own spin, so there is nothing left for it to change.

// Every input type whose value the wheel can move.
const WHEEL_CHANGES_VALUE = new Set([
  'number', 'range', 'date', 'datetime-local', 'month', 'time', 'week'
]);

function releaseFocusedControl(event) {
  const el = document.activeElement;
  if (!el || el === document.body) return;

  const tag = el.tagName;
  const atRisk = tag === 'SELECT' || (tag === 'INPUT' && WHEEL_CHANGES_VALUE.has(el.type));
  if (!atRisk) return;

  // Only when the pointer is actually over the focused control. A wheel anywhere else on
  // the page was never going to change its value, and blurring on that would take the
  // cursor out of a box someone is still typing in just because they scrolled to read
  // something — and, on the self-saving screens, send it early.
  if (event.target !== el && !el.contains(event.target)) return;

  el.blur();
}

export function installWheelValueGuard() {
  // Capture phase so it runs before anything else can act on the wheel, and passive so
  // the page's own scrolling is never held up waiting for this.
  document.addEventListener('wheel', releaseFocusedControl, { capture: true, passive: true });
}
