import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase } from '../utils/formatters';
import { Plus, Trash2, Edit2, X, Check, Save } from 'lucide-react';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { invalidateTagCache } from '../hooks/useTags';

const CATEGORY_INFO = {
  treatment: {
    label: 'Treatment',
    description: 'Treatment options for line items. Used in job card items and supplier services.'
  },
  customer_property: {
    label: 'Customer Property',
    description: 'Types of customer property received with a job.'
  },
  drawings: {
    label: 'Drawings',
    description: 'Drawing types associated with a job.'
  },
  job_type: {
    label: 'Job Type',
    description: 'Classification of the type of work.'
  }
};

const CATEGORIES = Object.keys(CATEGORY_INFO);

export default function TagManagement() {
  const [selectedCategory, setSelectedCategory] = useState('treatment');
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [saving, setSaving] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getTagsIncludeInactive(selectedCategory);
      setTags(data);
    } catch (err) {
      toast.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const resetForm = () => {
    setShowForm(false);
    setEditingTag(null);
    setFormData({ name: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      if (editingTag) {
        await api.updateTag(editingTag.id, { name: formData.name.trim() });
        toast.success('Tag updated');
      } else {
        await api.createTag({ category: selectedCategory, name: formData.name.trim() });
        toast.success('Tag created');
      }
      invalidateTagCache(selectedCategory);
      await loadTags();
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save tag');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tag) => {
    setEditingTag(tag);
    setFormData({ name: tag.name });
    setShowForm(true);
  };

  const handleDeleteTag = async (tag) => {
    const confirmed = await showConfirm({
      title: 'Delete Tag',
      message: `Are you sure you want to delete "${tag.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteTag(tag.id);
      toast.success('Tag deleted');
      invalidateTagCache(selectedCategory);
      await loadTags();
    } catch (err) {
      toast.error(err.message || 'Failed to delete tag');
    }
  };

  const handleToggleActive = async (tag) => {
    try {
      await api.toggleTagActive(tag.id);
      toast.success(tag.active ? 'Tag deactivated' : 'Tag activated');
      invalidateTagCache(selectedCategory);
      await loadTags();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle tag');
    }
  };

  const activeTags = tags.filter(t => t.active);
  const inactiveTags = tags.filter(t => !t.active);

  return (
    <div className="tag-management page-scroll-layout page-enter">
      <PageHeader title="Tags">
        <button className="btn btn-primary" onClick={() => { setEditingTag(null); setFormData({ name: '' }); setShowForm(true); }}>
          <Plus size={16} /> Add Tag
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingTag ? 'Edit Tag' : 'Add New Tag'}
        size="small"
        closeOnOverlayClick={false}
      >
        <BottomSheet.Body>
          <form id="tag-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Category</label>
              {editingTag ? (
                <input type="text" value={CATEGORY_INFO[selectedCategory].label} readOnly className="input-disabled" />
              ) : (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{CATEGORY_INFO[cat].label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="tagName">Tag Name *</label>
              <input
                type="text"
                id="tagName"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                onBlur={(e) => {
                  const formatted = toTitleCase(e.target.value);
                  if (formatted !== e.target.value) setFormData(prev => ({ ...prev, name: formatted }));
                }}
                required
                autoFocus
              />
            </div>
          </form>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button type="submit" form="tag-form" className="btn btn-primary" disabled={saving}>
            <Save size={14} /> {saving ? 'Saving...' : editingTag ? 'Update Tag' : 'Create Tag'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      {/* Category tabs */}
      <div className="tag-category-tabs">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`tag-category-tab${selectedCategory === cat ? ' active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_INFO[cat].label}
          </button>
        ))}
      </div>

      {/* Active tags as chips */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>{CATEGORY_INFO[selectedCategory].label}</h2>
            <p className="tag-section-desc">{CATEGORY_INFO[selectedCategory].description}</p>
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="loading">Loading tags...</div>
          ) : activeTags.length === 0 ? (
            <p className="tag-empty-text">No active tags in this category yet. Click "Add Tag" to create one.</p>
          ) : (
            <div className="tag-chips-grid">
              {activeTags.map(tag => (
                <div key={tag.id} className="tag-chip-card">
                  <div className="tag-chip-main">
                    <span className="tag-chip-name">{tag.name}</span>
                    {tag.isSystem && <span className="tag-badge system">System</span>}
                  </div>
                  <div className="tag-chip-actions">
                    {!tag.isSystem && (
                      <>
                        <button className="tag-action-btn" onClick={() => handleEdit(tag)} title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button className="tag-action-btn danger" onClick={() => handleDeleteTag(tag)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    <button
                      className="tag-action-btn deactivate"
                      onClick={() => handleToggleActive(tag)}
                      title="Deactivate"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inactive tags */}
      {inactiveTags.length > 0 && (
        <div className="card tag-inactive-section">
          <div className="card-header">
            <h2>Inactive ({inactiveTags.length})</h2>
          </div>
          <div className="card-body">
            <div className="tag-chips-grid">
              {inactiveTags.map(tag => (
                <div key={tag.id} className="tag-chip-card inactive">
                  <div className="tag-chip-main">
                    <span className="tag-chip-name">{tag.name}</span>
                  </div>
                  <div className="tag-chip-actions">
                    <button
                      className="tag-action-btn activate"
                      onClick={() => handleToggleActive(tag)}
                      title="Activate"
                    >
                      <Check size={13} />
                    </button>
                    {!tag.isSystem && (
                      <button className="tag-action-btn danger" onClick={() => handleDeleteTag(tag)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

      <style>{`
        .tag-category-tabs {
          display: flex;
          gap: 0.25rem;
          margin-bottom: var(--spacing-md);
          border-bottom: 2px solid var(--border-color);
          padding-bottom: 0;
        }

        .tag-category-tab {
          padding: 0.5rem 1rem;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: var(--text-sm);
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: all 0.15s;
        }

        .tag-category-tab:hover {
          color: var(--text-primary);
        }

        .tag-category-tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }

        .tag-section-desc {
          margin: 0.25rem 0 0;
          font-size: var(--text-sm);
          color: var(--text-secondary);
          font-weight: 400;
        }

        .tag-empty-text {
          color: var(--text-secondary);
          font-size: var(--text-sm);
          margin: 0;
        }

        .tag-chips-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .tag-chip-card {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.375rem 0.5rem 0.375rem 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 20px;
          background: var(--surface);
          transition: all 0.15s;
        }

        .tag-chip-card:hover {
          border-color: var(--primary-color);
          box-shadow: 0 0 0 1px var(--primary-color);
        }

        .tag-chip-card.inactive {
          opacity: 0.5;
          border-style: dashed;
        }

        .tag-chip-card.inactive:hover {
          opacity: 0.8;
        }

        .tag-chip-main {
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }

        .tag-chip-name {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
        }

        .tag-badge {
          font-size: 0.625rem;
          padding: 0.1rem 0.375rem;
          border-radius: 8px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }

        .tag-badge.system {
          background: var(--surface-inset);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }

        .tag-chip-actions {
          display: flex;
          align-items: center;
          gap: 2px;
          margin-left: 0.125rem;
        }

        .tag-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: var(--text-tertiary);
          font-size: 0.6rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          padding: 0;
        }

        .tag-action-btn:hover {
          background: var(--surface-inset);
          color: var(--text-primary);
        }

        .tag-action-btn.danger:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--danger-color);
        }

        .tag-action-btn.deactivate:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--danger-color);
        }

        .tag-action-btn.activate:hover {
          background: rgba(34, 197, 94, 0.1);
          color: var(--accent-ready);
        }

        .tag-inactive-section {
          margin-top: var(--spacing-md);
        }

        .tag-inactive-section .card-header h2 {
          font-size: var(--text-base);
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
