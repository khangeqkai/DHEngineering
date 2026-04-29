import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase } from '../utils/formatters';
import { Plus, Trash2, Edit2, Save } from 'lucide-react';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { invalidateTagCache } from '../hooks/useTags';

const CATEGORY_INFO = {
  treatment: { label: 'Treatment', description: 'Treatment options for line items. Used in job card items and supplier services.' },
  material: { label: 'Material', description: 'Material options for line items.' },
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

  // Equipment state
  const [machines, setMachines] = useState([]);
  const [equipLoading, setEquipLoading] = useState(true);

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
      const data = await api.getTags(selectedCategory);
      setTags(data);
    } catch (err) {
      toast.error('Failed to load tags');
    } finally {
      setTagLoading(false);
    }
  }, [selectedCategory, isEquipment]);

  useEffect(() => { if (!isEquipment) loadTags(); }, [loadTags, isEquipment]);

  // --- Load machines ---
  const loadMachines = useCallback(async () => {
    try {
      setEquipLoading(true);
      const data = await api.getMachines();
      setMachines(data);
    } catch (err) {
      toast.error('Failed to load machines');
    } finally {
      setEquipLoading(false);
    }
  }, []);

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
          await api.createTag({ category: formCategory, name: formData.name.trim() });
          toast.success('Tag created');
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

  const handleDeleteTag = async (tag) => {
    const confirmed = await showConfirm({ title: 'Delete Tag', message: `Delete "${tag.name}"? This cannot be undone.`, confirmLabel: 'Delete', confirmVariant: 'danger' });
    if (!confirmed) return;
    try { await api.deleteTag(tag.id); toast.success('Tag deleted'); invalidateTagCache(selectedCategory); await loadTags(); }
    catch (err) { toast.error(err.message || 'Failed to delete tag'); }
  };

  // --- Equipment actions ---
  const handleEditMachine = (m) => {
    setEditingItem(m);
    setFormData({ name: m.name || '', machineNumber: m.machineNumber || '' });
    setFormCategory('equipment');
    setShowForm(true);
  };

  const handleDeleteMachine = async (m) => {
    const displayName = m.name ? `${m.machineNumber} - ${m.name}` : m.machineNumber;
    const confirmed = await showConfirm({ title: 'Delete Machine', message: `Delete "${displayName}"? This cannot be undone.`, confirmLabel: 'Delete', confirmVariant: 'danger' });
    if (!confirmed) return;
    try { await api.deleteMachine(m.id); toast.success('Machine deleted'); await loadMachines(); }
    catch (err) { toast.error(err.message || 'Failed to delete machine'); }
  };

  // --- Derived ---
  const activeMachines = machines.filter(m => m.active);

  const formTitle = editingItem
    ? (isFormEquipment ? 'Edit Machine' : 'Edit Tag')
    : (isFormEquipment ? 'Add New Machine' : 'Add New Tag');
  const saveLabel = editingItem
    ? (isFormEquipment ? 'Update Machine' : 'Update Tag')
    : (isFormEquipment ? 'Create Machine' : 'Create Tag');

  return (
    <div className="tag-management page-scroll-layout page-enter">
      <PageHeader title="Tags &amp; Equipment">
        <button className="btn btn-primary" onClick={openAddForm}>
          <Plus size={16} /> {isEquipment ? 'Add Machine' : 'Add Tag'}
        </button>
      </PageHeader>

      {/* Unified BottomSheet — adapts fields based on category */}
      <BottomSheet isOpen={showForm} onClose={resetForm} title={formTitle} size="small" closeOnOverlayClick={false}>
        <BottomSheet.Body>
          <form id="tag-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Category</label>
              {editingItem ? (
                <input type="text" value={CATEGORY_INFO[formCategory]?.label} readOnly className="input-disabled" />
              ) : (
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
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
            ) : activeMachines.length === 0 ? (
              <p className="tag-empty-text">No machines yet. Click "Add Machine" to create one.</p>
            ) : (
              <div className="tag-chips-grid">
                {activeMachines.map(m => (
                  <div key={m.id} className="tag-chip-card">
                    <span className="tag-chip-name">{m.machineNumber}{m.name ? ` - ${m.name}` : ''}</span>
                    <div className="tag-chip-actions">
                      <button className="tag-action-btn" onClick={() => handleEditMachine(m)} title="Edit"><Edit2 size={13} /></button>
                      <button className="tag-action-btn danger" onClick={() => handleDeleteMachine(m)} title="Delete"><Trash2 size={13} /></button>
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
                  <div key={tag.id} className="tag-chip-card">
                    <span className="tag-chip-name">{tag.name}</span>
                    <div className="tag-chip-actions">
                      <button className="tag-action-btn" onClick={() => handleEditTag(tag)} title="Edit"><Edit2 size={13} /></button>
                      <button className="tag-action-btn danger" onClick={() => handleDeleteTag(tag)} title="Delete"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <ConfirmDialog isOpen={dialogState.isOpen} title={dialogState.title} message={dialogState.message} confirmLabel={dialogState.confirmLabel} cancelLabel={dialogState.cancelLabel} confirmVariant={dialogState.confirmVariant} onConfirm={handleConfirm} onCancel={handleCancel} />

      <style>{`
        .tag-category-tabs {
          display: flex; gap: 0.25rem; margin-bottom: var(--spacing-md);
          border-bottom: 2px solid var(--border-color); padding-bottom: 0; overflow-x: auto;
        }
        .tag-category-tab {
          padding: 0.5rem 1rem; border: none; background: transparent; color: var(--text-secondary);
          font-size: var(--text-sm); font-weight: 500; cursor: pointer;
          border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; white-space: nowrap;
        }
        .tag-category-tab:hover { color: var(--text-primary); }
        .tag-category-tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
        .tag-section-desc { margin: 0.25rem 0 0; font-size: var(--text-sm); color: var(--text-secondary); font-weight: 400; }
        .tag-empty-text { color: var(--text-secondary); font-size: var(--text-sm); margin: 0; }
        .tag-chips-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .tag-chip-card {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.375rem 0.5rem 0.375rem 0.75rem;
          border: 1px solid var(--border-color); border-radius: 20px; background: var(--surface); transition: all 0.15s;
        }
        .tag-chip-card:hover { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color); }
        .tag-chip-name { font-size: var(--text-sm); font-weight: 500; color: var(--text-primary); white-space: nowrap; }
        .tag-chip-actions { display: flex; align-items: center; gap: 2px; }
        .tag-action-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; border: none; border-radius: 50%;
          background: transparent; color: var(--text-tertiary); cursor: pointer; transition: all 0.15s; padding: 0;
        }
        .tag-action-btn:hover { background: var(--surface-inset); color: var(--text-primary); }
        .tag-action-btn.danger:hover { background: rgba(239, 68, 68, 0.1); color: var(--danger-color); }
      `}</style>
    </div>
  );
}
