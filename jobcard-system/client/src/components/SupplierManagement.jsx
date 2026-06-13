import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase, capitalizeFirst, autoResize } from '../utils/formatters';
import { Plus, Archive, ArchiveRestore, Save, History, Check, X } from 'lucide-react';
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
  const [pendingId, setPendingId] = useState(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showCustomTagInput, setShowCustomTagInput] = useState(false);
  const [customTagName, setCustomTagName] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [suppliersData, tagsData] = await Promise.all([
        api.getSuppliers(showInactive),
        api.getTags('treatment')
      ]);
      setSuppliers(suppliersData);
      setServiceTags(tagsData);
    } catch (err) {
      toast.error(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh just the service options. Called when opening the supplier form so a
  // treatment that was archived/restored elsewhere shows up without a page reload.
  const loadServiceTags = useCallback(async () => {
    try {
      const tagsData = await api.getTags('treatment');
      setServiceTags(tagsData);
    } catch (err) {
      // Non-fatal: keep whatever list we already have.
    }
  }, []);

  const openAddForm = useCallback(() => {
    loadServiceTags();
    setShowForm(true);
  }, [loadServiceTags]);

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
      toast.error(err.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (supplier) => {
    loadServiceTags();
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

  const handleArchive = async (supplier) => {
    if (pendingId !== null) return;
    const confirmed = await showConfirm({
      title: 'Archive Supplier',
      message: `Archive "${supplier.name}"? It will no longer appear when picking a supplier for a job, but jobs that already use it keep their record. You can restore it any time.`,
      confirmLabel: 'Archive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    setPendingId(supplier.id);
    try {
      await api.deactivateSupplier(supplier.id);
      toast.success('Supplier archived');
      await loadData();
      setActivityRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to archive supplier');
    } finally {
      setPendingId(null);
    }
  };

  const handleRestore = async (supplier) => {
    if (pendingId !== null) return;
    setPendingId(supplier.id);
    try {
      await api.activateSupplier(supplier.id);
      toast.success('Supplier restored');
      await loadData();
      setActivityRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to restore supplier');
    } finally {
      setPendingId(null);
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
      const newTag = await api.createTag({ category: 'treatment', name: customTagName.trim() });
      setServiceTags(prev => [...prev, newTag]);
      setFormData(prev => ({
        ...prev,
        serviceTagIds: [...prev.serviceTagIds, newTag.id]
      }));
      setCustomTagName('');
      setShowCustomTagInput(false);
      toast.success('Service tag created');
    } catch (err) {
      toast.error(err.message || 'Failed to create tag');
    }
  };

  const handleArchiveTag = async (tag) => {
    const confirmed = await showConfirm({
      title: 'Archive Service',
      message: `Archive "${tag.name}"? It will no longer appear when choosing services for suppliers, but suppliers that already have it keep it. You can restore it from the Tags & Equipment page.`,
      confirmLabel: 'Archive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    try {
      await api.archiveTag(tag.id);
      setServiceTags(prev => prev.filter(t => t.id !== tag.id));
      setFormData(prev => ({
        ...prev,
        serviceTagIds: prev.serviceTagIds.filter(id => id !== tag.id)
      }));
      toast.success('Service archived');
    } catch (err) {
      toast.error(err.message || 'Failed to archive service');
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

  // Services already on the supplier being edited whose tag has since been archived:
  // held (in serviceTagIds) but absent from the active picker list above.
  const activeTagIds = new Set(serviceTags.map(t => t.id));
  const retiredHeldTags = (editingSupplier?.serviceTags || [])
    .filter(t => formData.serviceTagIds.includes(t.id) && !activeTagIds.has(t.id));

  return (
    <div className="supplier-management page-suppliers page-scroll-layout page-enter">
      <PageHeader title="Suppliers">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show archived
        </label>
        <ExportButton
          onExportView={() => suppliers.length ? exportSuppliers(suppliers) : false}
        />
        <button className="btn btn-secondary" onClick={() => setShowActivityLog(true)}>
          <History size={16} /> Activity Log
        </button>
        <button className="btn btn-primary" onClick={openAddForm}>
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
                  <span key={tag.id} className="tag-chip-wrapper deletable">
                    <button
                      type="button"
                      className={`tag-chip ${formData.serviceTagIds.includes(tag.id) ? 'selected' : ''}`}
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      {tag.name}
                      {formData.serviceTagIds.includes(tag.id) && <span className="check-mark"><Check size={12} /></span>}
                    </button>
                    <button
                      type="button"
                      className="tag-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchiveTag(tag);
                      }}
                      title={`Archive "${tag.name}"`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {/* Services this supplier already holds whose tag was since archived
                    aren't in the active list above. Show them as "(retired)" chips so
                    they stay visible and can be unticked — they just can't be re-added. */}
                {retiredHeldTags.map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    className="tag-chip selected retired-option"
                    onClick={() => handleTagToggle(tag.id)}
                  >
                    {tag.name} (retired)
                    <span className="check-mark"><Check size={12} /></span>
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
                key: 'active',
                label: 'Status',
                sortable: true,
                render: (val) => (
                  <span className={`badge ${val ? 'badge-completed' : 'badge-cancelled'}`}>
                    {val ? 'Active' : 'Archived'}
                  </span>
                )
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (_, row) => (
                  <div className="action-buttons">
                    {row.active ? (
                      <button className="btn btn-warning btn-sm" disabled={pendingId === row.id} onClick={(e) => { e.stopPropagation(); handleArchive(row); }}>
                        <Archive size={14} /> {pendingId === row.id ? 'Archiving…' : 'Archive'}
                      </button>
                    ) : (
                      <button className="btn btn-success btn-sm" disabled={pendingId === row.id} onClick={(e) => { e.stopPropagation(); handleRestore(row); }}>
                        <ArchiveRestore size={14} /> {pendingId === row.id ? 'Restoring…' : 'Restore'}
                      </button>
                    )}
                  </div>
                )
              }
            ]}
            data={suppliers}
            loading={loading}
            rowClassName={(row) => row.active ? '' : 'inactive-row'}
            searchable
            searchKeys={['name', 'contactName', 'contactPhone']}
            searchPlaceholder="Search suppliers..."
            emptyState={{
              icon: 'suppliers',
              title: 'No suppliers yet',
              description: 'Add your first supplier to get started.',
              actionLabel: 'Add Supplier',
              onAction: openAddForm,
            }}
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
        .show-inactive-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
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
