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
