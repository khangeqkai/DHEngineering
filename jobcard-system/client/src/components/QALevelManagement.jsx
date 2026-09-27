import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase } from '../utils/formatters';
import { Plus, Trash2, Save, Pencil } from 'lucide-react';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { useManagedListPage } from '../hooks/useManagedListPage';
import { useFieldErrors, scrollFieldIntoView, showSaveRefusal } from '../hooks/useFieldErrors';
import FieldError from './common/FieldError';

// Which box on the new-level form each field named in a server refusal belongs to.
const QA_FORM_BOXES = { name: 'name' };

export default function QALevelManagement() {
  const [levels, setLevels] = useState([]);
  // This page has no show-archived toggle, no archive/restore (a level is
  // deleted outright, never archived) and no activity log, so only the
  // load/loading/toast-on-failure slice of the shared list-page hook applies.
  const { loading, runLoad } = useManagedListPage();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');
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
      showSaveRefusal(err, { boxFor: QA_FORM_BOXES, setFieldErrors, fallback: 'Failed to save QA level' });
    } finally {
      setSaving(false);
    }
  };

  const startRename = (level) => {
    setEditingNameId(level.id);
    setEditingNameValue(level.name);
  };

  // Save an inline rename (called from the title field's blur / Enter).
  const commitRename = async (level) => {
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
                          // Enter and Escape both just leave the box, so the one
                          // save-on-leave step (commitRename on blur) runs either way.
                          if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); }
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
                </div>
                <div className="qa-level-actions">
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
