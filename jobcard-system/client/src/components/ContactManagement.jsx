import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';

export default function ContactManagement() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formData, setFormData] = useState({
    contactName: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    isCriticalQa: false,
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  // Load contacts on mount
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await api.getContacts(true); // includeInactive = true
      setContacts(data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  // Filter contacts based on showInactive toggle
  const filteredContacts = showInactive
    ? contacts
    : contacts.filter(c => c.active === 1 || c.active === true);

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
      isCriticalQa: contact.isCriticalQa || false,
      notes: contact.notes || ''
    });
    setShowForm(true);
  };

  const handleDeactivate = async (contact) => {
    const displayName = contact.companyName
      ? `${contact.contactName} (${contact.companyName})`
      : contact.contactName;
    if (!confirm(`Are you sure you want to deactivate "${displayName}"?`)) return;

    try {
      await api.deactivateContact(contact.id);
      await loadContacts();
    } catch (err) {
      console.error('Failed to deactivate contact:', err);
      toast.error(err.message || 'Failed to deactivate contact');
    }
  };

  const handleActivate = async (contact) => {
    try {
      await api.activateContact(contact.id);
      await loadContacts();
    } catch (err) {
      console.error('Failed to activate contact:', err);
      toast.error(err.message || 'Failed to activate contact');
    }
  };

  const handleDelete = async (contact) => {
    const displayName = contact.companyName
      ? `${contact.contactName} (${contact.companyName})`
      : contact.contactName;
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${displayName}"? This cannot be undone.`)) return;

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
      isCriticalQa: false,
      notes: ''
    });
  };

  if (loading) {
    return <div className="loading">Loading contacts...</div>;
  }

  return (
    <div className="contact-management">
      <PageHeader title="Contacts">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Contact
        </button>
      </PageHeader>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2>{editingContact ? 'Edit Contact' : 'Add New Contact'}</h2>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>
              Cancel
            </button>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
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

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isCriticalQa}
                    onChange={(e) => setFormData({ ...formData, isCriticalQa: e.target.checked })}
                  />
                  Critical QA Contact
                  <span className="help-text">Requires enhanced documentation and QA forms</span>
                </label>
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

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingContact ? 'Update Contact' : 'Create Contact'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Email</th>
                <th>QA Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No contacts found
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
                  <tr key={contact.id} style={{ opacity: contact.active ? 1 : 0.6 }}>
                    <td>
                      <strong>{contact.contactName}</strong>
                    </td>
                    <td>{contact.companyName || '-'}</td>
                    <td>{contact.phone || '-'}</td>
                    <td>{contact.email || '-'}</td>
                    <td>
                      {contact.isCriticalQa ? (
                        <span className="badge badge-critical">Critical QA</span>
                      ) : (
                        <span className="badge badge-standard">Standard</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${contact.active ? 'badge-completed' : 'badge-cancelled'}`}>
                        {contact.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEdit(contact)}
                        >
                          Edit
                        </button>
                        {contact.active ? (
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => handleDeactivate(contact)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleActivate(contact)}
                          >
                            Activate
                          </button>
                        )}
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
        .show-inactive-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .checkbox-group label {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          cursor: pointer;
        }

        .checkbox-group input {
          margin-top: 0.25rem;
        }

        .help-text {
          display: block;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-left: 1.5rem;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .badge-critical {
          background: var(--danger-color);
          color: white;
        }

        .badge-standard {
          background: var(--text-secondary);
          color: white;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
