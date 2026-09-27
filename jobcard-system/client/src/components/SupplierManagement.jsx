import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { tagActions } from '../hooks/useTags';
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
import { useManagedListPage } from '../hooks/useManagedListPage';
import './SupplierManagement.css';

export default function SupplierManagement() {
  const [suppliers, setSuppliers] = useState([]);
  const [serviceTags, setServiceTags] = useState([]);
  const {
    loading,
    showArchived: showInactive, setShowArchived: setShowInactive,
    pendingId, runPending,
    activityRefreshKey, bumpActivity,
    showActivityLog, setShowActivityLog,
    runLoad
  } = useManagedListPage();
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
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();
  // What the table is actually showing right now (after its own search box has
  // filtered it) — kept separate so "Export Current View" sends exactly those
  // rows instead of silently exporting every supplier.
  const [visibleSuppliers, setVisibleSuppliers] = useState([]);
  // Names for tags archived during this session, keyed by id — a tag disappears
  // from `serviceTags` the moment it's archived, so this is what lets a "(retired)"
  // chip still show its name afterwards, for any supplier that holds it.
  const [retiredTagsCache, setRetiredTagsCache] = useState({});

  const loadData = useCallback(async () => {
    await runLoad(
      async () => {
        const [suppliersData, tagsData] = await Promise.all([
          api.getSuppliers(showInactive),
          api.getTags('treatment')
        ]);
        setSuppliers(suppliersData);
        setServiceTags(tagsData);
      },
      (err) => toast.error(err.message || 'Failed to load data')
    );
  }, [showInactive, runLoad]);

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

    // Each name box only tidies itself on blur — Enter from inside the box submits
    // without that blur, so the same tidy-up is applied here before anything goes out.
    const { serviceTagIds, ...fields } = formData;
    const tidied = {
      ...fields,
      name: toTitleCase(fields.name),
      contactName: toTitleCase(fields.contactName)
    };

    try {
      if (editingSupplier) {
        // Send only the services ticked on or off since the form opened, never the
        // whole list — a service linked meanwhile from a job screen is left alone.
        const openedIds = (editingSupplier.serviceTags || []).map(t => t.id);
        await api.updateSupplier(editingSupplier.id, {
          ...tidied,
          addServiceTagIds: serviceTagIds.filter(id => !openedIds.includes(id)),
          removeServiceTagIds: openedIds.filter(id => !serviceTagIds.includes(id))
        });
        toast.success('Supplier updated');
      } else {
        await api.createSupplier({ ...tidied, serviceTagIds });
        toast.success('Supplier created');
      }
      await loadData();
      bumpActivity();
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (listed) => {
    loadServiceTags();
    // Open from a fresh copy: the list may be older than a service linked since from
    // a job screen, and the form's ticks are judged against what it opened with.
    let supplier = listed;
    try {
      supplier = await api.getSupplier(listed.id);
    } catch (err) {
      // Non-fatal: the save only sends the person's own ticks, so the listed copy
      // can't undo anything linked meanwhile.
    }
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

    await runPending(supplier.id, async () => {
      try {
        await api.deactivateSupplier(supplier.id);
        toast.success('Supplier archived');
        await loadData();
        bumpActivity();
      } catch (err) {
        toast.error(err.message || 'Failed to archive supplier');
      }
    });
  };

  const handleRestore = async (supplier) => {
    if (pendingId !== null) return;
    await runPending(supplier.id, async () => {
      try {
        await api.activateSupplier(supplier.id);
        toast.success('Supplier restored');
        await loadData();
        bumpActivity();
      } catch (err) {
        toast.error(err.message || 'Failed to restore supplier');
      }
    });
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
    // Enter adds without leaving the box, so tidy here as the blur would have.
    const name = toTitleCase(customTagName);
    if (!name) return;

    try {
      // Creating is idempotent: a name that is already a service hands that service
      // back, so it is only added to the lists when it isn't there already.
      const newTag = await tagActions.create({ category: 'treatment', name });
      setServiceTags(prev => (prev.some(t => t.id === newTag.id) ? prev : [...prev, newTag]));
      setFormData(prev => ({
        ...prev,
        serviceTagIds: prev.serviceTagIds.includes(newTag.id) ? prev.serviceTagIds : [...prev.serviceTagIds, newTag.id]
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
      await tagActions.archive(tag);
      setServiceTags(prev => prev.filter(t => t.id !== tag.id));
      // Leave the tag ticked on the supplier being edited — retiring a service must
      // not silently drop it from what's about to be saved. It reappears below as
      // a "(retired)" chip instead of disappearing.
      setRetiredTagsCache(prev => ({ ...prev, [tag.id]: tag }));
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

  // Services already on the supplier being edited whose tag has since been archived
  // (either before this form opened, or just now from inside it): held (in
  // serviceTagIds) but absent from the active picker list above. Names come from
  // whichever source still has them — the supplier's own saved list, or the
  // session cache for one retired while this form was open.
  const activeTagIds = new Set(serviceTags.map(t => t.id));
  const retiredHeldTags = [...(editingSupplier?.serviceTags || []), ...Object.values(retiredTagsCache)]
    .filter((t, idx, arr) => arr.findIndex(x => x.id === t.id) === idx)
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
          onExportView={() => visibleSuppliers.length ? exportSuppliers(visibleSuppliers) : false}
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
                      {formData.serviceTagIds.includes(tag.id) && <span className="check-mark"><Check size={14} /></span>}
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
                      <X size={14} />
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
                    <span className="check-mark"><Check size={14} /></span>
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
                  <button type="button" className="row-link-btn" onClick={(e) => { e.stopPropagation(); handleEdit(row); }} aria-label={`Edit supplier ${val}`}>
                    <strong>{val}</strong>
                  </button>
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
            onVisibleRowsChange={setVisibleSuppliers}
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
