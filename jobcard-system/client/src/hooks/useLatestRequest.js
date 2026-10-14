import { useCallback, useRef } from 'react';

// "Latest request wins" for a screen that reloads when a choice changes (a
// dropdown, a filter, which job is open). Call `startRequest()` just before
// fetching; it returns a function, `isLatest()`, to ask after the reply comes
// back. Only the newest request may touch the screen — an older reply that lands
// last would otherwise put the previous choice's rows under the new choice's
// label. Reads only: this decides whose answer is shown, it never re-sends anything.
export function useLatestRequest() {
  const counterRef = useRef(0);
  return useCallback(() => {
    const id = ++counterRef.current;
    return () => id === counterRef.current;
  }, []);
}
