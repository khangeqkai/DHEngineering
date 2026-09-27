import { useEffect, useRef } from 'react';

// Shared open/close wiring for a small popover menu (status picker, assignee
// picker, columns menu, a per-line tag checklist): closes on a press outside
// the menu, on Escape (returning focus to whichever control opened it), and
// when focus lands outside the menu. Tab is never trapped — it moves from the
// trigger into the choices and on out, and the menu closes once focus has
// actually left. Closing on the Tab *keypress* would be wrong: the key fires
// before focus moves, so the press that should step into the choices would
// unmount them instead.
//
// `containerRef` is the ref attached to the menu's wrapping element; it only
// needs to be non-null while `open` is true (the existing per-row pattern of
// `ref={openId === card.id ? containerRef : null}` works as-is).
export function useDismissableMenu({ open, onClose, containerRef }) {
  const openerRef = useRef(null);

  useEffect(() => {
    if (open) openerRef.current = document.activeElement;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePressOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        // Capture phase + stopped here, so Escape closes only this menu and
        // never reaches a dialog layered underneath it (the job card sheet,
        // for a menu opened from inside a part row).
        e.preventDefault();
        e.stopPropagation();
        onClose();
        openerRef.current?.focus?.();
      }
    };
    const handleFocusIn = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePressOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('mousedown', handlePressOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [open, onClose, containerRef]);
}
