import toast from 'react-hot-toast';
import { api } from '../../services/api';

// Read "Jane → Janey" style lines for the details-changed prompt.
const CHANGE_LABELS = { contactName: 'Name', phone: 'Phone', email: 'Email' };

function describeChanges(changes) {
  return Object.entries(changes).map(([field, { from, to }]) =>
    `${CHANGE_LABELS[field]}: ${from || '(blank)'} → ${to || '(blank)'}`
  );
}

/**
 * Settle who a job being saved is for. Customers are picked once, at creation, so
 * this only runs for a brand-new job by a manager.
 *
 * Two things can need saving alongside the job:
 *  - a company typed in that doesn't exist yet, which becomes a new customer;
 *  - changes to the picked person's name, phone or email, which are offered back
 *    to the saved record (update them, or add a second person at that company).
 *
 * Returns { companyId, contactId } to link, or null if the user backed out.
 */
export async function resolveJobContactId({ canManage, isEdit, contactHook, showConfirm }) {
  const form = contactHook.contactFormData;
  if (!canManage || isEdit) return { companyId: form.companyId, contactId: form.contactId };

  let companyId = form.companyId;
  let contactId = form.contactId;

  // A company that was typed but never picked from the list is a new customer.
  // Ask first — this creates a folder and a record that everyone else will see.
  if (!companyId) {
    const typed = form.companyName.trim();
    if (!typed) return null;

    const addIt = await showConfirm({
      title: 'New customer',
      message: `"${typed}" isn't in the customer list yet. Add it?`,
      confirmLabel: 'Add customer',
      cancelLabel: 'Go back',
      confirmVariant: 'primary'
    });
    if (!addIt) return null;

    const company = await api.createCompany({ name: typed });
    companyId = company.id;
    contactHook.registerCompany(company);
    toast.success('Customer added');
  }

  // Nobody picked, but a person's name was typed — add them at this company.
  if (!contactId && form.contactName.trim()) {
    const person = await api.createContact({
      companyId,
      contactName: form.contactName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null
    });
    contactHook.adoptPerson(person);
    return { companyId, contactId: person.id };
  }

  // A picked person's details were edited on this job. Offer the change back to
  // the saved record rather than letting the two quietly drift apart.
  const changes = contactHook.detailChanges;
  if (contactId && Object.keys(changes).length > 0) {
    const person = contactHook.pickedPerson;
    const lines = describeChanges(changes);
    const answer = await showConfirm({
      title: 'Contact details changed',
      message: (
        <span>
          You changed these details for {person.contactName || 'this contact'} at {form.companyName}:
          <br />
          {lines.map((l, i) => <span key={i}>• {l}<br /></span>)}
          <br />
          Update them, or add this as a second person at {form.companyName}?
        </span>
      ),
      confirmLabel: 'Update contact',
      altLabel: 'Add as new person',
      cancelLabel: 'Just this job',
      confirmVariant: 'primary'
    });

    if (answer === 'alt') {
      const person2 = await api.createContact({
        companyId,
        contactName: form.contactName.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null
      });
      contactHook.adoptPerson(person2);
      toast.success('New person added');
      return { companyId, contactId: person2.id };
    }

    if (answer === true) {
      const updated = await api.updateContact(contactId, {
        contactName: form.contactName.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null
      });
      contactHook.adoptPerson(updated);
      toast.success('Contact updated');
    }
    // "Just this job" keeps the typed details on the job and leaves the record be.
  }

  return { companyId, contactId };
}
