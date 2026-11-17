// Switches the app between its light and dark looks — the one place that does.
//
// The switch is a short cross-fade rather than every colour flipping in a single frame:
// the browser takes a picture of the screen as it is, the look changes underneath, and
// the picture fades away (its length is set in index.css). Where the browser can't do
// that, or the person has asked for less motion, the look simply changes.

// What the look should end up as. The fade starts a moment after it is asked for, so a
// second switch made in that moment must win: the change reads this when it runs.
let wantDark = false;

export function applyTheme(dark) {
  const root = document.documentElement;
  wantDark = !!dark;
  if (root.classList.contains('dark-mode') === wantDark) return;

  const change = () => root.classList.toggle('dark-mode', wantDark);
  const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (lessMotion || typeof document.startViewTransition !== 'function') {
    change();
    return;
  }
  document.startViewTransition(change);
}
