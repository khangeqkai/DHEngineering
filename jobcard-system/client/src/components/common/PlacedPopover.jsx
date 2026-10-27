import { useLayoutEffect, useRef, useState } from 'react';

// A small drop-down that hangs off the control that opened it (the status pickers,
// the job list's worker tick list). It opens downward, unless there isn't room below
// inside whatever cuts it off (the job list's scrolling table, or the window itself)
// and there is more room above — then it opens upward (.status-popover--up). Either
// way its height is capped to the room it has, never above its own stylesheet cap,
// and it scrolls inside. Its parent is the anchor (.status-popover-wrapper).
const GAP = 4;
const EDGE = 8;
const MIN_HEIGHT = 120;

function clippingBox(el) {
  let top = 0;
  let bottom = window.innerHeight;
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY !== 'visible') {
      const r = node.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return { top, bottom };
}

export default function PlacedPopover({ className = '', menuRef, onKeyDown, children }) {
  const ownRef = useRef(null);
  const ref = menuRef || ownRef;
  const [placement, setPlacement] = useState({ up: false, maxHeight: undefined });

  useLayoutEffect(() => {
    const menu = ref.current;
    const anchor = menu?.parentElement;
    if (!menu || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const clip = clippingBox(anchor);
    const below = clip.bottom - a.bottom - GAP - EDGE;
    const above = a.top - clip.top - GAP - EDGE;
    const up = menu.scrollHeight > below && above > below;
    const cap = parseFloat(window.getComputedStyle(menu).maxHeight);
    const room = Math.max(MIN_HEIGHT, up ? above : below);
    setPlacement({ up, maxHeight: Number.isFinite(cap) ? Math.min(cap, room) : room });
  }, [ref]);

  return (
    <div
      ref={ref}
      className={`status-popover ${className}${placement.up ? ' status-popover--up' : ''}`}
      style={placement.maxHeight ? { maxHeight: placement.maxHeight } : undefined}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
