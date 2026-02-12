import { useState, useEffect } from 'react';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';

export default function SupplierManagement() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    address: '',
    services: '',
    approved: true,
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  // Load suppliers on mount
  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await api.getSuppliers();
      setSuppliers(data);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
      alert(err.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  // Filter suppliers based on showInactive toggle
  const filteredSuppliers = showInactive
    ? suppliers
    : suppliers.filter(s => s.active === 1 || s.active === true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, formData);
      } else {
        await api.createSupplier(formData);
      }
      await loadSuppliers();
      resetForm();
    } catch (err) {
      console.error('Failed to save supplier:', err);
      alert(err.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      contact_name: supplier.contact_name || '',
      contact_phone: supplier.contact_phone || '',
      contact_email: supplier.contact_email || '',
      address: supplier.address || '',
      services: supplier.services || '',
      approved: supplier.approved || false,
      notes: supplier.notes || ''
    });
    setShowForm(true);
  };

  const handleDeactivate = async (supplier) => {
    if (!confirm(`Are you sure you want to deactivate "${supplier.name}"?`)) return;

    try {
      await api.deactivateSupplier(supplier.id);
      await loadSuppliers();
    } catch (err) {
      console.error('Failed to deactivate supplier:', err);
      alert(err.message || 'Failed to deactivate supplier');
    }
  };

  const handleActivate = async (supplier) => {
    try {
      await api.activateSupplier(supplier.id);
      await loadSuppliers();
    } catch (err) {
      console.error('Failed to activate supplier:', err);
      alert(err.message || 'Failed to activate supplier');
    }
  };

  const handleDelete = async (supplier) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${supplier.name}"? This cannot be undone.`)) return;

    try {
      await api.deleteSupplier(supplier.id);
      await loadSuppliers();
    } catch (err) {
      console.error('Failed to delete supplier:', err);
      alert(err.message || 'Failed to delete supplier');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingSupplier(null);
    setFormData({
      name: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      address: '',
      services: '',
      approved: true,
      notes: ''
    });
  };

  if (loading) {
    return <div className="loading">Loading suppliers...</div>;
  }

  return (
    <div className="supplier-management">
      <PageHeader title="Approved Suppliers">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Add Supplier
        </button>
      </PageHeader>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2>{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h2>
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

              <div className="form-group">
                <label htmlFor="services">Services Provided</label>
                <textarea
                  id="services"
                  value={formData.services}
                  onChange={(e) => setFormData({ ...formData, services: e.target.value })}
                  rows={2}
                  placeholder="e.g., Heat treatment, Anodizing, Plating, Surface coating..."
                />
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.approved}
                    onChange={(e) => setFormData({ ...formData, approved: e.target.checked })}
                  />
                  Approved Supplier
                  <span className="help-text">Only approved suppliers can be used for subcontracts</span>
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
                {saving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Create Supplier'}
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
                <th>Services</th>
                <th>Approved</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No suppliers found
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} style={{ opacity: supplier.active ? 1 : 0.6 }}>
                    <td>
                      <strong>{supplier.name}</strong>
                    </td>
                    <td>{supplier.contact_name || '-'}</td>
                    <td>{supplier.contact_phone || '-'}</td>
                    <td className="services-cell">
                      {supplier.services ? (
                        <span className="services-text">{supplier.services}</span>
                      ) : '-'}
                    </td>
                    <td>
                      {supplier.approved ? (
                        <span className="badge badge-completed">Approved</span>
                      ) : (
                        <span className="badge badge-pending">Pending</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${supplier.active ? 'badge-completed' : 'badge-cancelled'}`}>
                        {supplier.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEdit(supplier)}
                        >
                          Edit
                        </button>
                        {supplier.active ? (
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() => handleDeactivate(supplier)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleActivate(supplier)}
                          >
                            Activate
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(supplier)}
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

        .services-cell {
          max-width: 200px;
        }

        .services-text {
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
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
