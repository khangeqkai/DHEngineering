import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { validateJobCardForm } from './jobCardValidation';
import { buildJobcardPayload } from './mappers';
import { confirmInvoiceAnyway, showFormErrors } from './jobCardPrompts';
import { resolveJobContactId } from './jobCardContact';
import { warningToastIcon } from '../common/toastIcons';

/**
 * The job card's Save: validate, resolve the customer on a new job, flush pricing
 * before invoicing, send, and handle the "files still missing" reply.
 */
export function useJobCardSave({
  canManage,
  isEdit,
  jobCardId,
  formHook,
  contactHook,
  costingHook,
  showConfirm,
  onSuccess,
  onClose,
  setAttachmentWarnings
}) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!canManage && isEdit) return;

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
    // Nothing on screen is locked while the save runs, so remember what is going out:
    // anything typed in the meantime has to keep showing as unsaved.
    const sent = formHook.captureSent();

    try {
      // Customer details are chosen once, at creation — resolve/create the contact
      // for a brand-new job. On an existing job they're frozen and read-only.
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
      // Flush any unsaved pricing edits before invoicing so they aren't lost when the job
      // is filed away. This goes through the same path the pricing screen uses, so a job
      // that has already been billed still asks "change an invoiced job?" first rather
      // than quietly restating the final total. Only a failed save aborts here — turning
      // the pricing change down puts the billed figures back and says so, and the rest of
      // this save (dates, notes, parts) has nothing to do with pricing, so it carries on.
      if (isEdit && formHook.formData.status === 'INVOICED' && costingHook.costingDirty) {
        const saved = await costingHook.flushCosting();
        if (saved === false) return; // the save already reported why it failed
      }

      // Send the save; on an edit that would invoice with files still missing,
      // the server replies 409 with the gaps instead of saving. We then ask the
      // user to confirm and resend with an explicit "invoice anyway" flag.
      const submit = (confirmMissing) => isEdit
        ? api.updateJobcard(jobCardId, confirmMissing ? { ...jobcardData, confirmMissingAttachments: true } : jobcardData)
        : api.createJobcard(jobcardData);

      let result;
      try {
        result = await submit(false);
      } catch (err) {
        if (isEdit && err.status === 409 && err.data?.attachmentWarnings) {
          const proceed = await confirmInvoiceAnyway(err.data.attachmentWarnings, showConfirm);
          if (!proceed) { setSaving(false); return; }
          result = await submit(true);
        } else {
          throw err;
        }
      }

      onSuccess?.();
      if (result?.qaTemplateWarning) {
        toast(result.qaTemplateWarning, { icon: warningToastIcon, duration: 8000 });
      }
      setAttachmentWarnings(result?.attachmentWarnings || null);
      if (isEdit) {
        // The job stays open after a save, so the parts on screen still carry the
        // temporary ids they were added with. Take the stored ids back, or work
        // logged from here on won't line up with the part it was logged against.
        // This also clears the header's unsaved-edits mark.
        formHook.markSaved(result?.items, sent);
        toast.success('Job card updated');
      } else {
        onClose();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save job card');
    } finally {
      setSaving(false);
    }
  }, [canManage, isEdit, jobCardId, formHook, contactHook, costingHook, showConfirm, onSuccess, onClose, setAttachmentWarnings]);

  return { saving, handleSubmit };
}
