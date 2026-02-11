import { useEffect, useState } from 'react';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    address: '',
    is_critical_qa: false,
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, [showInactive]);

  const loadCustomers = async () => {
    try {
      const data = await api.getCustomers(showInactive);
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, formData);
      } else {
        await api.createCustomer(formData);
      }
      await loadCustomers();
      resetForm();
    } catch (err) {
      console.error('Failed to save customer:', err);
      alert(err.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      contact_name: customer.contact_name || '',
      contact_phone: customer.contact_phone || '',
      contact_email: customer.contact_email || '',
      address: customer.address || '',
      is_critical_qa: customer.is_critical_qa || false,
      notes: customer.notes || ''
    });
    setShowForm(true);
  };

  const handleDeactivate = async (customer) => {
    if (!confirm(`Are you sure you want to deactivate "${customer.name}"?`)) return;

    try {
      await api.deactivateCustomer(customer.id);
      await loadCustomers();
    } catch (err) {
      console.error('Failed to deactivate customer:', err);
      alert(err.message || 'Failed to deactivate customer');
    }
  };

  const handleActivate = async (customer) => {
    try {
      await api.activateCustomer(customer.id);
      await loadCustomers();
    } catch (err) {
      console.error('Failed to activate customer:', err);
      alert(err.message || 'Failed to activate customer');
    }
  };

  const handleDelete = async (customer) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${customer.name}"? This cannot be undone.`)) return;

    try {
      await api.deleteCustomer(customer.id);
      await loadCustomers();
    } catch (err) {
      console.error('Failed to delete customer:', err);
      alert(err.message || 'Failed to delete customer');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCustomer(null);
    setFormData({
      name: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      address: '',
      is_critical_qa: false,
      notes: ''
    });
  };

  if (loading) {
    return <div className="loading">Loading customers...</div>;
  }

  return (
    <div className="customer-management">
      <PageHeader title="Customers">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Customer
        </button>
      </PageHeader>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>
              Cancel
            </button>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Company Name *</label>
                  <input
                    type="text"
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact_name">Contact Name</label>
                  <input
                    type="text"
                    id="contact_name"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="contact_phone">Phone</label>
                  <input
                    type="tel"
                    id="contact_phone"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact_email">Email</label>
                  <input
                    type="email"
                    id="contact_email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
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
                    checked={formData.is_critical_qa}
                    onChange={(e) => setFormData({ ...formData, is_critical_qa: e.target.checked })}
                  />
                  Critical QA Customer
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
                {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Create Customer'}
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
                <th>Company Name</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th>QA Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No customers found
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr key={customer.id} style={{ opacity: customer.active ? 1 : 0.6 }}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.contact_name || '-'}</td>
                    <td>{customer.contact_phone || '-'}</td>
                    <td>{customer.contact_email || '-'}</td>
                    <td>
                      {customer.is_critical_qa ? (
                        <span className="badge badge-critical">Critical QA</span>
                      ) : (
                        <span className="badge badge-standard">Standard</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${customer.active ? 'badge-completed' : 'badge-cancelled'}`}>
                        {customer.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEdit(customer)}
                        >
                          Edit
                        </button>
                        {customer.active ? (
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => handleDeactivate(customer)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleActivate(customer)}
                          >
                            Activate
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(customer)}
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
