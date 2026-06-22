// Job card form validation for JobCardModal
// Pure function: takes form state, returns the list of error messages plus the
// filtered valid line items (reused by the caller when building the payload).

export function validateJobCardForm({ isAdmin, formData, contactFormData, lineItems }) {
  const errors = [];

  if (isAdmin && !formData.contactId && !contactFormData.companyName.trim()) {
    errors.push('Company name is required');
  }
  if (!formData.description?.trim()) {
    errors.push('Job description is required');
  }

  const validItems = lineItems.filter(item => item.description.trim());
  if (validItems.length === 0) {
    errors.push('Add at least one line item');
  }

  const itemMissingJobType = validItems.findIndex(item => !item.jobType);
  if (itemMissingJobType !== -1) {
    errors.push(`Job type is required on item #${itemMissingJobType + 1}`);
  }

  const itemMissingDrawings = validItems.findIndex(item => !item.drawingsType);
  if (itemMissingDrawings !== -1) {
    errors.push(`Drawings is required on item #${itemMissingDrawings + 1}`);
  }

  const itemMissingProperty = validItems.findIndex(item => !item.customerProperty);
  if (itemMissingProperty !== -1) {
    errors.push(`Customer property is required on item #${itemMissingProperty + 1}`);
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
      errors.push(`Item #${i + 1} cannot combine "N/A" with other drawings values`);
    }
    if (naCombined(validItems[i].customerProperty)) {
      errors.push(`Item #${i + 1} cannot combine "N/A" with other customer property values`);
    }
  }

  // Quantity is compulsory and must be a positive whole number (it drives the
  // "all parts finished -> Done" check). Blanks, zero, and decimals are rejected.
  for (let i = 0; i < validItems.length; i++) {
    const qty = String(validItems[i].qty ?? '').trim();
    if (!qty) {
      errors.push(`Quantity is required on item #${i + 1}`);
    } else if (!/^\d+$/.test(qty) || parseInt(qty, 10) < 1) {
      errors.push(`Quantity on item #${i + 1} must be a whole number of 1 or more`);
    }
  }

  // One treatment + supplier per part. Both must be set together (or both left
  // blank). A half-picked pair — supplier without a treatment, or the reverse —
  // is flagged so nothing incomplete is saved.
  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const treatments = Array.isArray(item.treatments) ? item.treatments : [];
    for (const tr of treatments) {
      if (!tr.value && !tr.supplierId) continue; // no treatment on this part — fine
      if (!tr.value) {
        errors.push(`Item #${i + 1}: pick a treatment for the chosen supplier`);
        continue;
      }
      if (tr.value === 'OTHER' && !(tr.otherText || '').trim()) {
        errors.push(`Item #${i + 1}: type the "Other" treatment name`);
      }
      if (!tr.supplierId) {
        errors.push(`Item #${i + 1}: pick a supplier for the chosen treatment`);
      }
    }
  }

  return { errors, validItems };
}
