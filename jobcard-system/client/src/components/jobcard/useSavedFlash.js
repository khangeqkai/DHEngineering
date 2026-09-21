import { useEffect, useState } from 'react';

// How long the job window's frame stays green after the last edit reaches the job.
// Long enough to catch the eye when the change was made at the other end of the
// screen, short enough that it is plainly about what just happened.
const FLASH_MS = 1800;

/**
 * True for a moment each time `settled` turns true — the job card's "everything on
 * screen has reached the job" flash, which the window frame wears in place of the
 * small "Saved" the header no longer has room for.
 *
 * A flash, not a state: a frame that stayed green for the rest of the session would
 * stop reading as "that just saved". Held by a timer here rather than a keyframe
 * animation in CSS, because the frame's colour is a transition on the window itself
 * and hanging an animation off a class that comes and goes would replay the window's
 * opening slide every time it cleared.
 */
export function useSavedFlash(settled) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (!settled) {
      setFlashing(false);
      return undefined;
    }
    setFlashing(true);
    const id = setTimeout(() => setFlashing(false), FLASH_MS);
    return () => clearTimeout(id);
  }, [settled]);

  return flashing;
}
