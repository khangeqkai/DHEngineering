import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';

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
    if (!confirm(`Are you sure you want to deactivate user "${user.username}"?`)) return;

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
    if (!confirm(`Are you sure you want to PERMANENTLY delete user "${user.username}"? This cannot be undone.`)) return;

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
          + Add User
        </button>
      </PageHeader>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2>{editingUser ? 'Edit User' : 'Add New User'}</h2>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>
              Cancel
            </button>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
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

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ opacity: user.active ? 1 : 0.6 }}>
                  <td>{user.username}</td>
                  <td>{user.name}</td>
                  <td>{user.email || '-'}</td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'badge-in-progress' : 'badge-pending'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${user.active ? 'badge-completed' : 'badge-cancelled'}`}>
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEdit(user)}
                      >
                        Edit
                      </button>
                      {user.active ? (
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => handleDeactivate(user)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleActivate(user)}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(user)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
