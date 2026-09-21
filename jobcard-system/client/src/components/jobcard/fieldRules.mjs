// The one rule table for what a job-level box or a part's box must contain.
// Both the all-at-once check the Create button runs (jobCardValidation.mjs)
// and each box's own instant-save check (JobIdentityStrip.jsx for job
// fields; useInstantItems.js for parts, until package 1 swaps its local
// copy for this one — see tasks/instant-save-root-causes.md) read this file,
// so the rule is written once instead of twice and the two can no longer
// drift apart.
//
// Every "message" function returns a message when the value is not
// acceptable, else null.

// The fields the server requires on a part before it will accept it
// (validateOneItem, server/src/routes/jobcard-items.js).
export const REQUIRED_ITEM_FIELDS = ['description', 'qty', 'jobType', 'drawingsType', 'customerProperty'];

// Exported so the all-at-once check (jobCardValidation.mjs) can tell the two
// qty failures apart without comparing against a copy of the wording. It needs
// to, because the two sentences infix the item number differently ("Quantity is
// required on item #3" vs "Quantity on item #3 must be a whole number of 1 or
// more"), so neither is this message plus a suffix. Comparing against a string
// literal there would fail silently the day the wording here changes.
export const ITEM_QTY_REQUIRED = 'Quantity is required';
export const ITEM_QTY_NOT_WHOLE = 'Quantity must be a whole number of 1 or more';

const ITEM_REQUIRED_MESSAGE = {
  description: 'Description is required',
  jobType: 'Job type is required',
  drawingsType: 'Drawings is required',
  customerProperty: 'Customer property is required'
};

// qty carries one more rule than "present" — a whole number of 1 or more —
// matching the server's own check (validateItemQuantities), so a row waved
// through here is never rejected by a stricter rule once it reaches it.
export function itemFieldMessage(field, value) {
  if (field === 'qty') {
    const qty = String(value ?? '').trim();
    if (!qty) return ITEM_QTY_REQUIRED;
    if (!/^\d+$/.test(qty) || parseInt(qty, 10) < 1) return ITEM_QTY_NOT_WHOLE;
    return null;
  }
  const message = ITEM_REQUIRED_MESSAGE[field];
  if (!message) return null;
  return String(value ?? '').trim() ? null : message;
}

// A still-local row is ready to send the moment every field the server
// requires is filled in, in whatever order the user happens to fill them.
export function isItemRowComplete(row) {
  return REQUIRED_ITEM_FIELDS.every(field => !itemFieldMessage(field, row[field]));
}

// Job-level (single-value) fields — currently just the description. Add a
// new required job field here, not back at either call site.
const JOB_REQUIRED_MESSAGE = {
  description: 'Job description is required'
};

export function jobFieldMessage(field, value) {
  const message = JOB_REQUIRED_MESSAGE[field];
  if (!message) return null;
  return String(value ?? '').trim() ? null : message;
}
