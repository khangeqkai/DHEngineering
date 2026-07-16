import toast from 'react-hot-toast';
import { api } from '../../services/api';

// Resolve the customer link for a job being saved. Customers are chosen once, at
// creation, so this only does work for a brand-new job by an admin: if the company
// was hand-edited into a new one, offer to save it as a new contact; if none is
// selected but a company was typed, create it. Returns the contact id to link (which
// may be the originally selected one, a freshly created one, or empty).
export async function resolveJobContactId({ initialContactId, isAdmin, isEdit, contactHook, showConfirm }) {
  let contactId = initialContactId;

  if (!isAdmin || isEdit) return contactId;

  const createFromForm = async () => {
    const c = await api.createContact({
      contactName: contactHook.contactFormData.contactName.trim() || null,
      companyName: contactHook.contactFormData.companyName.trim(),
      phone: contactHook.contactFormData.phone || null,
      email: contactHook.contactFormData.email || null
    });
    return c.id;
  };

  // The user edited a selected contact's company into a different one — offer to save
  // it as a new contact rather than silently repurposing the old link.
  if (contactHook.hasCompanyNameChanged()) {
    const saveNew = await showConfirm({
      title: 'Save New Contact',
      message: `Save "${contactHook.contactFormData.companyName}" as a new contact?`,
      confirmLabel: 'Save',
      cancelLabel: 'No',
      confirmVariant: 'primary'
    });
    if (saveNew) {
      contactId = await createFromForm();
      toast.success('New contact saved');
    }
  }

  // Nothing selected but a company was typed — create it.
  if (!contactId && contactHook.contactFormData.companyName.trim()) {
    contactId = await createFromForm();
  }

  return contactId;
}
