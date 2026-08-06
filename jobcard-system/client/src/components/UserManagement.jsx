import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toTitleCase, validatePassword, formatDate } from '../utils/formatters';
import { Plus, Save, Archive, ArchiveRestore, History } from 'lucide-react';
import PageHeader from './common/PageHeader';
import ExportButton from './common/ExportButton';
import { exportUsers } from '../utils/excelExport';
import DataTable from './common/DataTable';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import EntityActivityLog from './common/EntityActivityLog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { isManagement } from '../utils/roles';

export default function UserManagement() {
  const { user: currentUser, applyRole } = useAuth();
  // Managers reach this page too, but admin accounts are off-limits to them
  // (no editing/archiving admins, no granting the admin role) — the server
  // enforces the same rules.
  const isAdmin = currentUser?.role === 'admin';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'user'
  });
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  useEffect(() => {
    loadUsers();
  }, [showInactive]);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers(showInactive);
      setUsers(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Every account must carry a real display name so time entries, the activity
    // log, and pickers always show who someone is — never a blank.
    if (!formData.name.trim()) {
      toast.error('Please enter a display name');
      return;
    }

    // Client-side password validation
    if (formData.password) {
      const passwordError = validatePassword(formData.password);
      if (passwordError) {
        toast.error(passwordError);
        return;
      }
    } else if (!editingUser) {
      toast.error('Password is required');
      return;
    }

    setSaving(true);

    try {
      let ownNewRole = null;
      if (editingUser) {
        const updated = await api.updateUser(editingUser.id, formData);
        // Changing your own access level takes effect immediately, so adopt it
        // rather than carrying on as the role you no longer have.
        if (updated.id === currentUser?.id && updated.role !== currentUser?.role) {
          ownNewRole = updated.role;
          applyRole(ownNewRole);
          toast.success('Your own access level changed. Some screens are no longer available to you.');
        }
      } else {
        await api.createUser(formData);
      }

      // Demoting yourself out of management puts this page out of reach: the
      // route guard is about to move us off it and the reload would be refused,
      // so stop here. Demoting yourself to manager leaves you sitting on the
      // page, so the list still has to be reloaded — otherwise it keeps showing
      // you as an admin on a row you can no longer open.
      if (ownNewRole && !isManagement({ role: ownNewRole })) {
        resetForm();
        return;
      }

      await loadUsers();
      setActivityRefreshKey(k => k + 1);
      resetForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      email: user.email || '',
      role: user.role
    });
    setShowForm(true);
  };

  const handleArchive = async (user) => {
    if (pendingId !== null) return;
    const confirmed = await showConfirm({
      title: 'Archive User',
      message: `Archive user "${user.username}"? They will no longer be able to log in, but all their records are kept. You can restore them any time.`,
      confirmLabel: 'Archive',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    setPendingId(user.id);
    try {
      await api.deactivateUser(user.id);
      toast.success('User archived');
      await loadUsers();
      setActivityRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to archive user');
    } finally {
      setPendingId(null);
    }
  };

  const handleRestore = async (user) => {
    if (pendingId !== null) return;
    setPendingId(user.id);
    try {
      await api.activateUser(user.id);
      toast.success('User restored');
      await loadUsers();
      setActivityRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err.message || 'Failed to restore user');
    } finally {
      setPendingId(null);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      role: 'user'
    });
  };


  return (
    <div className="user-management page-users page-enter">
      <PageHeader title="User Management">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show archived
        </label>
        <ExportButton
          onExportView={() => users.length ? exportUsers(users) : false}
          onExportAll={async () => {
            const all = await api.getUsers(true);
            return all.length ? exportUsers(all) : false;
          }}
        />
        <button className="btn btn-secondary" onClick={() => setShowActivityLog(true)}>
          <History size={16} /> Activity Log
        </button>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Add User
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingUser ? 'Edit User' : 'Add New User'}
        size="small"
      >
        <BottomSheet.Body>
          <form id="user-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="username">Username *</label>
                <input
                  type="text"
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  disabled={editingUser}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">
                  PIN {editingUser ? '(leave blank to keep current)' : '*'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  id="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="4-digit PIN"
                  required={!editingUser}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Display Name *</label>
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
              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="user">User</option>
                <option value="manager">Manager</option>
                {isAdmin && <option value="admin">Admin</option>}
              </select>
            </div>
          </form>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button
            type="submit"
            form="user-form"
            className="btn btn-primary"
            disabled={saving}
          >
            <Save size={14} /> {saving ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'username',
                label: 'Username',
                sortable: true,
                render: (val, row) => (
                  // A manager can't edit admin accounts, so don't offer the edit link.
                  (row.role === 'admin' && !isAdmin) ? (
                    <strong>{val}</strong>
                  ) : (
                    <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(row); }}>
                      <strong>{val}</strong>
                    </a>
                  )
                )
              },
              { key: 'name', label: 'Name', sortable: true },
              { key: 'email', label: 'Email', sortable: true },
              {
                key: 'role',
                label: 'Role',
                sortable: true,
                render: (val) => (
                  <span className={`badge ${val === 'admin' ? 'badge-in-progress' : val === 'manager' ? 'badge-completed' : 'badge-pending'}`}>
                    {val}
                  </span>
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
                key: 'createdAt',
                label: 'Created',
                sortable: true,
                render: (val) => formatDate(val)
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (_, row) => (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {row.id !== currentUser?.id && !(row.role === 'admin' && !isAdmin) && (
                      <>
                        {row.active ? (
                          <button className="btn btn-warning btn-sm" disabled={pendingId === row.id} onClick={(e) => { e.stopPropagation(); handleArchive(row); }}>
                            <Archive size={14} /> {pendingId === row.id ? 'Archiving…' : 'Archive'}
                          </button>
                        ) : (
                          <button className="btn btn-success btn-sm" disabled={pendingId === row.id} onClick={(e) => { e.stopPropagation(); handleRestore(row); }}>
                            <ArchiveRestore size={14} /> {pendingId === row.id ? 'Restoring…' : 'Restore'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              }
            ]}
            data={users}
            loading={loading}
            searchable
            searchKeys={['username', 'name', 'email']}
            searchPlaceholder="Search users..."
            emptyState={{
              icon: 'users',
              title: 'No users found',
              description: 'Create a user account to get started.',
              actionLabel: 'Add User',
              onAction: () => setShowForm(true),
            }}
            defaultSortKey="username"
            rowClassName={(row) => row.active ? '' : 'inactive-row'}
          />
        </div>
      </div>

      <EntityActivityLog
        entityType="user"
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

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
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
