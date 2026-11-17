// Lets a window fade out when it closes, without changing when it closes.
//
// React takes a closed window off the page in the same instant, so there is nothing left
// to fade. Keeping the window mounted a little longer instead would keep its screens alive
// past their close (their save-on-the-way-out, their timers, their place in the window
// stack), which is exactly what must not move. So the window still closes at once, and
// the node React has just let go of is put back on the page as a picture of itself:
// it can't be clicked, typed in or tabbed to, plays the closing fade (App.css,
// `.window-closing`), and is then thrown away.
//
// Taking a node off the page resets how far each scrolling area inside it was scrolled,
// so those are noted as they change and put back, or the window would jump to its top
// as it fades.
//
// Use: `const overlayRef = useCloseFade(isOpen)` and put the ref on the window's
// outermost element (its backdrop).

import { useLayoutEffect, useRef } from 'react';

// Longer than the fade itself: only a net for an animation that never reports its end.
const GIVE_UP_MS = 600;

export function useCloseFade(isOpen) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    const home = node.parentNode;

    const scrolled = new Map();
    const noteScroll = (e) => {
      const el = e.target;
      if (el && el.nodeType === 1) scrolled.set(el, [el.scrollTop, el.scrollLeft]);
    };
    node.addEventListener('scroll', noteScroll, { capture: true, passive: true });

    return () => {
      node.removeEventListener('scroll', noteScroll, { capture: true });
      // Still on the page: nothing closed (a development double-run of this effect).
      if (node.isConnected || !home || !home.isConnected) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      node.classList.add('window-closing');
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
      home.appendChild(node);
      scrolled.forEach(([top, left], el) => {
        el.scrollTop = top;
        el.scrollLeft = left;
      });

      let gone = false;
      const discard = () => {
        if (gone) return;
        gone = true;
        node.remove();
      };
      node.addEventListener('animationend', (e) => { if (e.target === node) discard(); });
      setTimeout(discard, GIVE_UP_MS);
    };
  }, [isOpen]);

  return ref;
}
