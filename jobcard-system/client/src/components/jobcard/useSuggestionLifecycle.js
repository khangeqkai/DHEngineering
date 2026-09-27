import { useState, useRef, useEffect, useCallback } from 'react';

// A click on the dropdown fires mousedown before the input's own blur, so the
// close on blur is delayed long enough for that click to still land.
const BLUR_CLOSE_DELAY_MS = 200;

// Shared open/focus/blur/click-outside lifecycle for a suggestion box —
// useJobSearch.js and useContactSearch.js are both built on this. Focusing
// clears any close still waiting from a previous blur and opens the box (an
// optional `onFocus` runs alongside, for a caller with its own one-time work to
// do, such as loading the list to filter). Blurring closes after a short delay,
// so a click on the dropdown still lands. A click anywhere outside the box's own
// container closes it immediately, with no delay. `noteTyping` is for the one
// case neither of those covers: a pick made with Enter never blurs the box (the
// cursor stays put), so it's the only thing that says the box is being worked in
// again and brings the suggestions back for it — a mouse pick, by contrast,
// takes focus out of the box, so simply coming back counts as a fresh visit.
export function useSuggestionLifecycle({ onFocus } = {}) {
  const [focused, setFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef(null);
  const blurTimeoutRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setFocused(true);
    if (onFocus) onFocus();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;
      setFocused(false);
      setShowDropdown(false);
    }, BLUR_CLOSE_DELAY_MS);
  }, []);

  const noteTyping = useCallback(() => setFocused(true), []);

  // For a pick that closes the list itself (rather than waiting on the blur
  // above) and wants no stray delayed close following it in a moment later.
  const cancelPendingClose = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  return {
    focused,
    setFocused,
    showDropdown,
    setShowDropdown,
    containerRef,
    handleFocus,
    handleBlur,
    noteTyping,
    cancelPendingClose
  };
}
