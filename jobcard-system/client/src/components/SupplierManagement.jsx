import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase, capitalizeFirst, autoResize } from '../utils/formatters';
import { Plus, Trash2, Save, History, Check, X } from 'lucide-react';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import { exportSuppliers } from '../utils/excelExport';
import DataTable from './common/DataTable';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import EntityActivityLog from './common/EntityActivityLog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

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
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);
  const [customTagName, setCustomTagName] = useState('');
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

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
      setActivityRefreshKey(k => k + 1);
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
    const confirmed = await showConfirm({
      title: 'Delete Supplier Permanently',
      message: `Are you sure you want to PERMANENTLY delete "${supplier.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteSupplier(supplier.id);
      toast.success('Supplier deleted');
      await loadData();
      setActivityRefreshKey(k => k + 1);
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

  const handleDeleteTag = async (tag) => {
    const confirmed = await showConfirm({
      title: 'Delete Service Tag',
      message: `Are you sure you want to delete "${tag.name}"? It will be removed from all suppliers that use it.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteServiceTag(tag.id);
      setServiceTags(prev => prev.filter(t => t.id !== tag.id));
      setFormData(prev => ({
        ...prev,
        serviceTagIds: prev.serviceTagIds.filter(id => id !== tag.id)
      }));
      toast.success('Service tag deleted');
    } catch (err) {
      toast.error(err.message || 'Failed to delete service tag');
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
    <div className="supplier-management page-scroll-layout page-enter">
      <PageHeader title="Suppliers">
        <ExportButton
          onExportView={() => suppliers.length ? exportSuppliers(suppliers) : false}
        />
        <button className="btn btn-secondary" onClick={() => setShowActivityLog(true)}>
          <History size={16} /> Activity Log
        </button>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Add Supplier
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
        size="small"
        closeOnOverlayClick={false}
      >
        <BottomSheet.Body>
          <form id="supplier-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Company Name *</label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onBlur={(e) => {
                    const formatted = toTitleCase(e.target.value);
                    if (formatted !== e.target.value) {
                      setFormData(prev => ({ ...prev, name: formatted }));
                    }
                  }}
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
                  onBlur={(e) => {
                    const formatted = toTitleCase(e.target.value);
                    if (formatted !== e.target.value) {
                      setFormData(prev => ({ ...prev, contactName: formatted }));
                    }
                  }}
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
                ref={(el) => { if (el) autoResize(el); }}
                onInput={(e) => autoResize(e.target)}
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                onBlur={(e) => {
                  const formatted = capitalizeFirst(e.target.value);
                  if (formatted !== e.target.value) {
                    setFormData(prev => ({ ...prev, address: formatted }));
                  }
                }}
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>Services Provided</label>
              <div className="service-tags-selector">
                {serviceTags.map(tag => (
                  <span key={tag.id} className={`tag-chip-wrapper ${!tag.isSystem ? 'deletable' : ''}`}>
                    <button
                      type="button"
                      className={`tag-chip ${formData.serviceTagIds.includes(tag.id) ? 'selected' : ''}`}
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      {tag.name}
                      {formData.serviceTagIds.includes(tag.id) && <span className="check-mark"><Check size={12} /></span>}
                    </button>
                    {!tag.isSystem && (
                      <button
                        type="button"
                        className="tag-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTag(tag);
                        }}
                        title={`Delete "${tag.name}" tag`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
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
                      onBlur={(e) => {
                        const formatted = toTitleCase(e.target.value);
                        if (formatted !== e.target.value) {
                          setCustomTagName(formatted);
                        }
                      }}
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
                ref={(el) => { if (el) autoResize(el); }}
                onInput={(e) => autoResize(e.target)}
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                onBlur={(e) => {
                  const formatted = capitalizeFirst(e.target.value);
                  if (formatted !== e.target.value) {
                    setFormData(prev => ({ ...prev, notes: formatted }));
                  }
                }}
                rows={2}
              />
            </div>
          </form>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button
            type="submit"
            form="supplier-form"
            className="btn btn-primary"
            disabled={saving}
          >
            <Save size={14} /> {saving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Create Supplier'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'name',
                label: 'Company Name',
                sortable: true,
                render: (val, row) => (
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(row); }}>
                    <strong>{val}</strong>
                  </a>
                )
              },
              { key: 'contactName', label: 'Contact', sortable: true },
              { key: 'contactPhone', label: 'Phone' },
              {
                key: 'serviceTags',
                label: 'Services',
                render: (val) => (
                  val && val.length > 0 ? (
                    <div className="service-tags-display">
                      {val.map(tag => (
                        <span key={tag.id} className="service-tag-badge">{tag.name}</span>
                      ))}
                    </div>
                  ) : '-'
                )
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (_, row) => (
                  <div className="action-buttons">
                    <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )
              }
            ]}
            data={suppliers}
            searchable
            searchKeys={['name', 'contactName', 'contactPhone']}
            searchPlaceholder="Search suppliers..."
            emptyMessage="No suppliers found"
            defaultSortKey="name"
          />
        </div>
      </div>

      <EntityActivityLog
        entityType="supplier"
        isOpen={showActivityLog}
        onClose={() => setShowActivityLog(false)}
        refreshKey={activityRefreshKey}
      />

      <style>{`
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
          background: var(--surface-inset);
        }

        .tag-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 16px;
          background: var(--surface);
          color: var(--text-primary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .tag-chip:hover {
          border-color: var(--primary-color);
        }

        .tag-chip.selected {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: var(--text-inverse);
        }

        .tag-chip .check-mark {
          font-size: 0.75rem;
          margin-left: 0.25rem;
        }

        .tag-chip-wrapper {
          position: relative;
          display: inline-flex;
        }

        .tag-chip-wrapper .tag-chip {
          border-radius: 16px;
        }

        .tag-chip-wrapper.deletable .tag-chip {
          padding-right: 0.75rem;
        }

        .tag-delete-btn {
          display: none;
          position: absolute;
          top: -6px;
          right: -6px;
          width: 18px;
          height: 18px;
          padding: 0;
          border: 1px solid var(--border-color);
          border-radius: 50%;
          background: var(--surface);
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          align-items: center;
          justify-content: center;
          z-index: 1;
        }

        .tag-delete-btn:hover {
          background: var(--danger-color);
          border-color: var(--danger-color);
          color: var(--text-inverse);
        }

        .tag-chip-wrapper.deletable:hover .tag-delete-btn {
          display: inline-flex;
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
          font-size: var(--text-sm);
        }

        .service-tags-display {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem;
        }

        .service-tag-badge {
          display: inline-block;
          padding: 0.15rem 0.5rem;
          background: var(--surface-inset);
          color: var(--text-secondary);
          border-radius: 12px;
          font-size: var(--text-sm);
          font-weight: 500;
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
