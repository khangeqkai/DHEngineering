import { useCallback } from 'react';
import { useInstantSave } from './useInstantSave';
import { useInstantItems } from './useInstantItems';
import { useFieldErrors } from '../../hooks/useFieldErrors';

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
 * onAttachmentWarnings (Contract B) lets a part or field write's reply refresh
 * the file notes the moment it lands, the same way the screen rows and the saved
 * baseline already do — see useInstantItems.js's applyItemReply.
 *
 * onJobClosed is the job screen's shared closed-job handler, for a part add or
 * removal refused because the job was closed from another PC — those two report
 * their own refusals rather than failing through the save queue.
 */
export function useJobCardInstantSaves(formHook, isEdit, jobCardId, saveQueue, { onAttachmentWarnings, onJobClosed } = {}) {
  const { markFieldSaved, markItemSaved, markItemRemoved, setFormData, formData } = formHook;
  const forJobCardId = isEdit ? jobCardId : null;

  // A single-value field's own required-box mark for a server refusal that names
  // it in `fields` (useInstantSave.js's FIELD_BOXES, read by the shared
  // fieldErrorsFromRefusal) — same "a mark follows the exact text it was raised
  // against" rule as every other mark in the app (hooks/useFieldErrors.js).
  // Today the only field this can happen to is the previous-job reference: this
  // deliberately leaves formData (isRepeatJob, repeatJobReference) untouched when
  // that refusal lands, rather than flipping the tick off itself — the mark's
  // rule is "shows only while the box still holds the text it was raised
  // against", so silently changing either box out from under the user would
  // clear the very message meant to explain why nothing was saved. The user sees
  // the mark, tries again (retyping re-raises it against the new text, or
  // reopening the job picks up the true state from the server) — same recovery
  // as every other field-level refusal in the app.
  const detailFieldErrors = useFieldErrors((name) => formData[name]);

  const instantSave = useInstantSave(forJobCardId, saveQueue, {
    onSaved: markFieldSaved,
    onAttachmentWarnings,
    fieldErrors: detailFieldErrors
  });
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
    onJobClosed,
    saveQueue
  });

  // One combined reset for the two hooks' own session-only marks (fieldStates'
  // "ever saved" record, the parts list's required-box marks, and this file's own
  // detail-field marks) — collapses what would otherwise be three separate
  // refs/calls in JobCardModal.jsx into one. The save queue itself
  // (formHook.saveQueue) resets alongside the rest of the form in
  // useJobCardForm.js's own resetForm, not here.
  const resetInstantSaves = useCallback(() => {
    instantSave.resetFieldStates();
    instantItems.resetItemErrors();
    detailFieldErrors.clearAll();
  }, [instantSave, instantItems, detailFieldErrors]);

  return { instantSave, instantItems, resetInstantSaves, detailFieldErrors };
}
