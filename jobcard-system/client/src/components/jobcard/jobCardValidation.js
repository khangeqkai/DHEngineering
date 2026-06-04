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

  // Each treatment must have a value and supplier
  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const treatments = Array.isArray(item.treatments) ? item.treatments : [];
    for (let t = 0; t < treatments.length; t++) {
      const tr = treatments[t];
      if (!tr.value) {
        errors.push(`Item #${i + 1} treatment ${t + 1} is missing a treatment`);
      }
      if (tr.value === 'OTHER' && !(tr.otherText || '').trim()) {
        errors.push(`Item #${i + 1} treatment ${t + 1} (Other) needs text`);
      }
      if (!tr.supplierId) {
        errors.push(`Item #${i + 1} treatment ${t + 1} is missing a supplier`);
      }
    }
  }

  if (!formData.customerProperty || formData.customerProperty === 'NONE') {
    errors.push('Customer Property is required');
  }
  if (!formData.drawingsType || formData.drawingsType === 'NONE') {
    errors.push('Drawings type is required');
  }

  return { errors, validItems };
}
