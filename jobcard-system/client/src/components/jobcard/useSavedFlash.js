import { useEffect, useRef, useState } from 'react';

// How long the job window's frame stays green after the last edit reaches the job.
// Long enough to catch the eye when the change was made at the other end of the
// screen, short enough that it is plainly about what just happened.
const FLASH_MS = 1800;

/**
 * The job window's "that reached the job" flash — the green frame the header no
 * longer has room to spell out in words — and the same fact in words for a screen
 * reader (`anythingLanded`), so the two can never disagree.
 *
 * Green is fired by a write actually landing, never by unsaved work going away.
 * Those are not the same thing: the screen also stops having anything outstanding
 * when an edit is abandoned (a half-typed part deleted before it was ever sent, a
 * box typed back to exactly what was already stored — useInstantSave.js returns
 * before sending in that case). Answering those with green told people their work
 * had been saved at the moment it was thrown away, so both signals read the save
 * queue's own count of confirmed landings instead (useSaveQueue.js).
 *
 * `waiting` is the whole of what is still on its way — the job's own fields, parts
 * and people, plus the pricing sheet, which saves itself when a box is left and on a
 * short countdown behind that, and stops retrying after a failure. The amber frame is
 * asked this same question (JobCardModal.jsx), so the two never describe different
 * work: amber for exactly what green is waiting on. A comment typed but not posted,
 * and an open timer-entry form, are deliberately NOT in here: they are drafts the
 * person is still holding, not saves in flight, and letting either one veto the flash
 * would mean a job with a stray half-typed comment never confirmed a single save again.
 *
 * `landedCount` likewise has to count every write the frame is waiting on, pricing
 * included — the pricing sheet keeps its own tally because it saves on its own path
 * rather than through the job's save queue, and the two are added together at the call
 * site. A half that counts less than `waiting` covers turns the frame amber for work it
 * can then never answer.
 *
 * Green therefore lands on one transition: something was confirmed, and then the
 * screen went quiet. A landing while other work is still outstanding arms the flash
 * and waits for the rest, so the green always means all of it, not just the last bit.
 *
 * `active` is the job window being open on an existing job, and it is what keeps one
 * opening's news out of the next one. A field edited with the cursor still in the box
 * is sent as the close button takes focus off it, so that write is normally still in
 * the air when the window goes — and it lands, quite correctly, while there is nothing
 * on screen. Without this the flash would start against a closed window, and reopening
 * the job (which resets the count) would cancel its timer without ever clearing it, so
 * the next opening arrived green and stayed green. While the window is shut this
 * absorbs whatever lands, arms nothing and holds nothing.
 *
 * Held by a timer here rather than a keyframe animation in CSS, because the frame's
 * colour is a transition on the window itself and hanging an animation off a class
 * that comes and goes would replay the window's opening slide every time it cleared.
 */
export function useSavedFlash({ landedCount, waiting, active }) {
  const [flashing, setFlashing] = useState(false);
  // Whether anything has been confirmed during THIS opening — the spoken twin of the
  // green, which has to persist rather than flash.
  const [landedHere, setLandedHere] = useState(false);
  // The last landing count this hook has reacted to, and whether a landing since
  // then is still waiting for the screen to go quiet.
  const seenRef = useRef(landedCount);
  const armedRef = useRef(false);

  useEffect(() => {
    if (!active) {
      seenRef.current = landedCount;
      armedRef.current = false;
      setFlashing(false);
      setLandedHere(false);
      return undefined;
    }

    if (landedCount < seenRef.current) {
      // The queue was reset — a different job, or this one reopened. Nothing that
      // landed before belongs to what is on screen now.
      seenRef.current = landedCount;
      armedRef.current = false;
      setFlashing(false);
      setLandedHere(false);
    } else if (landedCount > seenRef.current) {
      seenRef.current = landedCount;
      armedRef.current = true;
      setLandedHere(true);
    }

    if (waiting) {
      // Something is on its way again: the frame belongs to amber until it lands,
      // and the green has to stop being true now rather than outliving its timer.
      setFlashing(false);
      return undefined;
    }
    if (!armedRef.current) return undefined;

    armedRef.current = false;
    setFlashing(true);
    const id = setTimeout(() => setFlashing(false), FLASH_MS);
    return () => clearTimeout(id);
  }, [landedCount, waiting, active]);

  return {
    // Worked out here rather than left to the caller or to which CSS rule happens to
    // come last: the effect above only runs after the screen has been painted, so a
    // fresh edit would otherwise get one frame of green — the exact opposite of what
    // just happened — before amber took over. Green is by definition "nothing is
    // waiting, on a window that is actually open", so it is asked that way, and it can
    // never be true at the same time as amber.
    flashing: flashing && !waiting && active,
    anythingLanded: landedHere
  };
}
