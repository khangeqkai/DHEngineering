import { useRef, useEffect, useCallback } from 'react';
import { useUnsavedGuard } from './useUnsavedGuard';
import { buildCloseReasons } from './closeReasons';

/**
 * Tells the list behind this modal to reload once, on close, and only when
 * something actually reached the server while the job was open.
 *
 * An instant write patches the one field, row or worker it changed — it never
 * touches the list's own copy of the job, which the old whole-job Save used to
 * refresh through onSuccess. Refreshing on every write instead would re-fetch the
 * whole list mid-typing, so the flag is raised by useJobCardForm.js's onInstantSave
 * and read here when the job closes.
 *
 * The flag is cleared on every open for the same reason the instant-save hooks
 * clear theirs: JobCardModal returns null when closed rather than unmounting, so
 * it would otherwise outlive the close and refresh on behalf of the previous job.
 */
export function useJobCardListRefresh({ isOpen, isEdit, onSuccess, onClose }) {
  const savedSomethingRef = useRef(false);
  useEffect(() => { if (isOpen) savedSomethingRef.current = false; }, [isOpen]);

  const flagInstantSave = useCallback(() => { savedSomethingRef.current = true; }, []);

  const closeAndRefresh = useCallback(() => {
    if (isEdit && savedSomethingRef.current) {
      savedSomethingRef.current = false;
      onSuccess?.();
    }
    onClose();
  }, [isEdit, onSuccess, onClose]);

  return { flagInstantSave, closeAndRefresh };
}

/**
 * Wires closeReasons.js (which box is empty, what failed to save) up to
 * useUnsavedGuard.js (what the close question actually does about it) against one
 * open job card. Pulled out of JobCardModal.jsx, which was already at this file's
 * line budget, the same reason useJobCardInstantSaves.js exists.
 *
 * closeReasons.js now reads the shared save queue's own pending()/failed record
 * (Contract A, tasks/instant-save-root-causes.md) rather than each hook's own
 * fieldStates — one recorded fact per key instead of three separate guesses.
 */
