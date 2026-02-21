import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase } from '../utils/formatters';
import { Plus, Trash2, Save, Upload, FileText } from 'lucide-react';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function QALevelManagement() {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLevel, setEditingLevel] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getQaLevels();
      setLevels(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load QA levels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setFormData({ name: '' });
    setEditingLevel(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingLevel) {
        await api.updateQaLevel(editingLevel.id, formData);
        toast.success('QA level updated');
      } else {
        await api.createQaLevel(formData);
        toast.success('QA level created');
      }
      await loadData();
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save QA level');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (level) => {
    setEditingLevel(level);
    setFormData({
      name: level.name
    });
    setShowForm(true);
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

    setUploadingTemplate(true);
    try {
      const reader = new FileReader();
      const fileData = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

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
      <div className="page-container">
        <PageHeader title="QA Levels" />
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
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
                  <h3 className="qa-level-name">
                    {level.name}
                  </h3>
                  <span className="qa-level-meta">
                    {level.templateCount || 0} template{(level.templateCount || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="qa-level-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(level)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(level)}>
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
                          <Trash2 size={12} />
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

      {/* Create/Edit Form */}
      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingLevel ? `Edit: ${editingLevel.name}` : 'New QA Level'}
        size="small"
      >
        <form onSubmit={handleSubmit}>
          <BottomSheet.Body>
            <div className="form-group">
              <label>Name <span className="required">*</span></label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                onBlur={(e) => {
                  const f = toTitleCase(e.target.value);
                  if (f !== e.target.value) setFormData(prev => ({ ...prev, name: f }));
                }}
                placeholder="e.g. High Risk"
                className={!formData.name.trim() ? 'field-required' : ''}
              />
            </div>
          </BottomSheet.Body>

          <BottomSheet.Footer>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              {saving ? 'Saving...' : editingLevel ? 'Update' : 'Create'}
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
