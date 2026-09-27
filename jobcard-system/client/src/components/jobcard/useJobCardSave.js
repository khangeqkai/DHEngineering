import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { validateJobCardForm } from './jobCardValidation.mjs';
import { buildJobcardPayload } from './mappers';
import { showFormErrors } from './jobCardPrompts';
import { resolveJobContactId } from './jobCardContact';
import { warningToastIcon } from '../common/toastIcons';
import { fieldErrorsFromRefusal } from '../../hooks/useFieldErrors';

// A 400's fields (validation.js's handleValidationErrors, S4) name whichever route
// actually rejected the request — POST /jobcards itself (contactName / contactPhone /
// contactEmail) or one of the contact routes resolveJobContactId calls first,
// "Update contact" / "Add as new person" (contactName / phone / email). Both land on
// the same three boxes in DetailsTab.jsx, so both spellings are normalised to the
// box's own key here rather than the caller having to know which route it was.
const CONTACT_FIELD_TO_BOX = {
  contactName: 'contactName',
  contactPhone: 'contactPhone',
  phone: 'contactPhone',
  contactEmail: 'contactEmail',
  email: 'contactEmail'
};

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
  setAttachmentWarnings,
  // Marks a contact box (JobCardModal.jsx's own useFieldErrors instance) instead of
  // a pop-up when a 400 names contactName/contactPhone/contactEmail — see
  // fieldErrorsFromRefusal in hooks/useFieldErrors.js.
  onContactFieldErrors
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
    // Captured before anything travels: if the window is closed and reopened —
    // on this same create or a different job entirely — before the reply lands,
    // formHook's sessionRef has moved on by the time it does. The list still
    // gets refreshed either way (the job really was created), but this reply is
    // no longer allowed to close, or set file warnings on, whichever job happens
    // to be open when it arrives.
    const sessionToken = formHook.sessionRef.current;

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
        contactId: customer.contactId,
        pickedPerson: contactHook.pickedPerson,
        detailChanges: contactHook.detailChanges
      });

      const result = await api.createJobcard(jobcardData);

      onSuccess?.();
      // The quality-form warning is about the job just created, not whatever is
      // on screen now, so it is shown even after the window has moved on — named
      // by job number in that case so it can't be read as about the open job.
      const moved = formHook.sessionRef.current !== sessionToken;
      if (result?.qaTemplateWarning) {
        const message = moved && result.jobNumber
          ? `Job ${result.jobNumber}: ${result.qaTemplateWarning}`
          : result.qaTemplateWarning;
        toast(message, { icon: warningToastIcon, duration: 8000 });
      }
      if (moved) return;
      setAttachmentWarnings(result?.attachmentWarnings || null);
      onClose();
    } catch (err) {
      const { marks: contactErrors, others } = fieldErrorsFromRefusal(err, CONTACT_FIELD_TO_BOX);
      if (contactErrors) {
        onContactFieldErrors?.(contactErrors);
        // Anything refused alongside the contact boxes that has no box of its own still
        // has to be said, or it would vanish behind the marked boxes.
        if (others.length > 0) toast.error(others.join('. '), { id: 'job-create-failed' });
      } else {
        toast.error(err.message || 'Failed to save job card');
      }
    } finally {
      setSaving(false);
    }
  }, [canManage, isEdit, formHook, contactHook, showConfirm, onSuccess, onClose, setAttachmentWarnings, onContactFieldErrors]);

  return { saving, handleSubmit };
}
