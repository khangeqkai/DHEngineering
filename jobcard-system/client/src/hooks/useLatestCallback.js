import { useCallback, useLayoutEffect, useRef } from 'react';

// A function that never changes identity but always runs the newest version of
// `fn` — the one from the most recent screen update. For a reload after a save:
// the save waits on the server first, and by the time it comes back the person
// may have switched tab or ticked "Show archived". Calling the load captured
// when the button was pressed would reload that earlier view and, being the
// newest load, knock out the load for the view that is actually showing.
export function useLatestCallback(fn) {
  const fnRef = useRef(fn);
  useLayoutEffect(() => { fnRef.current = fn; });
  return useCallback((...args) => fnRef.current(...args), []);
}
