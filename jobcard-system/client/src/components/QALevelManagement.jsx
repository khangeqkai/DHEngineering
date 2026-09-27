import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase } from '../utils/formatters';
import { Plus, Trash2, Save, Upload, FileText, Pencil } from 'lucide-react';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useManagedListPage } from '../hooks/useManagedListPage';
import { useFieldErrors, scrollFieldIntoView } from '../hooks/useFieldErrors';
import FieldError from './common/FieldError';
import { readFileAsBase64 } from '../utils/fileData';
import { MAX_UPLOAD_BYTES } from '../../../server/src/shared/jobFiles';

export default function QALevelManagement() {
  const [levels, setLevels] = useState([]);
  // This page has no show-archived toggle, no archive/restore (a level is
  // deleted outright, never archived) and no activity log, so only the
  // load/loading/toast-on-failure slice of the shared list-page hook applies.
  const { loading, runLoad } = useManagedListPage();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  // Set right before we close an inline rename on Escape, so the blur that follows
  // the input being removed doesn't also try to save.
  const cancelRenameRef = useRef(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();
  // 'name' -> the new-level form's own box; 'renameName' -> the inline rename box
  // (editingNameValue), which only exists while a row is being renamed.
  const { setFieldErrors, clearAll: resetFieldErrors, groupClass, errorFor, fieldProps, errorProps } = useFieldErrors(
    (name) => (name === 'renameName' ? editingNameValue : formData.name)
  );

  const loadData = useCallback(async () => {
    await runLoad(
      async () => { setLevels(await api.getQaLevels()); },
      (err) => toast.error(err.message || 'Failed to load QA levels')
    );
  }, [runLoad]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormData({ name: '' });
    setShowForm(false);
    resetFieldErrors();
  };

  // The pop-up is now create-only — renaming happens inline on each row's title.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFieldErrors({ name: 'Name is required' });
      scrollFieldIntoView('name');
      return;
    }

    setSaving(true);
    try {
      // The name only tidies itself on blur — Enter from inside the box submits
      // without that blur, so the same tidy-up is applied here too.
      await api.createQaLevel({ ...formData, name: toTitleCase(formData.name) });
      toast.success('QA level created');
      await loadData();
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save QA level');
    } finally {
      setSaving(false);
    }
  };

  const startRename = (level) => {
    setEditingNameId(level.id);
    setEditingNameValue(level.name);
  };

  // Save an inline rename (called from the title field's blur / Enter). Sends only the
  // name so the level's "requires returned form" switch is left exactly as it was.
  const commitRename = async (level) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setEditingNameId(null);
      return;
    }
    const name = toTitleCase(editingNameValue.trim());
    if (!name) {
      // Keep the row in edit mode so the mark has somewhere to show, rather than
      // collapsing back to the (now invalid) title. Deliberately no
      // scrollFieldIntoView here: this runs from the field's own blur, and that
      // helper focuses the field, which would bounce the caret straight back in
      // and trap it. The row is already on screen, so the mark is enough.
      setFieldErrors({ renameName: 'Name is required' });
      return;
    }
    setEditingNameId(null);
    if (name === level.name) return;

    setLevels(prev => prev.map(l => l.id === level.id ? { ...l, name } : l));
    try {
      await api.updateQaLevel(level.id, { name });
      toast.success('QA level renamed');
    } catch (err) {
      setLevels(prev => prev.map(l => l.id === level.id ? { ...l, name: level.name } : l));
      toast.error(err.message || 'Failed to rename QA level');
    }
  };

  // Flip the "requires completed form returned" switch straight from the level's row.
  // Sends the unchanged name plus the new flag so the existing update route applies it
  // (an unchanged name skips the rename/duplicate checks). Optimistic; reverts on failure.
  const handleToggleReturnedForm = async (level) => {
    const next = !level.requiresReturnedForm;
    setTogglingId(level.id);
    setLevels(prev => prev.map(l => l.id === level.id ? { ...l, requiresReturnedForm: next } : l));
    try {
      await api.updateQaLevel(level.id, { name: level.name, requiresReturnedForm: next });
    } catch (err) {
      setLevels(prev => prev.map(l => l.id === level.id ? { ...l, requiresReturnedForm: !next } : l));
      toast.error(err.message || 'Failed to update QA level');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (level) => {
    const confirmed = await showConfirm({
      title: 'Delete QA Level',
      message: `Are you sure you want to delete "${level.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteQaLevel(level.id);
      toast.success('QA level deleted');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete QA level');
    }
  };

  const handleFileUpload = async (levelId, e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are allowed');
      input.value = '';
      return;
    }

    // Same cap as a job-file upload — checked here so an oversized template is
    // caught before the base64 encode/send, not only by the server's size limit.
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('This file is too large (max 30 MB)');
      input.value = '';
      return;
    }

    setUploadingTemplate(true);
    try {
      const fileData = await readFileAsBase64(file);

      await api.uploadQaTemplate(levelId, {
        fileName: file.name,
        displayName: file.name.replace(/\.pdf$/i, ''),
        fileData
      });

      toast.success('Template uploaded');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to upload template');
    } finally {
      setUploadingTemplate(false);
      input.value = '';
    }
  };

  const handleDeleteTemplate = async (levelId, template) => {
    const confirmed = await showConfirm({
      title: 'Delete Template',
      message: `Delete template "${template.displayName}"?`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteQaTemplate(levelId, template.id);
      toast.success('Template deleted');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete template');
    }
  };

  if (loading) {
    return (
      <div className="page-container page-enter">
        <PageHeader title="QA Levels" />
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="page-container page-enter">
      <PageHeader title="QA Levels">
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> New Level
        </button>
      </PageHeader>

      <div className="qa-levels-list">
        {levels.length === 0 ? (
          <div className="empty-state">No QA levels configured</div>
        ) : (
          levels.map(level => (
            <div key={level.id} className="qa-level-card">
              <div className="qa-level-header">
                <div className="qa-level-info">
                  {editingNameId === level.id ? (
                    <div className={groupClass('renameName')}>
                      <input
                        className="qa-level-name-input"
                        type="text"
                        {...fieldProps('renameName')}
                        value={editingNameValue}
                        autoFocus
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onBlur={() => commitRename(level)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                          else if (e.key === 'Escape') { e.preventDefault(); cancelRenameRef.current = true; setEditingNameId(null); }
                        }}
                      />
                      <FieldError {...errorProps('renameName')} message={errorFor('renameName')} />
                    </div>
                  ) : (
                    <h2 className="qa-level-name">
                      <button
                        type="button"
                        className="qa-level-name-btn qa-level-name--editable"
                        aria-label={`Rename "${level.name}"`}
                        onClick={() => startRename(level)}
                      >
                        {level.name}
                        <Pencil size={14} className="qa-level-name-pencil" />
                      </button>
                    </h2>
                  )}
                  <span className="qa-level-meta">
                    {level.templateCount || 0} template{(level.templateCount || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="qa-level-actions">
                  <label
                    className="qa-level-toggle"
                    title="When on, a completed quality form must be scanned back before a job at this level can be invoiced (the level must have a form template first)"
                  >
                    <span className="qa-level-toggle-text">Form must be returned</span>
                    <input
                      className="toggle-input"
                      type="checkbox"
                      checked={!!level.requiresReturnedForm}
                      disabled={togglingId === level.id}
                      onChange={() => handleToggleReturnedForm(level)}
                    />
                    <span className="toggle-switch"></span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    aria-label={`Delete "${level.name}"`}
                    onClick={() => handleDelete(level)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Templates section */}
              <div className="qa-level-templates">
                {level.templates && level.templates.length > 0 ? (
                  <div className="template-list">
                    {level.templates.map(tmpl => (
                      <div key={tmpl.id} className="template-item">
                        <FileText size={14} />
                        <span className="template-name">{tmpl.displayName}</span>
                        <span className="template-file">({tmpl.fileName})</span>
                        <button
                          className="btn-icon btn-icon-danger"
                          onClick={() => handleDeleteTemplate(level.id, tmpl)}
                          title="Delete template"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="template-empty">No templates uploaded</div>
                )}
                <div className="template-upload">
                  <label className="btn btn-secondary btn-sm upload-btn">
                    <Upload size={14} />
                    {uploadingTemplate ? 'Uploading...' : 'Upload PDF Template'}
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleFileUpload(level.id, e)}
                      style={{ display: 'none' }}
                      disabled={uploadingTemplate}
                    />
                  </label>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New level form (renaming is done inline on each row's title) */}
      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title="New QA Level"
        size="small"
      >
        <form onSubmit={handleSubmit}>
          <BottomSheet.Body>
            <div className={groupClass('name')}>
              <label htmlFor="name">Name <span className="required">*</span></label>
              <input
                type="text"
                {...fieldProps('name')}
                value={formData.name}
                // A real `required` here would trigger the browser's own validation
                // bubble on submit, on top of the custom FieldError message below —
                // aria-required gives the same assistive-tech signal without that.
                aria-required="true"
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                onBlur={(e) => {
                  const f = toTitleCase(e.target.value);
                  if (f !== e.target.value) setFormData(prev => ({ ...prev, name: f }));
                }}
                placeholder="e.g. High Risk"
                className={!formData.name.trim() ? 'field-required' : ''}
              />
              <FieldError {...errorProps('name')} message={errorFor('name')} />
            </div>
          </BottomSheet.Body>

          <BottomSheet.Footer>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving...' : 'Create'}
            </button>
          </BottomSheet.Footer>
        </form>
      </BottomSheet>

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
