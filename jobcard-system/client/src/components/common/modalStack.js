// Tracks the stack of open modal/dialog instances in open order so that only
// the top-most one reacts to global keys (Escape to close, Tab focus trap).
// Without this, a confirmation layered over an edit form would let a single
// Escape close both, and the form's focus trap would fight the confirmation's.
//
// The stack also owns the page-scroll lock: the page behind is frozen while ANY
// modal is open and released only when the LAST one closes. Each modal used to set
// and clear the lock itself, so cancelling a confirm layered over the job screen
// released the page while the job screen was still up.
//
// And it owns the drawing order: each window is handed a stacking layer when it
// opens (the first gets BASE, every later one 10 above the highest still held), so
// the newest window is drawn on top exactly when it owns the keys. A page-covering
// overlay applies its layer as an inline z-index and never sets a fixed tier of its
// own. A few windows are the exception: they are pinned to a fixed layer of their own
// (`pinnedLayer`) and draw above every unpinned window. BASE plus any realistic depth
// stays far below the pinned layers. The pinned layers are defined once, in PINNED_LAYERS
// below, and every pinned window reads its layer from there.
//
// Pinned entries are first for the keys as well as for the drawing. A pinned entry always
// stays at the end of the stack, pinned entries ordered by their layer (higher = later =
// top), and an unpinned window that opens while one is up is slotted in beneath the first
// pinned one. Unpinned layers are worked out from unpinned entries only. So whichever pinned
// window is on top owns Escape and Tab for as long as it is drawn on top, and the one beneath
// owns them again once it closes. From the bottom up: the "Needs your attention" window, its
// "Sign out?" confirm, the inactivity warning, and the restore cover.
// A window that moves focus into itself on open does so only while it is the top one, and
// takes focus when it becomes the top one (`useFocusWhenTop`).
//
// The stack also hands focus back: it remembers what had focus just before each window
// opened, and when the window closes gives focus back to that element, but only if focus
// has been lost (it fell to the page) and the element is still on the page. Focus that
// something else deliberately placed is never taken.

import { useState, useLayoutEffect, useEffect, useRef, useSyncExternalStore } from 'react';

const BASE_LAYER = 1100;
const LAYER_STEP = 10;

// The fixed layers of the pinned windows. The stack's ordering depends on their relative
// values: the "needs your attention" window sits below its own "Sign out?" confirm, which
// sits below the inactivity warning, and the backup "Restoring…" cover is above everything
// (nothing may open over a running restore and take the keys from it; only an admin can
// restore, and admins are never signed out for inactivity).
export const PINNED_LAYERS = {
  attention: 1900,
  signOutConfirm: 1950,
  inactivity: 2000,
  restore: 2100
};

const stack = [];
const layers = new Map();
const pinned = new Map(); // id -> its fixed layer
const listeners = new Set();
const focusBefore = new Map(); // id -> the element that had focus just before it opened

// Tells whoever is watching the stack that it changed.
function announce() {
  listeners.forEach(fn => fn());
}

export function pushModal(id, { pinnedLayer = null } = {}) {
  // Guard against duplicate pushes (e.g. an effect re-running).
  if (!stack.includes(id)) {
    focusBefore.set(id, document.activeElement);
    if (pinnedLayer !== null) {
      // Pinned: keeps its own fixed layer, so it takes none from the map. Placed after
      // every pinned entry with a lower (or equal) layer, so higher layers end up on top.
      let at = stack.length;
      while (at > 0 && pinned.has(stack[at - 1]) && pinned.get(stack[at - 1]) > pinnedLayer) at--;
      stack.splice(at, 0, id);
      pinned.set(id, pinnedLayer);
    } else {
      // Slotted in beneath any pinned entry, which must stay last.
      const firstPinned = stack.findIndex(x => pinned.has(x));
      if (firstPinned === -1) stack.push(id);
      else stack.splice(firstPinned, 0, id);
      const held = Array.from(layers.values());
      layers.set(id, held.length === 0 ? BASE_LAYER : Math.max(...held) + LAYER_STEP);
    }
  }
  document.body.style.overflow = 'hidden';
  announce();
  return pinned.has(id) ? pinned.get(id) : layers.get(id);
}

export function removeModal(id) {
  const index = stack.indexOf(id);
  if (index !== -1) stack.splice(index, 1);
  layers.delete(id);
  pinned.delete(id);
  const before = focusBefore.get(id);
  focusBefore.delete(id);
  if (stack.length === 0) document.body.style.overflow = '';
  announce();
  // Hand focus back once the window's DOM is gone, and only if focus fell to the page.
  if (index !== -1 && before) {
    queueMicrotask(() => {
      const now = document.activeElement;
      const lost = !now || now === document.body || !now.isConnected;
      if (lost && before.isConnected && typeof before.focus === 'function') before.focus();
    });
  }
}

// Calls fn after every push and remove; returns the way to stop. For a screen that
// needs to know whether any window is open right now (the "needs your attention" window
// waits for none).
export function subscribeModalStack(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Whether any window other than `id` is open right now.
export function anyModalOpenExcept(id) {
  return stack.some(x => x !== id);
}

export function isTopModal(id) {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

// Joins the stack while `active` and returns the window's layer, for an inline z-index on
// its outermost overlay (a `pinnedLayer` makes it that fixed layer instead). Joins in a
// layout effect, so the layer is in place before the first paint.
export function useModalLayer(id, active, { pinnedLayer = null } = {}) {
  const [layer, setLayer] = useState(undefined);
  useLayoutEffect(() => {
    if (!active) return undefined;
    setLayer(pushModal(id, { pinnedLayer }));
    return () => removeModal(id);
  }, [id, active, pinnedLayer]);
  return active ? layer : undefined;
}

// Whether this window is the top one right now, re-rendering whenever that changes.
// False while `active` is false.
export function useIsTopModal(id, active) {
  return useSyncExternalStore(subscribeModalStack, () => active && isTopModal(id));
}

// Runs `focus` once per opening, the first time the window is the top one: at once when
// it opens on top, or later when a window drawn above it (the inactivity warning) closes.
// Opening under the warning must not pull focus off the warning's button.
export function useFocusWhenTop(id, active, focus) {
  const isTop = useIsTopModal(id, active);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const doneRef = useRef(false);
  useEffect(() => {
    if (!active) { doneRef.current = false; return; }
    if (!isTop || doneRef.current) return;
    doneRef.current = true;
    focusRef.current();
  }, [active, isTop]);
}
