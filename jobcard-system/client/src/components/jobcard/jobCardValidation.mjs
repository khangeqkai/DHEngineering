// Job card form validation for JobCardModal
// Pure function: takes form state, returns the list of error messages plus the
// filtered valid line items (reused by the caller when building the payload).
//
// The rules about what a box must contain live in fieldRules.mjs, read here and
// by each box's own instant-save check — see the header comment there.

import { itemFieldMessage, jobFieldMessage, ITEM_QTY_REQUIRED } from './fieldRules.mjs';

// A line is "already saved" when it carries the server's stable "item:" id —
// fresh rows only get a temporary local number. buildJobcardPayload (mappers.js)
// keys the save payload's ids off the same rule, so the two share this predicate.
export const isSavedLineItem = (item) =>
  typeof item.id === 'string' && item.id.startsWith('item:');

export function validateJobCardForm({ canManage, formData, contactFormData, lineItems }) {
  const errors = [];

  if (canManage && !contactFormData.companyName.trim()) {
    errors.push('Pick a customer for this job');
  }
  const descriptionMessage = jobFieldMessage('description', formData.description);
  if (descriptionMessage) {
    errors.push(descriptionMessage);
  }

  // A blank line can't be saved, so it is marked rather than quietly discarded — on an
  // already-saved line the old silent drop made the server delete the part and its files
  // fell back to whole-job; on a fresh line it threw away a row the user had started.
  //
  // The one case that names nothing is a card that has never had a part saved on it and
  // still has none typed in: there is no particular row at fault, so it gets the single
  // "add at least one part" message rather than that plus a blank-row complaint
  // about the same empty card. A job that DOES have a saved part is different — blanking
  // its only part is a mistake about that part, so the message names it. The two are
  // mutually exclusive, so only ever one message comes out of this block.
  const validItems = lineItems.filter(item => !itemFieldMessage('description', item.description));
  const blankIdx = lineItems.findIndex(item => itemFieldMessage('description', item.description));
  const hasSavedPart = lineItems.some(isSavedLineItem);
  if (blankIdx !== -1 && (validItems.length > 0 || hasSavedPart)) {
    const blank = lineItems[blankIdx];
    errors.push(`Description is required on part ${blank.itemNumber || blankIdx + 1}`);
  } else if (validItems.length === 0) {
    errors.push('Add at least one part');
  }

  // Per-part errors name the row's real itemNumber (the badge ItemsTab shows);
  // positions in the filtered list shift when a blanked line is dropped, so
  // index-based numbering can point at the wrong row.
  const itemNo = (i) => validItems[i].itemNumber || i + 1;

  const itemMissingJobType = validItems.findIndex(item => itemFieldMessage('jobType', item.jobType));
  if (itemMissingJobType !== -1) {
    errors.push(`Job type is required on part ${itemNo(itemMissingJobType)}`);
  }

  const itemMissingDrawings = validItems.findIndex(item => itemFieldMessage('drawingsType', item.drawingsType));
  if (itemMissingDrawings !== -1) {
    errors.push(`Drawings is required on part ${itemNo(itemMissingDrawings)}`);
  }

  const itemMissingProperty = validItems.findIndex(item => itemFieldMessage('customerProperty', item.customerProperty));
  if (itemMissingProperty !== -1) {
    errors.push(`Customer property is required on part ${itemNo(itemMissingProperty)}`);
  }

  // "N/A" is the standalone "no drawing / nothing supplied" answer, so it can't
  // share a part with a real value. The picker already enforces this; this mirrors
  // the server rule so the form and the save check agree.
  const naCombined = (value) => {
    const values = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    return values.includes('N_A') && values.length > 1;
  };
  for (let i = 0; i < validItems.length; i++) {
    if (naCombined(validItems[i].drawingsType)) {
      errors.push(`Part ${itemNo(i)} cannot combine "N/A" with other drawings values`);
    }
    if (naCombined(validItems[i].customerProperty)) {
      errors.push(`Part ${itemNo(i)} cannot combine "N/A" with other customer property values`);
    }
  }

  // Quantity is compulsory and must be a positive whole number (it drives the
  // "all parts finished -> Done" check). Blanks, zero, and decimals are rejected.
  // itemFieldMessage produces exactly one of two messages for qty, and the two
  // sentences below infix the item number differently, so neither is that message
  // plus a suffix. Telling them apart by the exported constant rather than by a
  // copy of the wording keeps the two files from drifting apart silently.
  for (let i = 0; i < validItems.length; i++) {
    const qtyMessage = itemFieldMessage('qty', validItems[i].qty);
    if (qtyMessage === ITEM_QTY_REQUIRED) {
      errors.push(`Quantity is required on part ${itemNo(i)}`);
    } else if (qtyMessage) {
      errors.push(`Quantity on part ${itemNo(i)} must be a whole number of 1 or more`);
    }
  }

  // One treatment per part, with an optional supplier. The only invalid shape is a
  // supplier chosen with no treatment (a dangling half-entry); a treatment on its
  // own is fine.
  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const treatments = Array.isArray(item.treatments) ? item.treatments : [];
    for (const tr of treatments) {
      if (!tr.value && !tr.supplierId) continue; // nothing on this part — fine
      if (!tr.value) {
        errors.push(`Part ${itemNo(i)}: pick a treatment for the chosen supplier`);
      }
    }
  }

  return { errors, validItems };
}
