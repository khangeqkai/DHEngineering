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
  isAdmin,
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
  revealDetails
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

  return useUnsavedGuard({
    isOpen,
    isDirty,
    saving,
    hasUnpostedNote: jobNotes.newNote.trim() !== '',
    stopFormOpen: timer.showEntryForm,
    costingDirty: isAdmin ? costingHook.costingDirty : false,
    showConfirm,
    onClose,
    isEdit,
    closeReasons,
    revealDetails
  });
}
