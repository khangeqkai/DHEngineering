// Job card form validation for JobCardModal
// Pure function: takes form state, returns the list of error messages plus the
// filtered valid line items (reused by the caller when building the payload).

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
  if (!formData.description?.trim()) {
    errors.push('Job description is required');
  }

  // Blanking the description on an already-saved line (stable "item:" id) used to
  // silently drop the line from the save payload — the server then deleted the part
  // and its files fell back to whole-job. Block the save instead. A blank description
  // on a fresh, unsaved row still just drops the row (the filter below).
  const blankSavedIdx = lineItems.findIndex(
    item => isSavedLineItem(item) && !item.description.trim()
  );
  if (blankSavedIdx !== -1) {
    const blank = lineItems[blankSavedIdx];
    errors.push(`Description is required on item #${blank.itemNumber || blankSavedIdx + 1}`);
  }

  const validItems = lineItems.filter(item => item.description.trim());
  if (validItems.length === 0) {
    errors.push('Add at least one line item');
  }

  // Per-item errors name the row's real itemNumber (the badge ItemsTab shows);
  // positions in the filtered list shift when a blanked line is dropped, so
  // index-based numbering can point at the wrong row.
  const itemNo = (i) => validItems[i].itemNumber || i + 1;

  const itemMissingJobType = validItems.findIndex(item => !item.jobType);
  if (itemMissingJobType !== -1) {
    errors.push(`Job type is required on item #${itemNo(itemMissingJobType)}`);
  }

  const itemMissingDrawings = validItems.findIndex(item => !item.drawingsType);
  if (itemMissingDrawings !== -1) {
    errors.push(`Drawings is required on item #${itemNo(itemMissingDrawings)}`);
  }

  const itemMissingProperty = validItems.findIndex(item => !item.customerProperty);
  if (itemMissingProperty !== -1) {
    errors.push(`Customer property is required on item #${itemNo(itemMissingProperty)}`);
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
      errors.push(`Item #${itemNo(i)} cannot combine "N/A" with other drawings values`);
    }
    if (naCombined(validItems[i].customerProperty)) {
      errors.push(`Item #${itemNo(i)} cannot combine "N/A" with other customer property values`);
    }
  }

  // Quantity is compulsory and must be a positive whole number (it drives the
  // "all parts finished -> Done" check). Blanks, zero, and decimals are rejected.
  for (let i = 0; i < validItems.length; i++) {
    const qty = String(validItems[i].qty ?? '').trim();
    if (!qty) {
      errors.push(`Quantity is required on item #${itemNo(i)}`);
    } else if (!/^\d+$/.test(qty) || parseInt(qty, 10) < 1) {
      errors.push(`Quantity on item #${itemNo(i)} must be a whole number of 1 or more`);
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
        errors.push(`Item #${itemNo(i)}: pick a treatment for the chosen supplier`);
      }
    }
  }

  return { errors, validItems };
}
