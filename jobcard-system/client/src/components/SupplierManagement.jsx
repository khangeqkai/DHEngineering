import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';

export default function SupplierManagement() {
  const [suppliers, setSuppliers] = useState([]);
  const [serviceTags, setServiceTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    address: '',
    notes: '',
    serviceTagIds: []
  });
  const [saving, setSaving] = useState(false);
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);
  const [customTagName, setCustomTagName] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [suppliersData, tagsData] = await Promise.all([
        api.getSuppliers(),
        api.getServiceTags()
      ]);
      setSuppliers(suppliersData);
      setServiceTags(tagsData);
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, formData);
        toast.success('Supplier updated');
      } else {
        await api.createSupplier(formData);
        toast.success('Supplier created');
      }
      await loadData();
      resetForm();
    } catch (err) {
      console.error('Failed to save supplier:', err);
      toast.error(err.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      contactName: supplier.contactName || '',
      contactPhone: supplier.contactPhone || '',
      contactEmail: supplier.contactEmail || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
      serviceTagIds: (supplier.serviceTags || []).map(t => t.id)
    });
    setShowForm(true);
  };

  const handleDelete = async (supplier) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete "${supplier.name}"? This cannot be undone.`)) return;

    try {
      await api.deleteSupplier(supplier.id);
      toast.success('Supplier deleted');
      await loadData();
    } catch (err) {
      console.error('Failed to delete supplier:', err);
      toast.error(err.message || 'Failed to delete supplier');
    }
  };

  const handleTagToggle = (tagId) => {
    setFormData(prev => ({
      ...prev,
      serviceTagIds: prev.serviceTagIds.includes(tagId)
        ? prev.serviceTagIds.filter(id => id !== tagId)
        : [...prev.serviceTagIds, tagId]
    }));
  };

  const handleAddCustomTag = async () => {
    if (!customTagName.trim()) return;

    try {
      const newTag = await api.createServiceTag(customTagName.trim());
      setServiceTags(prev => [...prev, newTag]);
      setFormData(prev => ({
        ...prev,
        serviceTagIds: [...prev.serviceTagIds, newTag.id]
      }));
      setCustomTagName('');
      setShowCustomTagInput(false);
      toast.success('Service tag created');
    } catch (err) {
      console.error('Failed to create tag:', err);
      toast.error(err.message || 'Failed to create tag');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingSupplier(null);
    setFormData({
      name: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      address: '',
      notes: '',
      serviceTagIds: []
    });
    setShowCustomTagInput(false);
    setCustomTagName('');
  };

  if (loading) {
    return <div className="loading">Loading suppliers...</div>;
  }

  return (
    <div className="supplier-management">
      <PageHeader title="Suppliers">
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
                  <label htmlFor="contactName">Contact Name</label>
                  <input
                    type="text"
                    id="contactName"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="contactPhone">Phone</label>
                  <input
                    type="tel"
                    id="contactPhone"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contactEmail">Email</label>
                  <input
                    type="email"
                    id="contactEmail"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
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
                <label>Services Provided</label>
                <div className="service-tags-selector">
                  {serviceTags.map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`tag-chip ${formData.serviceTagIds.includes(tag.id) ? 'selected' : ''}`}
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      {tag.name}
                      {formData.serviceTagIds.includes(tag.id) && <span className="check-mark">&#10003;</span>}
                    </button>
                  ))}
                  {!showCustomTagInput ? (
                    <button
                      type="button"
                      className="tag-chip add-custom"
                      onClick={() => setShowCustomTagInput(true)}
                    >
                      + Other
                    </button>
                  ) : (
                    <div className="custom-tag-input">
                      <input
                        type="text"
                        value={customTagName}
                        onChange={(e) => setCustomTagName(e.target.value)}
                        placeholder="New service name..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomTag();
                          } else if (e.key === 'Escape') {
                            setShowCustomTagInput(false);
                            setCustomTagName('');
                          }
                        }}
                        autoFocus
                      />
                      <button type="button" className="btn btn-sm btn-primary" onClick={handleAddCustomTag}>
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() => {
                          setShowCustomTagInput(false);
                          setCustomTagName('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No suppliers found
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <strong>{supplier.name}</strong>
                    </td>
                    <td>{supplier.contactName || '-'}</td>
                    <td>{supplier.contactPhone || '-'}</td>
                    <td className="services-cell">
                      {supplier.serviceTags && supplier.serviceTags.length > 0 ? (
                        <div className="service-tags-display">
                          {supplier.serviceTags.map(tag => (
                            <span key={tag.id} className="service-tag-badge">{tag.name}</span>
                          ))}
                        </div>
                      ) : '-'}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleEdit(supplier)}
                        >
                          Edit
                        </button>
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

        .services-cell {
          max-width: 300px;
        }

        .service-tags-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          padding: 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--bg-secondary);
        }

        .tag-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 16px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .tag-chip:hover {
          border-color: var(--primary-color);
        }

        .tag-chip.selected {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: white;
        }

        .tag-chip .check-mark {
          font-size: 0.75rem;
          margin-left: 0.25rem;
        }

        .tag-chip.add-custom {
          border-style: dashed;
          color: var(--text-secondary);
        }

        .tag-chip.add-custom:hover {
          color: var(--primary-color);
        }

        .custom-tag-input {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          width: 100%;
        }

        .custom-tag-input input {
          flex: 1;
          min-width: 150px;
          padding: 0.375rem 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .service-tags-display {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }

        .service-tag-badge {
          display: inline-block;
          padding: 0.125rem 0.5rem;
          background: var(--primary-color);
          color: white;
          border-radius: 12px;
          font-size: 0.75rem;
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
