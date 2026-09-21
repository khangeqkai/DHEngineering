import { useCallback } from 'react';
import { useInstantSave } from './useInstantSave';
import { useInstantItems } from './useInstantItems';

/**
 * Wires the two instant-save hooks — the details fields (useInstantSave.js) and
 * the parts list (useInstantItems.js) — up against one open job card's form state
 * and the shared save queue (useSaveQueue.js, Contract A). Pulled out of
 * JobCardModal.jsx, which was already at this file's line budget, so the wiring
 * for both lives in one place instead of growing the modal further.
 *
 * jobCardId is only ever handed through on an existing job — both hooks already
 * treat a null id as "nothing to write to yet" and stay local-only.
 *
 * onAttachmentWarnings (Contract B) lets a part write's reply refresh the file
 * notes the moment it lands, the same way the screen rows and the saved baseline
 * already do — see useInstantItems.js's applyItemReply.
 */
export function useJobCardInstantSaves(formHook, isEdit, jobCardId, saveQueue, onAttachmentWarnings) {
  const { markFieldSaved, markItemSaved, markItemRemoved } = formHook;
  const forJobCardId = isEdit ? jobCardId : null;

  const instantSave = useInstantSave(forJobCardId, saveQueue, { onSaved: markFieldSaved });
  const instantItems = useInstantItems({
    jobCardId: forJobCardId,
    lineItems: formHook.lineItems,
    setLineItems: formHook.setLineItems,
    removeLineItem: formHook.removeLineItem,
    savedItemFields: formHook.savedItemFields,
    onItemSaved: markItemSaved,
    onItemRemoved: markItemRemoved,
    onAttachmentWarnings,
    saveQueue
  });

  // One combined reset for the two hooks' own session-only marks (fieldStates'
  // "ever saved" record, the parts list's required-box marks) — collapses what
  // would otherwise be two separate refs/calls in JobCardModal.jsx into one. The
  // save queue itself (formHook.saveQueue) resets alongside the rest of the form
  // in useJobCardForm.js's own resetForm, not here.
  const resetInstantSaves = useCallback(() => {
    instantSave.resetFieldStates();
    instantItems.resetItemErrors();
  }, [instantSave, instantItems]);

  return { instantSave, instantItems, resetInstantSaves };
}
