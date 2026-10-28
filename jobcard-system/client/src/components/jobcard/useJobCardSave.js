import { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { validateJobCardForm } from './jobCardValidation.mjs';
import { buildJobcardPayload } from './mappers';
import { showFormErrors } from './jobCardPrompts';
import { resolveJobContactId } from './jobCardContact';
import { fieldErrorsFromRefusal } from '../../hooks/useFieldErrors';

// A 400's fields (validation.js's handleValidationErrors, S4) name whichever route
// actually rejected the request — POST /jobcards itself (contactName / contactPhone /
// contactEmail) or one of the contact routes resolveJobContactId calls first,
// "Update contact" / "Add as new contact" (contactName / phone / email). Both land on
// the same three boxes in DetailsTab.jsx, so both spellings are normalised to the
// box's own key here rather than the caller having to know which route it was.
// `name` is the new-customer step's (POST /companies): an archived customer's name,
// a name taken meanwhile, or one over the length cap — it lands on the Company box.
const CONTACT_FIELD_TO_BOX = {
  name: 'companyName',
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
 * resolve/create the customer, send the one whole-payload POST, then hand the new
 * job to onCreated, which reopens the window as that job (so its files can be
 * attached straight away). Without onCreated the window simply closes.
 */
export function useJobCardSave({
  canManage,
  isEdit,
  formHook,
  contactHook,
  showConfirm,
  onSuccess,
  onClose,
  // Given the created job's id; the caller opens the window on it.
  onCreated,
  setAttachmentWarnings,
  // Whether the job window is still up — see useStillMounted.js.
  isWindowUp,
  // Marks a contact box (JobCardModal.jsx's own useFieldErrors instance) instead of
  // a pop-up when a 400 names contactName/contactPhone/contactEmail — see
  // fieldErrorsFromRefusal in hooks/useFieldErrors.js.
  onContactFieldErrors,
  // Marks the boxes Create's own check found at fault (see validateJobCardForm) —
  // the customer, the description and each part's boxes — and scrolls to the first.
  onFormMarks
}) {
  const [saving, setSaving] = useState(false);
  // The greyed-out Create button stops a second click, but not a second Ctrl+Enter
  // (the form's requestSubmit ignores the button's state) — and `saving` is still
  // false in a press that lands before the next draw. This ref is the one guard
  // that sees the first create while it is still running. A create that succeeds never
  // lowers it: the window then either closes or reopens as the new job, and every opening
  // is a fresh window (JobCardModal.jsx), so a held-down Ctrl+Enter landing in between
  // can't create a second one. Only a failed or backed-out create lowers it again.
  const inFlight = useRef(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    // Create-only: an existing job has nothing left for this to do, and must never
    // fall through to api.createJobcard below. The form's own onKeyDown already
    // swallows a stray Enter in most fields, but a <select> can still submit
    // natively, so this guard is the one that actually matters.
    if (isEdit || inFlight.current) return;

    // Validation
    const { marks, errors, validItems } = validateJobCardForm({
      canManage,
      formData: formHook.formData,
      contactFormData: contactHook.contactFormData,
      lineItems: formHook.lineItems
    });

    const hasMarks = Object.keys(marks.job).length > 0 || Object.keys(marks.items).length > 0;
    if (hasMarks || errors.length > 0) {
      // A failure that belongs to a box marks that box; only what has no box of
      // its own (no part at all, a supplier with no treatment) is a pop-up.
      if (hasMarks) onFormMarks?.(marks);
      if (errors.length > 0) showFormErrors(errors);
      return;
    }

    inFlight.current = true;
    let created = false;
    setSaving(true);
    try {
      // Customer details are chosen once, at creation — resolve/create the contact.
      const customer = await resolveJobContactId({
        canManage, isEdit, contactHook, showConfirm
      });
      // Backed out of adding a new customer — nothing has been saved yet.
      if (!customer) return;

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
      created = true;

      onSuccess?.();
      // The list is refreshed and the number is told either way (the job really was
      // created), but if the window has closed while this was saving, closing or
      // reopening it would act on whichever job the person opened since.
      const reopen = Boolean(onCreated) && isWindowUp();
      toast.success(
        reopen
          ? `Job ${result.jobNumber} created. You can now attach its files.`
          : `Job ${result.jobNumber} created.`,
        { id: 'job-created' }
      );
      if (!isWindowUp()) return;
      if (reopen) {
        onCreated(result.id);
        return;
      }
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
        toast.error(err.message || 'Couldn\'t create the job card. What you entered is still here — check the connection and try again.', { id: 'job-create-failed' });
      }
    } finally {
      if (!created) inFlight.current = false;
      setSaving(false);
    }
  }, [canManage, isEdit, formHook, contactHook, showConfirm, onSuccess, onClose, onCreated, setAttachmentWarnings, isWindowUp, onContactFieldErrors, onFormMarks]);

  return { saving, handleSubmit };
}
