import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { toTitleCase } from '../utils/formatters';
import { Plus, Trash2, Save, UserMinus, UserCheck } from 'lucide-react';
import PageHeader from './common/PageHeader';
import DataTable from './common/DataTable';
import BottomSheet from './common/BottomSheet';
import ConfirmDialog from './common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function UserManagement() {
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
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();

  useEffect(() => {
    loadUsers();
  }, [showInactive]);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers(showInactive);
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    if (!editingUser && formData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSaving(true);

    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, formData);
      } else {
        await api.createUser(formData);
      }
      await loadUsers();
      resetForm();
    } catch (err) {
      console.error('Failed to save user:', err);
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

  const handleDeactivate = async (user) => {
    const confirmed = await showConfirm({
      title: 'Deactivate User',
      message: `Are you sure you want to deactivate user "${user.username}"?`,
      confirmLabel: 'Deactivate',
      confirmVariant: 'warning'
    });
    if (!confirmed) return;

    try {
      await api.deactivateUser(user.id);
      await loadUsers();
    } catch (err) {
      console.error('Failed to deactivate user:', err);
      toast.error(err.message || 'Failed to deactivate user');
    }
  };

  const handleActivate = async (user) => {
    try {
      await api.activateUser(user.id);
      await loadUsers();
    } catch (err) {
      console.error('Failed to activate user:', err);
      toast.error(err.message || 'Failed to activate user');
    }
  };

  const handleDelete = async (user) => {
    const confirmed = await showConfirm({
      title: 'Delete User Permanently',
      message: `Are you sure you want to PERMANENTLY delete user "${user.username}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await api.deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
      toast.error(err.message || 'Failed to delete user');
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

  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  return (
    <div className="user-management">
      <PageHeader title="User Management">
        <label className="show-inactive-label">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Add User
        </button>
      </PageHeader>

      <BottomSheet
        isOpen={showForm}
        onClose={resetForm}
        title={editingUser ? 'Edit User' : 'Add New User'}
        size="small"
        closeOnOverlayClick={false}
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
                  Password {editingUser ? '(leave blank to keep current)' : '*'}
                </label>
                <input
                  type="password"
                  id="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Display Name</label>
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
                <option value="admin">Admin</option>
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
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(row); }}>
                    <strong>{val}</strong>
                  </a>
                )
              },
              { key: 'name', label: 'Name', sortable: true },
              { key: 'email', label: 'Email', sortable: true },
              {
                key: 'role',
                label: 'Role',
                sortable: true,
                render: (val) => (
                  <span className={`badge ${val === 'admin' ? 'badge-in-progress' : 'badge-pending'}`}>
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
                    {val ? 'Active' : 'Inactive'}
                  </span>
                )
              },
              {
                key: 'createdAt',
                label: 'Created',
                sortable: true,
                render: (val) => new Date(val).toLocaleDateString()
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (_, row) => (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {row.active ? (
                      <button className="btn btn-warning btn-sm" onClick={(e) => { e.stopPropagation(); handleDeactivate(row); }}>
                        <UserMinus size={14} /> Deactivate
                      </button>
                    ) : (
                      <button className="btn btn-success btn-sm" onClick={(e) => { e.stopPropagation(); handleActivate(row); }}>
                        <UserCheck size={14} /> Activate
                      </button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )
              }
            ]}
            data={users}
            searchable
            searchKeys={['username', 'name', 'email']}
            searchPlaceholder="Search users..."
            emptyMessage="No users found"
            defaultSortKey="username"
            rowClassName={(row) => row.active ? '' : 'inactive-row'}
          />
        </div>
      </div>

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
