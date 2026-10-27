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
  // It leaves formData untouched when that refusal lands: the mark's rule is "shows
  // only while the box still holds the text it was raised against", so changing the
  // box out from under the user would clear the very message meant to explain why
  // nothing was saved.
  const detailFieldErrors = useFieldErrors((name) => formData[name]);

  const instantSave = useInstantSave(forJobCardId, saveQueue, {
    onSaved: markFieldSaved,
    onAttachmentWarnings,
    fieldErrors: detailFieldErrors
  });
  const instantItems = useInstantItems({
    jobCardId: forJobCardId,
    lineItems: formHook.lineItems,
    setLineItems: formHook.setLineItems,
    removeLineItem: formHook.removeLineItem,
    savedItemFields: formHook.savedItemFields,
    onItemSaved: markItemSaved,
    onItemRemoved: markItemRemoved,
    onAttachmentWarnings,
    onJobClosed,
    saveQueue
  });

  return { instantSave, instantItems, detailFieldErrors };
}
