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
import CompanyPeople from './contacts/CompanyPeople';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const blankCompany = () => ({ name: '', address: '', notes: '' });

export default function ContactManagement() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [formData, setFormData] = useState(blankCompany());
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  // One call brings every customer and the people under them, which is what the
  // table lists. Retired people are always included here — this is the page you
  // come to in order to bring one back, so hiding them would strand them.
  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCompanies({ includeArchived: true, withPeople: true });
      // The "Show archived" box is about customers; a retired person still shows
      // under their (live) customer so they can be restored.
      const visible = (showArchived ? data : data.filter(c => !c.archived))
        // Flattened so the search box finds a customer by the person you deal
        // with there, not just by the company name.
        .map(c => ({ ...c, peopleNames: (c.people || []).map(p => p.contactName).filter(Boolean).join(', ') }));
      setCompanies(visible);
      return visible;
    } catch (err) {
      toast.error('Could not load the customer list');
      return null;
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  // Keep the open customer's panel in step after a change to its people.
  const refresh = async () => {
    const data = await loadCompanies();
    setActivityRefreshKey(k => k + 1);
    if (data && editingCompany) {
      setEditingCompany(data.find(c => c.id === editingCompany.id) || null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingCompany) {
        await api.updateCompany(editingCompany.id, formData);
        toast.success('Customer saved');
      } else {
        const created = await api.createCompany(formData);
        toast.success('Customer added');
        setEditingCompany({ ...created, people: [] });
      }
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Could not save the customer');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name || '',
      address: company.address || '',
      notes: company.notes || ''
    });
    setShowForm(true);
  };

  const handleArchive = async (company) => {
    if (pendingId !== null) return;
    const confirmed = await showConfirm({
      title: 'Archive customer',
      message: `Archive "${company.name}"? They will no longer appear when picking a customer for a job, but their existing jobs and files stay intact. You can restore them any time.`,
      confirmLabel: 'Archive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    setPendingId(company.id);
    try {
      await api.archiveCompany(company.id);
      toast.success('Customer archived');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Could not archive the customer');
    } finally {
      setPendingId(null);
    }
  };

  const handleRestore = async (company) => {
    if (pendingId !== null) return;
    setPendingId(company.id);
    try {
      await api.unarchiveCompany(company.id);
      toast.success('Customer restored');
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Could not restore the customer');
    } finally {
      setPendingId(null);
    }
  };

  // --- People at the open customer ---

  const createPerson = async (person) => {
    setSaving(true);
    try {
      await api.createContact({ companyId: editingCompany.id, ...person });
      toast.success('Person added');
      await refresh();
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not add the person');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updatePerson = async (id, person) => {
    setSaving(true);
    try {
      await api.updateContact(id, person);
      toast.success('Person saved');
      await refresh();
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not save the person');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const archivePerson = async (person) => {
    if (pendingId !== null) return;
    const confirmed = await showConfirm({
      title: 'Retire this person',
      message: `Retire ${person.contactName || 'this person'}? They stop being offered on new jobs, but the jobs already taken for them keep their name.`,
      confirmLabel: 'Retire',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;
    setPendingId(person.id);
    try {
      await api.archiveContact(person.id);
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Could not retire the person');
    } finally {
      setPendingId(null);
    }
  };

  const restorePerson = async (person) => {
    if (pendingId !== null) return;
    setPendingId(person.id);
    try {
      await api.unarchiveContact(person.id);
      await refresh();
    } catch (err) {
      toast.error(err.message || 'Could not restore the person');
    } finally {
      setPendingId(null);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCompany(null);
    setFormData(blankCompany());
  };

  // The spreadsheet stays one row per person, carrying their company alongside.
  const exportRows = companies.flatMap(c => (
    (c.people || []).length
      ? c.people.map(p => ({ companyName: c.name, contactName: p.contactName, phone: p.phone, email: p.email, address: c.address, notes: c.notes }))
      : [{ companyName: c.name, contactName: '', phone: '', email: '', address: c.address, notes: c.notes }]
  ));

  return (
    <div className="contact-management page-contacts page-scroll-layout page-enter">
      <PageHeader title="Customers">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <ExportButton
          onExportView={() => exportRows.length ? exportContacts(exportRows) : false}
        />
        <button className="btn btn-secondary" onClick={() => setShowActivityLog(true)}>
          <History size={16} /> Activity Log
        </button>
        <button className="btn btn-primary" onClick={() => { setEditingCompany(null); setFormData(blankCompany()); setShowForm(true); }}>
          <Plus size={16} /> Add Customer
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingCompany ? editingCompany.name : 'Add New Customer'}
        size="small"
      >
        <BottomSheet.Body>
          <form id="company-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="companyName">Company *</label>
              <input
                type="text"
                id="companyName"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                onBlur={(e) => {
                  const formatted = toTitleCase(e.target.value);
                  if (formatted !== e.target.value) setFormData(prev => ({ ...prev, name: formatted }));
                }}
                placeholder="Company name..."
                required
              />
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
                  if (formatted !== e.target.value) setFormData(prev => ({ ...prev, address: formatted }));
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
                  if (formatted !== e.target.value) setFormData(prev => ({ ...prev, notes: formatted }));
                }}
                rows={2}
              />
            </div>
          </form>

          {/* People only exist once the company does, so this appears after saving. */}
          {editingCompany ? (
            <CompanyPeople
              people={editingCompany.people || []}
              saving={saving}
              pendingId={pendingId}
              onCreate={createPerson}
              onUpdate={updatePerson}
              onArchive={archivePerson}
              onRestore={restorePerson}
            />
          ) : (
            <p className="field-note">Save the customer first, then add the people you deal with there.</p>
          )}
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button
            type="submit"
            form="company-form"
            className="btn btn-primary"
            disabled={saving}
          >
            <Save size={14} /> {saving ? 'Saving...' : editingCompany ? 'Save Customer' : 'Create Customer'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'name',
                label: 'Company',
                sortable: true,
                render: (val, row) => (
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(row); }}>
                    <strong>{val}</strong>
                  </a>
                )
              },
              {
                key: 'people',
                label: 'Contacts',
                render: (_, row) => {
                  const live = (row.people || []).filter(p => !p.archived);
                  if (live.length === 0) return <span className="text-muted">None</span>;
                  return live.map(p => p.contactName || 'Unnamed').join(', ');
                }
              },
              { key: 'address', label: 'Address' },
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
            data={companies}
            loading={loading}
            rowClassName={(row) => row.archived ? 'inactive-row' : ''}
            searchable
            searchKeys={['name', 'peopleNames', 'address']}
            searchPlaceholder="Search customers..."
            emptyState={{
              icon: 'contacts',
              title: 'No customers yet',
              description: 'Add your first customer to get started.',
              actionLabel: 'Add Customer',
              onAction: () => setShowForm(true),
            }}
            defaultSortKey="name"
          />
        </div>
      </div>

      <EntityActivityLog
        entityType="company,contact"
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
