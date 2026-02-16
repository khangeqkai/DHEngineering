import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function ContactManagement() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formData, setFormData] = useState({
    contactName: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  // Load contacts on mount
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await api.getContacts();
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingContact) {
        await api.updateContact(editingContact.id, formData);
      } else {
        await api.createContact(formData);
      }
      await loadContacts();
      resetForm();
    } catch (err) {
      console.error('Failed to save contact:', err);
      toast.error(err.message || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setFormData({
      contactName: contact.contactName || '',
      companyName: contact.companyName || '',
      phone: contact.phone || '',
      email: contact.email || '',
      address: contact.address || '',
      notes: contact.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (contact) => {
    const displayName = contact.companyName
      ? `${contact.contactName} (${contact.companyName})`
      : contact.contactName;
    const confirmed = await showConfirm({
      title: 'Delete Contact',
      message: `Are you sure you want to delete "${displayName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteContact(contact.id);
      await loadContacts();
    } catch (err) {
      console.error('Failed to delete contact:', err);
      toast.error(err.message || 'Failed to delete contact');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingContact(null);
    setFormData({
      contactName: '',
      companyName: '',
      phone: '',
      email: '',
      address: '',
      notes: ''
    });
  };

  if (loading) {
    return <div className="loading">Loading contacts...</div>;
  }

  return (
    <div className="contact-management page-scroll-layout">
      <PageHeader title="Contacts">
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Contact
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingContact ? 'Edit Contact' : 'Add New Contact'}
        size="small"
        closeOnOverlayClick={false}
      >
        <BottomSheet.Body>
          <form id="contact-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="contactName">Contact Name *</label>
                <input
                  type="text"
                  id="contactName"
                  value={formData.contactName}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="Person's name..."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="companyName">Company</label>
                <input
                  type="text"
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="Company name..."
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  type="tel"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="address">Address</label>
              <textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
              />
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>
          </form>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
          <button
            type="submit"
            form="contact-form"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : editingContact ? 'Update Contact' : 'Create Contact'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No contacts found
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <strong>{contact.contactName}</strong>
                    </td>
                    <td>{contact.companyName || '-'}</td>
                    <td>{contact.phone || '-'}</td>
                    <td>{contact.email || '-'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEdit(contact)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(contact)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
