import { useCallback, useEffect, useRef } from 'react';

// Answers "is the screen that asked for this still up?" for a reply that comes back
// after a slow request. A reply that only updates the screen's own state needs no check
// (React drops it silently once the screen is gone). Ask this before anything that
// reaches outside the screen: closing the window, a call into the page behind, or a
// message about a failed read. Never ask it before telling the person their own write
// failed or was refused: that is told whether or not the window is still up.
// The function never changes identity. It is false from the screen's unmount onward, so a
// reply for one opening of a window can never act on the next opening.
export function useStillMounted() {
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set again on mount so strict mode's throwaway mount-unmount-mount ends up true.
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  return useCallback(() => mountedRef.current, []);
}
