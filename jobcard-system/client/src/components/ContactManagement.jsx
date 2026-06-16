import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase, capitalizeFirst, autoResize } from '../utils/formatters';
import { Plus, Archive, ArchiveRestore, Save, History } from 'lucide-react';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import { exportContacts } from '../utils/excelExport';
import DataTable from './common/DataTable';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import EntityActivityLog from './common/EntityActivityLog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function ContactManagement() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [formData, setFormData] = useState({
    contactName: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getContacts(showArchived);
      setContacts(data);
    } catch (err) {
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingContact) {
        await api.updateContact(editingContact.id, formData);
      } else {
        await api.createContact(formData);
      }
      await loadContacts();
      setActivityRefreshKey(k => k + 1);
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setFormData({
      contactName: contact.contactName || '',
      companyName: contact.companyName || '',
      phone: contact.phone || '',
      email: contact.email || '',
      address: contact.address || '',
      notes: contact.notes || ''
    });
    setShowForm(true);
  };

  const handleArchive = async (contact) => {
    if (pendingId !== null) return;
    const displayName = contact.contactName
      ? `${contact.companyName} (${contact.contactName})`
      : contact.companyName;
    const confirmed = await showConfirm({
      title: 'Archive Contact',
      message: `Archive "${displayName}"? It will no longer appear when picking a customer for a job, but its existing jobs and files stay intact. You can restore it any time.`,
      confirmLabel: 'Archive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    setPendingId(contact.id);
    try {
      await api.archiveContact(contact.id);
      toast.success('Contact archived');
      await loadContacts();
      setActivityRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to archive contact');
    } finally {
      setPendingId(null);
    }
  };

  const handleRestore = async (contact) => {
    if (pendingId !== null) return;
    setPendingId(contact.id);
    try {
      await api.unarchiveContact(contact.id);
      toast.success('Contact restored');
      await loadContacts();
      setActivityRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to restore contact');
    } finally {
      setPendingId(null);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingContact(null);
    setFormData({
      contactName: '',
      companyName: '',
      phone: '',
      email: '',
      address: '',
      notes: ''
    });
  };


  return (
    <div className="contact-management page-contacts page-scroll-layout page-enter">
      <PageHeader title="Contacts">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <ExportButton
          onExportView={() => contacts.length ? exportContacts(contacts) : false}
        />
        <button className="btn btn-secondary" onClick={() => setShowActivityLog(true)}>
          <History size={16} /> Activity Log
        </button>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Add Contact
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingContact ? 'Edit Contact' : 'Add New Contact'}
        size="small"
      >
        <BottomSheet.Body>
          <form id="contact-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="companyName">Company *</label>
                <input
                  type="text"
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  onBlur={(e) => {
                    const formatted = toTitleCase(e.target.value);
                    if (formatted !== e.target.value) {
                      setFormData(prev => ({ ...prev, companyName: formatted }));
                    }
                  }}
                  placeholder="Company name..."
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
                  placeholder="Person's name..."
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  type="tel"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
            form="contact-form"
            className="btn btn-primary"
            disabled={saving}
          >
            <Save size={14} /> {saving ? 'Saving...' : editingContact ? 'Update Contact' : 'Create Contact'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'companyName',
                label: 'Company',
                sortable: true,
                render: (val, row) => (
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(row); }}>
                    <strong>{val}</strong>
                  </a>
                )
              },
              { key: 'contactName', label: 'Contact Name', sortable: true },
              { key: 'phone', label: 'Phone' },
              { key: 'email', label: 'Email', sortable: true },
              {
                key: 'actions',
                label: 'Actions',
                render: (_, row) => (
                  <div className="action-buttons">
                    {row.archived ? (
                      <button className="btn btn-success btn-sm" disabled={pendingId === row.id} onClick={(e) => { e.stopPropagation(); handleRestore(row); }}>
                        <ArchiveRestore size={14} /> {pendingId === row.id ? 'Restoring…' : 'Restore'}
                      </button>
                    ) : (
                      <button className="btn btn-warning btn-sm" disabled={pendingId === row.id} onClick={(e) => { e.stopPropagation(); handleArchive(row); }}>
                        <Archive size={14} /> {pendingId === row.id ? 'Archiving…' : 'Archive'}
                      </button>
                    )}
                  </div>
                )
              }
            ]}
            data={contacts}
            loading={loading}
            rowClassName={(row) => row.archived ? 'inactive-row' : ''}
            searchable
            searchKeys={['companyName', 'contactName', 'email', 'phone']}
            searchPlaceholder="Search contacts..."
            emptyState={{
              icon: 'contacts',
              title: 'No contacts yet',
              description: 'Add your first contact to get started.',
              actionLabel: 'Add Contact',
              onAction: () => setShowForm(true),
            }}
            defaultSortKey="companyName"
          />
        </div>
      </div>

      <EntityActivityLog
        entityType="contact"
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