export function useJobCardCloseGuard({
  isOpen,
  isEdit,
  jobCardId,
  canSeePricing,
  isDirty,
  formHook,
  instantItems,
  saveQueue,
  jobNotes,
  timer,
  costingHook,
  saving,
  showConfirm,
  onClose,
  revealDetails,
  // Switches to the Costing tab and (once it's rendered) brings a named field into
  // view — the close-time twin of revealDetails above, needed because a red pricing
  // box can be off screen on any other tab when the job is asked to close. Passed in
  // from JobCardModal.jsx alongside revealDetails; see useCosting.js's
  // guardLeaveCosting for why the field is still worth naming even though it also
  // tries to scroll to it itself (that call is a no-op until the tab has switched).
  revealCosting
}) {
  const closeReasons = buildCloseReasons({
    isEdit,
    descriptionError: formHook.descriptionError,
    formData: formHook.formData,
    savedForm: formHook.savedForm,
    lineItems: formHook.lineItems,
    savedItemFields: formHook.savedItemFields,
    itemFieldErrors: instantItems.fieldErrors,
    jobCardId,
    pending: saveQueue.pending()
  });

  // The pricing sheet as of the latest render — the close handler below outlives the
  // render it started in, and needs to know whether its own save left figures unstored.
  const costingRef = useRef(costingHook);
  costingRef.current = costingHook;
  // Set for the length of one close attempt whose pricing save failed ('failed') or
  // hadn't answered within the close's time limit ('pending'). Only a failed save's
  // figures are dropped when the person answers "discard" — otherwise the save-on-close
  // backstop (useJobCardCosting.js) would quietly send the figures they just chose to
  // lose. A pending save is left alone: it is still on its way and may yet store, so
  // the question never offers to lose it and nothing here throws it away.
  const pricingUnsavedRef = useRef(false);
  const closeDroppingPricing = useCallback(() => {
    if (pricingUnsavedRef.current === 'failed') costingRef.current.dropUnsavedCosting();
    onClose();
  }, [onClose]);

  const guard = useUnsavedGuard({
    isOpen,
    isDirty,
    saving,
    hasUnpostedNote: jobNotes.newNote.trim() !== '',
    stopFormOpen: timer.showEntryForm,
    costingDirty: canSeePricing ? costingHook.costingDirty : false,
    // A box still being typed in (including a red one) — see costingHasDraft in
    // useCosting.js. Counted as work to lose alongside costingDirty, so a page refresh
    // with an unsaved or red pricing box asks first.
    costingUnsettled: canSeePricing ? costingHook.costingHasDraft : false,
    showConfirm,
    onClose: closeDroppingPricing,
    isEdit,
    closeReasons,
    revealDetails
  });

  // Closing counts as leaving the box the cursor is in, so it saves that box like Tab or
  // a click elsewhere would — never asks whether to throw it away. Escape never blurs
  // anything, and the X's own blur lands a moment before its click, so either way the
  // question used to be put while that box's save was still on its way (or not even
  // asked for) and offered "Discard changes" for a value that should simply be kept.
  //
  // So: leave the box, give its save one frame to be asked for (the pricing sheet's is
  // deliberately one render late — useCosting's requestImmediateSave), wait for every
  // job save to land (for up to a few seconds), then ask the question against the screen as it is NOW — through
  // a ref, because the handler this call started in still holds the old state. Anything
  // that genuinely couldn't be kept (a failed save, a required box left blank) is still
  // asked about. Pricing is saved here too, and waited for, before the question — a
  // pricing save that fails is named in the question like any other unsaved work rather
  // than lost after the window has gone (useJobCardCosting.js's save on close is only a
  // backstop for closes that never reach this).
  const askRef = useRef(guard.handleRequestClose);
  askRef.current = guard.handleRequestClose;
  const closingRef = useRef(false);
  const { whenSettled } = saveQueue;
  const handleRequestClose = useCallback(async () => {
    // A second Escape while the first is still waiting must not stack a second question.
    if (closingRef.current) return;
    closingRef.current = true;
    try {
      if (isEdit) {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.blur();
        await nextFrame();
        // Bounded: a save stuck on a dead network never settles, and waiting on it
        // forever left the window impossible to close (every later press met the guard
        // above). Past the limit the question is asked anyway, and it names whatever
        // hasn't finished saving so the person can keep editing or close.
        await Promise.race([whenSettled(), wait(CLOSE_SETTLE_LIMIT_MS)]);
        await nextFrame();
        // A red pricing box is a harder stop than the ordinary unsaved-work question
        // below: the figure in it was never valid, so there's nothing to save. Ask about
        // it first, and separately. costingHook.guardLeaveCosting commits every other
        // box on the way (exactly like leaving the tab does) and only stops here for one
        // still sitting red.
        if (canSeePricing) {
          const { proceed, field } = await costingHook.guardLeaveCosting(showConfirm);
          if (!proceed) {
            revealCosting?.(field);
            return;
          }
          // Then save the pricing and wait for the answer. A failure is only work at
          // risk while the sheet still holds figures the server never stored — a save
          // refused because the job was closed elsewhere drops them on purpose.
          // Bounded like the job saves above, and for the same reason: a pricing save
          // stuck on a dead network would otherwise hold the close open for good. Past
          // the limit the save keeps running in the background, and the question says
          // the pricing hasn't finished saving rather than that it failed.
          await nextFrame();
          const { ok, timedOut } = await Promise.race([
            costingRef.current.flushCosting(),
            wait(CLOSE_SETTLE_LIMIT_MS).then(() => ({ ok: false, timedOut: true }))
          ]);
          await nextFrame();
          pricingUnsavedRef.current = !ok && costingRef.current.costingDirty
            ? (timedOut ? 'pending' : 'failed')
            : false;
        }
      }
      await askRef.current({ pricingUnsaved: pricingUnsavedRef.current });
    } finally {
      pricingUnsavedRef.current = false;
      closingRef.current = false;
    }
  }, [isEdit, whenSettled, canSeePricing, costingHook, showConfirm, revealCosting]);

  return { ...guard, handleRequestClose };
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Long enough for any save on a working network to land; short enough not to feel frozen.
const CLOSE_SETTLE_LIMIT_MS = 3000;
