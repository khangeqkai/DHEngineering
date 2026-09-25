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
  const { markFieldSaved, markItemSaved, markItemRemoved, setFormData } = formHook;
  const forJobCardId = isEdit ? jobCardId : null;

  const instantSave = useInstantSave(forJobCardId, saveQueue, { onSaved: markFieldSaved });
  // A part create/update/delete can auto-advance the job's status server-side, the
  // same way starting/stopping a timer already does (JobCardModal.jsx's
  // refreshJobStatus / useJobCardTimerActions.js) — folding the reply's own
  // `jobStatus` straight into form state is the same "server-confirmed value,
  // never an unsaved edit" route: `status` is stripped from the isDirty baseline
  // (useJobCardForm.js), so this can never mark the card dirty or arm a save.
  // `jobStatus` is only present on a reply when that write actually moved the
  // status. A slow reply landing after the user has since picked their own status
  // by hand could otherwise still stomp it back — that race is closed not here but
  // in JobIdentityStrip.jsx, which waits for every part save already in flight to
  // settle before it sends a hand-picked status change.
  // setFormData is a raw useState setter (stable identity), so this callback never
  // changes and doesn't churn applyItemReply/writeItemField/etc below it.
  const onJobStatusChange = useCallback((status) => {
    if (status) setFormData(prev => ({ ...prev, status }));
  }, [setFormData]);
  const instantItems = useInstantItems({
    jobCardId: forJobCardId,
    lineItems: formHook.lineItems,
    setLineItems: formHook.setLineItems,
    removeLineItem: formHook.removeLineItem,
    savedItemFields: formHook.savedItemFields,
    onItemSaved: markItemSaved,
    onItemRemoved: markItemRemoved,
    onAttachmentWarnings,
    onJobStatusChange,
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
