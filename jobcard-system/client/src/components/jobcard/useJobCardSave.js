import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { validateJobCardForm } from './jobCardValidation.mjs';
import { buildJobcardPayload } from './mappers';
import { showFormErrors } from './jobCardPrompts';
import { resolveJobContactId } from './jobCardContact';
import { warningToastIcon } from '../common/toastIcons';

/**
 * The job card's Save — create only. An existing job has no Save button any more:
 * the details fields, the parts list and the people list each write themselves the
 * moment they change (useInstantSave.js, useInstantItems.js, toggleAssignee in
 * useJobCardForm.js). This hook now only ever runs for a brand-new job — validate,
 * resolve/create the customer, send the one whole-payload POST, and close.
 */
export function useJobCardSave({
  canManage,
  isEdit,
  formHook,
  contactHook,
  showConfirm,
  onSuccess,
  onClose,
  setAttachmentWarnings
}) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    // Create-only: an existing job has nothing left for this to do, and must never
    // fall through to api.createJobcard below. The form's own onKeyDown already
    // swallows a stray Enter in most fields, but a <select> can still submit
    // natively, so this guard is the one that actually matters.
    if (isEdit) return;

    // Validation
    const { errors, validItems } = validateJobCardForm({
      canManage,
      formData: formHook.formData,
      contactFormData: contactHook.contactFormData,
      lineItems: formHook.lineItems
    });

    if (errors.length > 0) {
      showFormErrors(errors);
      return;
    }

    setSaving(true);

    try {
      // Customer details are chosen once, at creation — resolve/create the contact.
      const customer = await resolveJobContactId({
        canManage, isEdit, contactHook, showConfirm
      });
      // Backed out of adding a new customer — nothing has been saved yet.
      if (!customer) { setSaving(false); return; }

      const jobcardData = buildJobcardPayload({
        formData: formHook.formData,
        contactFormData: contactHook.contactFormData,
        assignees: formHook.assignees,
        validItems,
        canManage,
        isEdit,
        companyId: customer.companyId,
        contactId: customer.contactId
      });

      const result = await api.createJobcard(jobcardData);

      onSuccess?.();
      if (result?.qaTemplateWarning) {
        toast(result.qaTemplateWarning, { icon: warningToastIcon, duration: 8000 });
      }
      setAttachmentWarnings(result?.attachmentWarnings || null);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to save job card');
    } finally {
      setSaving(false);
    }
  }, [canManage, isEdit, formHook, contactHook, showConfirm, onSuccess, onClose, setAttachmentWarnings]);

  return { saving, handleSubmit };
}
