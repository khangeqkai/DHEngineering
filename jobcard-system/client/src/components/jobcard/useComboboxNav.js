import { useState, useEffect, useCallback, useRef, useId } from 'react';

// Shared keyboard/highlight behaviour for a suggestion list worked from the
// keyboard without focus ever leaving the box — moving focus into the list would
// fire the blur that closes it. Up/Down move a highlight, wrapping at each end;
// Enter takes the highlighted row; Escape blurs the box (closing whatever reads
// that blur as "done here"); and a fresh set of suggestions always starts with
// nothing highlighted, since carrying the old position over would point the
// keyboard at a different row than the one that was under it.
//
// Also carries the "a pick stands the next blur down" guard shared by every
// combobox on the job screen: picking a row (mouse or Enter) fires its own write
// via `choose`, which arms the guard before calling `onChoose` — the blur that
// follows a mouse pick (or that a caller's own commit logic triggers) can then
// call `consumePickGuard()` to find out it should stand aside rather than redo
// its own commit/reset over the just-picked value. Typing again is what brings
// the guard back down for an Enter pick, which never blurs the box on its own —
// each call site decides for itself whether (and when) to call
// `disarmPickGuard()`, since not every site needs to re-disarm on a keystroke.
export function useComboboxNav({ items, isOpen, onChoose }) {
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const pickGuardRef = useRef(false);

  useEffect(() => { setActiveIndex(-1); }, [items]);

  const choose = useCallback((index) => {
    pickGuardRef.current = true;
    onChoose(index);
  }, [onChoose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); return; }
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i < items.length - 1 ? i + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i > 0 ? i - 1 : items.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      choose(activeIndex);
    }
  }, [isOpen, items.length, activeIndex, choose]);

  const disarmPickGuard = useCallback(() => { pickGuardRef.current = false; }, []);
  // Read-and-reset in one step, for a blur handler: true means this blur is the
  // one right behind a pick, and should stand aside.
  const consumePickGuard = useCallback(() => {
    if (!pickGuardRef.current) return false;
    pickGuardRef.current = false;
    return true;
  }, []);

  return { listId, activeIndex, setActiveIndex, handleKeyDown, choose, disarmPickGuard, consumePickGuard };
}
