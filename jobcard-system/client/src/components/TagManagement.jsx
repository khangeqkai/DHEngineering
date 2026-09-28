import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase, capitalizeFirst } from '../utils/formatters';
import { Plus, Edit2, Save, Archive, ArchiveRestore, History } from 'lucide-react';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import EntityActivityLog from './common/EntityActivityLog';
import { exportTags, exportMachines } from '../utils/excelExport';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { tagActions } from '../hooks/useTags';
import { useFieldErrors, scrollFieldIntoView, showSaveRefusal } from '../hooks/useFieldErrors';
import FieldError from './common/FieldError';
import { hasMachineSeparator, MACHINE_SEPARATOR_MESSAGE } from '../../../server/src/shared/machineList';
import { TAG_CATEGORY_INFO as CATEGORY_INFO } from '../utils/tagCategories';
import './TagManagement.css';

const CATEGORIES = Object.keys(CATEGORY_INFO);

// Which form value each box on the shared form shows.
const BOX_VALUE = { machineNumber: 'machineNumber', machineName: 'name', machineDescription: 'description', tagName: 'name' };

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
  const [formData, setFormData] = useState({ name: '', machineNumber: '', description: '' });
  const [formCategory, setFormCategory] = useState('treatment');
  const [saving, setSaving] = useState(false);
  // One trail for the whole page — options and machines are managed side by side here.
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const bumpActivity = () => setActivityRefreshKey(k => k + 1);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();
  // The name box is spelled differently for a machine and a tag; both show formData.name.
  const { setFieldErrors, clearAll: resetFieldErrors, groupClass, errorFor, fieldProps, errorProps } = useFieldErrors(
    (box) => formData[BOX_VALUE[box]]
  );

  const isFormEquipment = formCategory === 'equipment';
  // Which box each field named in a server refusal belongs to on the form showing now.
  const formBoxes = isFormEquipment
    ? { machineNumber: 'machineNumber', name: 'machineName', description: 'machineDescription' }
    : { name: 'tagName' };

  // Switching tab or "Show archived" quickly can leave an older load still in
  // flight; each load takes a number and only the latest one may touch the list,
  // its loading flag or its error pop-up (same pattern as StopTimerForm's loads).
  // Otherwise an older reply landing last would put one category's options under
  // another tab's name (and into that tab's export).
  const tagLoadRequestIdRef = useRef(0);
  const machineLoadRequestIdRef = useRef(0);

  // --- Load tags ---
  const loadTags = useCallback(async () => {
    if (isEquipment) return;
    const requestId = ++tagLoadRequestIdRef.current;
    try {
      setTagLoading(true);
      // Drop the previous tab's rows first, so a slow or failed load never leaves
      // them on screen (or in an export) under the newly chosen category's name.
      setTags([]);
      const data = await api.getTags(selectedCategory, showArchivedTags);
      if (requestId !== tagLoadRequestIdRef.current) return;
      setTags(data);
    } catch (err) {
      if (requestId !== tagLoadRequestIdRef.current) return;
      toast.error('Failed to load tags', { id: 'tag-list-load-failed' });
    } finally {
      if (requestId === tagLoadRequestIdRef.current) setTagLoading(false);
    }
  }, [selectedCategory, isEquipment, showArchivedTags]);

  useEffect(() => { if (!isEquipment) loadTags(); }, [loadTags, isEquipment]);

  // --- Load machines ---
  const loadMachines = useCallback(async () => {
    const requestId = ++machineLoadRequestIdRef.current;
    try {
      setEquipLoading(true);
      const data = await api.getMachines(showInactiveMachines);
      if (requestId !== machineLoadRequestIdRef.current) return;
      setMachines(data);
    } catch (err) {
      if (requestId !== machineLoadRequestIdRef.current) return;
      toast.error('Failed to load machines', { id: 'machine-list-load-failed' });
    } finally {
      if (requestId === machineLoadRequestIdRef.current) setEquipLoading(false);
    }
  }, [showInactiveMachines]);

  useEffect(() => { if (isEquipment) loadMachines(); }, [isEquipment, loadMachines]);

  // --- Form handlers ---
  const resetForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormData({ name: '', machineNumber: '', description: '' });
    resetFieldErrors();
  };

  const openAddForm = () => {
    resetFieldErrors();
    setEditingItem(null);
    setFormData({ name: '', machineNumber: '', description: '' });
    setFormCategory(selectedCategory);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Each field only tidies itself on blur — hitting Enter from inside the box
    // submits the form directly and never fires that blur, so the same formatting
    // is applied here too before anything goes out.
    const machineNumber = formData.machineNumber.toUpperCase().trim();
    const name = toTitleCase(formData.name.trim());
    const description = capitalizeFirst(formData.description.trim());
    // The comma separates machines in logged work, so a number holding one would
    // read back as two machines — the server refuses it with the same shared rule.
    if (isFormEquipment && !machineNumber) {
      setFieldErrors({ machineNumber: 'Please enter the machine number' });
      scrollFieldIntoView('machineNumber');
      return;
    }
    if (!isFormEquipment && !name) {
      setFieldErrors({ tagName: 'Please enter the tag name' });
      scrollFieldIntoView('tagName');
      return;
    }
    if (isFormEquipment && hasMachineSeparator(machineNumber)) {
      setFieldErrors({ machineNumber: MACHINE_SEPARATOR_MESSAGE }, { machineNumber: formData.machineNumber });
      scrollFieldIntoView('machineNumber');
      return;
    }
    setSaving(true);
    // Deliberate house wording: every save on this page — adding or editing, a
    // machine or an option — confirms with "… updated". Not a bug; don't change
    // an add to "created"/"saved".
    try {
      if (isFormEquipment) {
        if (!machineNumber) return;
        if (editingItem) {
          await api.updateMachine(editingItem.id, { machineNumber, name, description });
          toast.success('Machine updated');
        } else {
          await api.createMachine({ machineNumber, name, description });
          toast.success('Machine updated');
        }
        await loadMachines();
      } else {
        if (!name) return;
        if (editingItem) {
          await tagActions.update(editingItem.id, { name });
          toast.success('Tag updated');
        } else {
          // Creating is idempotent server-side: a name that already exists just
          // returns the existing option. Same "updated" wording as an edit (see above).
          await tagActions.create({ category: formCategory, name });
          toast.success('Tag updated');
        }
        if (formCategory === selectedCategory) await loadTags();
      }
      bumpActivity();
      resetForm();
    } catch (err) {
      // A refusal naming one of the boxes (the server's comma refusal on the number,
      // say) marks that box; anything else is a pop-up.
      showSaveRefusal(err, { boxFor: formBoxes, setFieldErrors, fallback: isFormEquipment ? 'Failed to save machine' : 'Failed to save tag' });
    } finally {
      setSaving(false);
    }
  };

  // --- Tag actions ---
  const handleEditTag = (tag) => {
    resetFieldErrors();
    setEditingItem(tag);
    setFormData({ name: tag.name, machineNumber: '', description: '' });
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
    try { await tagActions.archive(tag); toast.success('Option archived'); bumpActivity(); await loadTags(); }
    catch (err) { toast.error(err.message || 'Failed to archive option'); }
    finally { setPendingTagId(null); }
  };

  const handleRestoreTag = async (tag) => {
    if (pendingTagId !== null) return;
    setPendingTagId(tag.id);
    try { await tagActions.restore(tag); toast.success('Option restored'); bumpActivity(); await loadTags(); }
    catch (err) { toast.error(err.message || 'Failed to restore option'); }
    finally { setPendingTagId(null); }
  };

  // --- Equipment actions ---
  const handleEditMachine = (m) => {
    resetFieldErrors();
    setEditingItem(m);
    setFormData({ name: m.name || '', machineNumber: m.machineNumber || '', description: m.description || '' });
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
    try { await api.archiveMachine(m.id); toast.success('Machine archived'); bumpActivity(); await loadMachines(); }
    catch (err) { toast.error(err.message || 'Failed to archive machine'); }
    finally { setPendingMachineId(null); }
  };

  const handleRestoreMachine = async (m) => {
    if (pendingMachineId !== null) return;
    setPendingMachineId(m.id);
    try { await api.activateMachine(m.id); toast.success('Machine restored'); bumpActivity(); await loadMachines(); }
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
        <ExportButton
          onExportView={() => {
            // Exactly what the open tab lists — the chosen category, archived rows only when shown.
            if (isEquipment) return machines.length ? exportMachines(machines) : false;
            return tags.length ? exportTags(tags, CATEGORY_INFO[selectedCategory].label) : false;
          }}
        />
        <button className="btn btn-secondary" onClick={() => setShowActivityLog(true)}>
          <History size={16} /> Activity Log
        </button>
        <button className="btn btn-primary" onClick={openAddForm}>
          <Plus size={16} /> {isEquipment ? 'Add Machine' : 'Add Tag'}
        </button>
      </PageHeader>

      {/* Unified BottomSheet — adapts fields based on category */}
      <BottomSheet isOpen={showForm} onClose={resetForm} title={formTitle} size="small">
        <BottomSheet.Body>
          <form id="tag-form" onSubmit={handleSubmit} noValidate>
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
              <>
              <div className="form-row">
                <div className={groupClass('machineNumber')}>
                  <label htmlFor="machineNumber">Machine Number *</label>
                  <input type="text" {...fieldProps('machineNumber')} value={formData.machineNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, machineNumber: e.target.value }))}
                    onBlur={(e) => { const f = e.target.value.toUpperCase().trim(); if (f !== e.target.value) setFormData(prev => ({ ...prev, machineNumber: f })); }}
                    placeholder="e.g. M1, LATHE-01..." autoFocus />
                  <FieldError {...errorProps('machineNumber')} message={errorFor('machineNumber')} />
                </div>
                <div className={groupClass('machineName')}>
                  <label htmlFor="machineName">Name</label>
                  <input type="text" {...fieldProps('machineName')} value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    onBlur={(e) => { const f = toTitleCase(e.target.value); if (f !== e.target.value) setFormData(prev => ({ ...prev, name: f })); }}
                    placeholder="Machine name..." />
                  <FieldError {...errorProps('machineName')} message={errorFor('machineName')} />
                </div>
              </div>
              <div className={groupClass('machineDescription')}>
                <label htmlFor="machineDescription">Description</label>
                <input type="text" {...fieldProps('machineDescription')} value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  onBlur={(e) => { const f = capitalizeFirst(e.target.value); if (f !== e.target.value) setFormData(prev => ({ ...prev, description: f })); }}
                  placeholder="e.g. CNC vertical machining centre..." />
                <FieldError {...errorProps('machineDescription')} message={errorFor('machineDescription')} />
              </div>
              </>
            ) : (
              <div className={groupClass('tagName')}>
                <label htmlFor="tagName">Tag Name *</label>
                <input type="text" {...fieldProps('tagName')} value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  onBlur={(e) => { const f = toTitleCase(e.target.value); if (f !== e.target.value) setFormData(prev => ({ ...prev, name: f })); }}
                  autoFocus />
                <FieldError {...errorProps('tagName')} message={errorFor('tagName')} />
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

      <EntityActivityLog
        entityType="tag,machine"
        isOpen={showActivityLog}
        onClose={() => setShowActivityLog(false)}
        refreshKey={activityRefreshKey}
      />

      <ConfirmDialog isOpen={dialogState.isOpen} title={dialogState.title} message={dialogState.message} confirmLabel={dialogState.confirmLabel} cancelLabel={dialogState.cancelLabel} confirmVariant={dialogState.confirmVariant} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}
