import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase } from '../utils/formatters';
import { Plus, Edit2, Save, Archive, ArchiveRestore } from 'lucide-react';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { invalidateTagCache } from '../hooks/useTags';
import './TagManagement.css';

const CATEGORY_INFO = {
  treatment: { label: 'Service', description: 'Service options for parts. Used on job card parts and supplier services.' },
  material: { label: 'Material', description: 'Material options for parts.' },
  customer_property: { label: 'Customer Property', description: 'Types of customer property received with a job.' },
  drawings: { label: 'Drawings', description: 'Drawing types associated with a job.' },
  job_type: { label: 'Job Type', description: 'Classification of the type of work.' },
  equipment: { label: 'Equipment', description: 'Machines and equipment used in time tracking.' }
};

const CATEGORIES = Object.keys(CATEGORY_INFO);

export default function TagManagement() {
  const [selectedCategory, setSelectedCategory] = useState('treatment');
  const isEquipment = selectedCategory === 'equipment';

  // Tag state
  const [tags, setTags] = useState([]);
  const [tagLoading, setTagLoading] = useState(true);
  const [showArchivedTags, setShowArchivedTags] = useState(false);
  const [pendingTagId, setPendingTagId] = useState(null);

  // Equipment state
  const [machines, setMachines] = useState([]);
  const [equipLoading, setEquipLoading] = useState(true);
  const [showInactiveMachines, setShowInactiveMachines] = useState(false);
  const [pendingMachineId, setPendingMachineId] = useState(null);

  // Shared form state
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', machineNumber: '' });
  const [formCategory, setFormCategory] = useState('treatment');
  const [saving, setSaving] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  const isFormEquipment = formCategory === 'equipment';

  // --- Load tags ---
  const loadTags = useCallback(async () => {
    if (isEquipment) return;
    try {
      setTagLoading(true);
      const data = await api.getTags(selectedCategory, showArchivedTags);
      setTags(data);
    } catch (err) {
      toast.error('Failed to load tags');
    } finally {
      setTagLoading(false);
    }
  }, [selectedCategory, isEquipment, showArchivedTags]);

  useEffect(() => { if (!isEquipment) loadTags(); }, [loadTags, isEquipment]);

  // --- Load machines ---
  const loadMachines = useCallback(async () => {
    try {
      setEquipLoading(true);
      const data = await api.getMachines(showInactiveMachines);
      setMachines(data);
    } catch (err) {
      toast.error('Failed to load machines');
    } finally {
      setEquipLoading(false);
    }
  }, [showInactiveMachines]);

  useEffect(() => { if (isEquipment) loadMachines(); }, [isEquipment, loadMachines]);

  // --- Form handlers ---
  const resetForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData({ name: '', machineNumber: '' });
  };

  const openAddForm = () => {
    setEditingItem(null);
    setFormData({ name: '', machineNumber: '' });
    setFormCategory(selectedCategory);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isFormEquipment) {
        if (!formData.machineNumber.trim()) return;
        if (editingItem) {
          await api.updateMachine(editingItem.id, { machineNumber: formData.machineNumber.trim(), name: formData.name.trim() });
          toast.success('Machine updated');
        } else {
          await api.createMachine({ machineNumber: formData.machineNumber.trim(), name: formData.name.trim() });
          toast.success('Machine created');
        }
        await loadMachines();
      } else {
        if (!formData.name.trim()) return;
        if (editingItem) {
          await api.updateTag(editingItem.id, { name: formData.name.trim() });
          toast.success('Tag updated');
        } else {
          // Creating is idempotent server-side: a name that already exists just
          // returns the existing option, so the wording stays true either way.
          await api.createTag({ category: formCategory, name: formData.name.trim() });
          toast.success('Tag saved');
        }
        invalidateTagCache(formCategory);
        if (formCategory === selectedCategory) await loadTags();
      }
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // --- Tag actions ---
  const handleEditTag = (tag) => {
    setEditingItem(tag);
    setFormData({ name: tag.name, machineNumber: '' });
    setFormCategory(selectedCategory);
    setShowForm(true);
  };

  const handleArchiveTag = async (tag) => {
    if (pendingTagId !== null) return;
    const confirmed = await showConfirm({
      title: 'Archive Option',
      message: `Archive "${tag.name}"? It will no longer appear in the picker for new jobs, but existing jobs keep it. You can restore it any time.`,
      confirmLabel: 'Archive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;
    setPendingTagId(tag.id);
    try { await api.archiveTag(tag.id); toast.success('Option archived'); invalidateTagCache(selectedCategory); await loadTags(); }
    catch (err) { toast.error(err.message || 'Failed to archive option'); }
    finally { setPendingTagId(null); }
  };

  const handleRestoreTag = async (tag) => {
    if (pendingTagId !== null) return;
    setPendingTagId(tag.id);
    try { await api.activateTag(tag.id); toast.success('Option restored'); invalidateTagCache(selectedCategory); await loadTags(); }
    catch (err) { toast.error(err.message || 'Failed to restore option'); }
    finally { setPendingTagId(null); }
  };

  // --- Equipment actions ---
  const handleEditMachine = (m) => {
    setEditingItem(m);
    setFormData({ name: m.name || '', machineNumber: m.machineNumber || '' });
    setFormCategory('equipment');
    setShowForm(true);
  };

  const handleArchiveMachine = async (m) => {
    if (pendingMachineId !== null) return;
    const displayName = m.name ? `${m.machineNumber} - ${m.name}` : m.machineNumber;
    const confirmed = await showConfirm({
      title: 'Archive Machine',
      message: `Archive "${displayName}"? It will no longer appear when logging time, but existing time records keep it. Its number becomes free to reuse, and you can restore it any time.`,
      confirmLabel: 'Archive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;
    setPendingMachineId(m.id);
    try { await api.archiveMachine(m.id); toast.success('Machine archived'); await loadMachines(); }
    catch (err) { toast.error(err.message || 'Failed to archive machine'); }
    finally { setPendingMachineId(null); }
  };

  const handleRestoreMachine = async (m) => {
    if (pendingMachineId !== null) return;
    setPendingMachineId(m.id);
    try { await api.activateMachine(m.id); toast.success('Machine restored'); await loadMachines(); }
    catch (err) { toast.error(err.message || 'Failed to restore machine'); }
    finally { setPendingMachineId(null); }
  };

  const formTitle = editingItem
    ? (isFormEquipment ? 'Edit Machine' : 'Edit Tag')
    : (isFormEquipment ? 'Add New Machine' : 'Add New Tag');
  const saveLabel = editingItem
    ? (isFormEquipment ? 'Update Machine' : 'Update Tag')
    : (isFormEquipment ? 'Create Machine' : 'Create Tag');

  return (
    <div className="tag-management page-scroll-layout page-enter">
      <PageHeader title="Tags &amp; Equipment">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={isEquipment ? showInactiveMachines : showArchivedTags}
            onChange={(e) => (isEquipment ? setShowInactiveMachines : setShowArchivedTags)(e.target.checked)}
          />
          Show archived
        </label>
        <button className="btn btn-primary" onClick={openAddForm}>
          <Plus size={16} /> {isEquipment ? 'Add Machine' : 'Add Tag'}
        </button>
      </PageHeader>

      {/* Unified BottomSheet — adapts fields based on category */}
      <BottomSheet isOpen={showForm} onClose={resetForm} title={formTitle} size="small">
        <BottomSheet.Body>
          <form id="tag-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="tagCategory">Category</label>
              {editingItem ? (
                <input type="text" id="tagCategory" value={CATEGORY_INFO[formCategory]?.label} readOnly className="input-disabled" />
              ) : (
                <select id="tagCategory" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_INFO[cat].label}</option>
                  ))}
                </select>
              )}
            </div>

            {isFormEquipment ? (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="machineNumber">Machine Number *</label>
                  <input type="text" id="machineNumber" value={formData.machineNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, machineNumber: e.target.value }))}
                    onBlur={(e) => { const f = e.target.value.toUpperCase().trim(); if (f !== e.target.value) setFormData(prev => ({ ...prev, machineNumber: f })); }}
                    placeholder="e.g. M1, LATHE-01..." required autoFocus />
                </div>
                <div className="form-group">
                  <label htmlFor="machineName">Name</label>
                  <input type="text" id="machineName" value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    onBlur={(e) => { const f = toTitleCase(e.target.value); if (f !== e.target.value) setFormData(prev => ({ ...prev, name: f })); }}
                    placeholder="Machine name..." />
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="tagName">Tag Name *</label>
                <input type="text" id="tagName" value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  onBlur={(e) => { const f = toTitleCase(e.target.value); if (f !== e.target.value) setFormData(prev => ({ ...prev, name: f })); }}
                  required autoFocus />
              </div>
            )}
          </form>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button type="submit" form="tag-form" className="btn btn-primary" disabled={saving}>
            <Save size={14} /> {saving ? 'Saving...' : saveLabel}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      {/* Category tabs */}
      <div className="tag-category-tabs">
        {CATEGORIES.map(cat => (
          <button key={cat} className={`tag-category-tab${selectedCategory === cat ? ' active' : ''}`} onClick={() => setSelectedCategory(cat)}>
            {CATEGORY_INFO[cat].label}
          </button>
        ))}
      </div>

      {/* Content card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>{CATEGORY_INFO[selectedCategory].label}</h2>
            <p className="tag-section-desc">{CATEGORY_INFO[selectedCategory].description}</p>
          </div>
        </div>
        <div className="card-body">
          {isEquipment ? (
            equipLoading ? (
              <div className="loading">Loading machines...</div>
            ) : machines.length === 0 ? (
              <p className="tag-empty-text">No machines yet. Click "Add Machine" to create one.</p>
            ) : (
              <div className="tag-chips-grid">
                {machines.map(m => (
                  <div key={m.id} className={`tag-chip-card${m.active ? '' : ' archived'}`}>
                    <span className="tag-chip-name">
                      {m.machineNumber}{m.name ? ` - ${m.name}` : ''}
                      {!m.active && <span className="tag-archived-badge">Archived</span>}
                    </span>
                    <div className="tag-chip-actions">
                      {m.active ? (
                        <>
                          <button className="tag-action-btn" onClick={() => handleEditMachine(m)} title="Edit"><Edit2 size={14} /></button>
                          <button className="tag-action-btn danger" disabled={pendingMachineId === m.id} onClick={() => handleArchiveMachine(m)} title="Archive"><Archive size={14} /></button>
                        </>
                      ) : (
                        <button className="tag-action-btn restore" disabled={pendingMachineId === m.id} onClick={() => handleRestoreMachine(m)} title="Restore"><ArchiveRestore size={14} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            tagLoading ? (
              <div className="loading">Loading tags...</div>
            ) : tags.length === 0 ? (
              <p className="tag-empty-text">No tags in this category yet. Click "Add Tag" to create one.</p>
            ) : (
              <div className="tag-chips-grid">
                {tags.map(tag => (
                  <div key={tag.id} className={`tag-chip-card${tag.archived ? ' archived' : ''}`}>
                    <span className="tag-chip-name">
                      {tag.name}
                      {tag.archived && <span className="tag-archived-badge">Archived</span>}
                    </span>
                    <div className="tag-chip-actions">
                      {tag.archived ? (
                        <button className="tag-action-btn restore" disabled={pendingTagId === tag.id} onClick={() => handleRestoreTag(tag)} title="Restore"><ArchiveRestore size={14} /></button>
                      ) : (
                        <>
                          <button className="tag-action-btn" onClick={() => handleEditTag(tag)} title="Edit"><Edit2 size={14} /></button>
                          <button className="tag-action-btn danger" disabled={pendingTagId === tag.id} onClick={() => handleArchiveTag(tag)} title="Archive"><Archive size={14} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <ConfirmDialog isOpen={dialogState.isOpen} title={dialogState.title} message={dialogState.message} confirmLabel={dialogState.confirmLabel} cancelLabel={dialogState.cancelLabel} confirmVariant={dialogState.confirmVariant} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}
