import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { validatePassword } from '../utils/formatters';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';

export default function Settings() {
  const { user, refreshInactivityTimeout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appInfo, setAppInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  // Local state for settings inputs (synced with settings)
  const [scannerFolder, setScannerFolder] = useState('');
  const [jobFoldersBase, setJobFoldersBase] = useState('');
  const [inactivityTimeout, setInactivityTimeout] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingJobFolders, setSavingJobFolders] = useState(false);
  const [savingTimeout, setSavingTimeout] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const loadSettings = async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettings(data);
      if (data) {
        setScannerFolder(data.scannerFolder || '');
        setJobFoldersBase(data.jobFoldersBase || '');
        setInactivityTimeout(parseInt(data.inactivityTimeoutMinutes, 10) || 5);
      }
    } catch (err) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    if (isAdmin) {
      loadAppInfo();
      loadPrinters();
    }
  }, []);

  const handleSelectScannerFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        setScannerFolder(folder);
      }
    } else {
      // Fallback for browser - just use text input
      const folder = prompt('Enter scanner folder path:', scannerFolder);
      if (folder !== null) {
        setScannerFolder(folder);
      }
    }
  };

  const handleSaveScannerFolder = async () => {
    setSavingSettings(true);
    try {
      await api.updateSettings({ scannerFolder });
      await loadSettings();
      toast.success('Settings saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSelectJobFolders = async () => {
    if (window.electronAPI?.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        setJobFoldersBase(folder);
      }
    } else {
      const folder = prompt('Enter job folders base path:', jobFoldersBase);
      if (folder !== null) {
        setJobFoldersBase(folder);
      }
    }
  };

  const handleSaveJobFolders = async () => {
    setSavingJobFolders(true);
    try {
      await api.updateSettings({ jobFoldersBase });
      await loadSettings();
      toast.success('Job folders base path saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save job folders base path');
    } finally {
      setSavingJobFolders(false);
    }
  };

  const handleSaveInactivityTimeout = async () => {
    setSavingTimeout(true);
    try {
      await api.updateSettings({ inactivityTimeoutMinutes: inactivityTimeout });
      await loadSettings();
      // Refresh the inactivity timeout in AuthContext so it takes effect immediately
      if (refreshInactivityTimeout) {
        await refreshInactivityTimeout();
      }
      toast.success('Inactivity timeout saved successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to save inactivity timeout');
    } finally {
      setSavingTimeout(false);
    }
  };

  useEffect(() => {
    // Apply dark mode
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordModal(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      resetPasswordForm();
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const loadAppInfo = async () => {
    if (window.electronAPI) {
      const info = await window.electronAPI.getAppInfo();
      setAppInfo(info);
    }
  };

  const loadPrinters = async () => {
    try {
      if (window.electronAPI) {
        const printerList = await window.electronAPI.getPrinters();
        setPrinters(printerList);
      }
    } catch (err) {
      toast.error('Failed to load printers');
    } finally {
      setLoadingPrinters(false);
    }
  };

  return (
    <div className="settings">
      <PageHeader title="Settings" />

      <div className="settings-grid">
        <div className="card">
          <div className="card-header">
            <h2>Appearance</h2>
          </div>
          <div className="card-body">
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-label">Dark Mode</div>
                <div className="setting-description">
                  Switch between light and dark theme
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  className="toggle-input"
                  type="checkbox"
                  checked={darkMode}
                  onChange={toggleDarkMode}
                />
                <span className="toggle-switch"></span>
              </label>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Account</h2>
          </div>
          <div className="card-body">
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-label">Change Password</div>
                <div className="setting-description">
                  Update your account password
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPasswordModal(true)}
              >
                Change Password
              </button>
            </div>
          </div>
        </div>

        {isAdmin && (
          <>
            <div className="card">
              <div className="card-header">
                <h2>Application Info</h2>
              </div>
              <div className="card-body">
                <dl className="info-list">
                  <div className="info-item">
                    <dt>Version</dt>
                    <dd>{appInfo?.version || 'Development'}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Platform</dt>
                    <dd>{appInfo?.platform || navigator.platform}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Architecture</dt>
                    <dd>{appInfo?.arch || 'N/A'}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Mode</dt>
                    <dd>{appInfo?.isDev ? 'Development' : 'Production'}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Current User</h2>
              </div>
              <div className="card-body">
                <dl className="info-list">
                  <div className="info-item">
                    <dt>Username</dt>
                    <dd>{user?.username}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Display Name</dt>
                    <dd>{user?.name}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Role</dt>
                    <dd>{user?.role}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="card full-width">
              <div className="card-header">
                <h2>Available Printers</h2>
                <button className="btn btn-secondary btn-sm" onClick={loadPrinters}>
                  Refresh
                </button>
              </div>
              <div className="card-body">
                {loadingPrinters ? (
                  <p>Loading printers...</p>
                ) : printers.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>
                    No printers found. Make sure you're running in Electron and printers are connected.
                  </p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Display Name</th>
                        <th>Default</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printers.map((printer, index) => (
                        <tr key={index}>
                          <td>{printer.name}</td>
                          <td>{printer.displayName}</td>
                          <td>{printer.isDefault ? 'Yes' : 'No'}</td>
                          <td>{printer.status === 0 ? 'Ready' : `Status: ${printer.status}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {isAdmin && (
          <>
            <div className="card full-width">
              <div className="card-header">
                <h2>Security Settings</h2>
              </div>
              <div className="card-body">
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Inactivity Timeout</div>
                    <div className="setting-description">
                      Automatically log out users after this many minutes of inactivity.
                      A warning will appear 30 seconds before logout. (1-60 minutes)
                    </div>
                  </div>
                </div>
                <div className="timeout-input-group">
                  <input
                    type="number"
                    className="form-control timeout-input"
                    value={inactivityTimeout}
                    onChange={(e) => setInactivityTimeout(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
                    min="1"
                    max="60"
                  />
                  <span className="timeout-label">minutes</span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveInactivityTimeout}
                    disabled={savingTimeout}
                  >
                    {savingTimeout ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            <div className="card full-width">
              <div className="card-header">
                <h2>Scanner Folder</h2>
              </div>
              <div className="card-body">
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Scanned Documents Folder</div>
                    <div className="setting-description">
                      Set the folder where scanned customer drawings are saved. Recent files from this folder will be available when creating job cards.
                    </div>
                  </div>
                </div>
                <div className="folder-input-group">
                  <input
                    type="text"
                    className="form-control"
                    value={scannerFolder}
                    onChange={(e) => setScannerFolder(e.target.value)}
                    placeholder="Select or enter scanner folder path..."
                    readOnly={!!window.electronAPI?.selectFolder}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSelectScannerFolder}
                  >
                    Browse...
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveScannerFolder}
                    disabled={savingSettings}
                  >
                    {savingSettings ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            <div className="card full-width">
              <div className="card-header">
                <h2>Job Folders</h2>
              </div>
              <div className="card-body">
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-label">Job Folders Base Path</div>
                    <div className="setting-description">
                      Set the base folder where company and job card folders are automatically created. When a contact is created, a company folder is created here. When a job card is created, subfolders for Drawings and QA Documents are created inside the company folder.
                    </div>
                  </div>
                </div>
                <div className="folder-input-group">
                  <input
                    type="text"
                    className="form-control"
                    value={jobFoldersBase}
                    onChange={(e) => setJobFoldersBase(e.target.value)}
                    placeholder="Select or enter job folders base path..."
                    readOnly={!!window.electronAPI?.selectFolder}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSelectJobFolders}
                  >
                    Browse...
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveJobFolders}
                    disabled={savingJobFolders}
                  >
                    {savingJobFolders ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {isAdmin && (
          <div className="card full-width">
            <div className="card-header">
              <h2>Server Connection</h2>
            </div>
            <div className="card-body">
              <dl className="info-list">
                <div className="info-item">
                  <dt>API Server</dt>
                  <dd>http://localhost:3000</dd>
                </div>
                <div className="info-item">
                  <dt>Database Server</dt>
                  <dd>http://localhost:3000/db</dd>
                </div>
                <div className="info-item">
                  <dt>Database UI</dt>
                  <dd>
                    <a href="http://localhost:3000/db/_utils" target="_blank" rel="noopener noreferrer">
                      http://localhost:3000/db/_utils (Fauxton)
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>

      <BottomSheet
        isOpen={showPasswordModal}
        onClose={resetPasswordForm}
        title="Change Password"
        size="small"
        closeOnOverlayClick={false}
      >
        <BottomSheet.Body>
          <form id="change-password-form" onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                type="password"
                className="form-control"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
            </div>
          </form>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button
            type="submit"
            form="change-password-form"
            className="btn btn-primary"
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
          >
            {savingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <style>{`
        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .full-width {
          grid-column: 1 / -1;
        }

        .info-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid var(--border-color);
        }

        .info-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .info-item dt {
          font-weight: 500;
          color: var(--text-secondary);
        }

        .info-item dd {
          font-weight: 500;
        }

        .setting-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }

        .setting-info {
          flex: 1;
        }

        .setting-label {
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .setting-description {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .folder-input-group {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .folder-input-group .form-control {
          flex: 1;
        }

        .timeout-input-group {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .timeout-input {
          width: 80px;
          text-align: center;
        }

        .timeout-label {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        @media (max-width: 768px) {
          .settings-grid {
            grid-template-columns: 1fr;
          }

          .folder-input-group {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
