// Job card form validation for JobCardModal (the Create check on a new job).
// Pure function: takes form state, returns the marks for the boxes at fault, the
// messages that have no box of their own, and the filtered valid line items
// (reused by the caller when building the payload).
//
// The rules about what a box must contain live in fieldRules.mjs, read here and
// by each box's own instant-save check — see the header comment there.

import { itemFieldMessage, jobFieldMessage, fieldErrorKey } from './fieldRules.mjs';
import { splitAnswer, hasMixedNa } from '../../../../server/src/shared/lineItemAnswers.js';

// A line is "already saved" when it carries the server's stable "item:" id —
// fresh rows only get a temporary local number. buildJobcardPayload (mappers.js)
// keys the save payload's ids off the same rule, so the two share this predicate.
export const isSavedLineItem = (item) =>
  typeof item.id === 'string' && item.id.startsWith('item:');

// Returns { marks, errors, validItems }:
//  - marks.job   — { companyName?, description? }: the customer and description boxes
//  - marks.items — { [fieldErrorKey(item.id, field)]: message }: a part's own box, the
//                  same keys its instant-save marks use (useInstantItems.js)
//  - errors      — messages with no box to mark (no part at all, a supplier picked
//                  with no treatment), for the caller to show as one pop-up
// A mark sits under its own box, so it carries the box's own wording, not a
// "on part N" sentence.
export function validateJobCardForm({ canManage, formData, contactFormData, lineItems }) {
  const job = {};
  const items = {};
  const errors = [];
  const markItem = (item, field, message) => {
    const key = fieldErrorKey(item.id, field);
    if (!items[key]) items[key] = message;
  };

  if (canManage && !contactFormData.companyName.trim()) {
    job.companyName = 'Pick a customer for this job';
  }
  const descriptionMessage = jobFieldMessage('description', formData.description);
  if (descriptionMessage) {
    job.description = descriptionMessage;
  }

  // A blank line can't be saved, so it is marked rather than quietly discarded — on an
  // already-saved line the old silent drop made the server delete the part and its files
  // fell back to whole-job; on a fresh line it threw away a row the user had started.
  //
  // The one case that names nothing is a card that has never had a part saved on it and
  // still has none typed in: there is no particular row at fault, so it gets the single
  // "add at least one part" message rather than that plus a blank-row mark on the same
  // empty card. A job that DOES have a saved part is different — blanking its only part
  // is a mistake about that part, so its box is marked.
  const validItems = lineItems.filter(item => !itemFieldMessage('description', item.description));
  const hasSavedPart = lineItems.some(isSavedLineItem);
  if (validItems.length > 0 || hasSavedPart) {
    for (const item of lineItems) {
      const message = itemFieldMessage('description', item.description);
      if (message) markItem(item, 'description', message);
    }
  } else {
    errors.push('Add at least one part');
  }

  // "N/A" is the standalone "no drawing / nothing supplied" answer, so it can't
  // share a part with a real value. The picker already enforces this; the rule
  // itself is the same shared one the save check runs.
  const naCombined = (value) => hasMixedNa(splitAnswer(value));

  for (const item of validItems) {
    // Job type, drawings, customer property and quantity (a positive whole number —
    // it drives the "all parts finished -> Done" check) — each box's own rule.
    for (const field of ['jobType', 'drawingsType', 'customerProperty', 'qty']) {
      const message = itemFieldMessage(field, item[field]);
      if (message) markItem(item, field, message);
    }
    if (naCombined(item.drawingsType)) {
      markItem(item, 'drawingsType', 'Cannot combine "N/A" with other drawings values');
    }
    if (naCombined(item.customerProperty)) {
      markItem(item, 'customerProperty', 'Cannot combine "N/A" with other customer property values');
    }
  }

  // One treatment per part, with an optional supplier. The only invalid shape is a
  // supplier chosen with no treatment (a dangling half-entry); a treatment on its
  // own is fine. The treatment picker has no mark of its own, so this names the
  // part by its place in the full list — the badge ItemsTab.jsx shows for a
  // still-local row (itemIdx + 1), never itemNumber, an internal counter with gaps.
  lineItems.forEach((item, idx) => {
    if (!validItems.includes(item)) return;
    const treatments = Array.isArray(item.treatments) ? item.treatments : [];
    for (const tr of treatments) {
      if (!tr.value && !tr.supplierId) continue; // nothing on this part — fine
      if (!tr.value) {
        errors.push(`Part ${idx + 1}: pick a treatment for the chosen supplier`);
      }
    }
  });

  return { marks: { job, items }, errors, validItems };
}
