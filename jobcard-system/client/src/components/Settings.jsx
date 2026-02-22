import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import { useSettings } from '../hooks/useSettings';

export default function Settings() {
  const s = useSettings();

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
                  checked={s.darkMode}
                  onChange={s.toggleDarkMode}
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
                onClick={() => s.setShowPasswordModal(true)}
              >
                Change Password
              </button>
            </div>
          </div>
        </div>

        {s.isAdmin && (
          <>
            <div className="card">
              <div className="card-header">
                <h2>Application Info</h2>
              </div>
              <div className="card-body">
                <dl className="info-list">
                  <div className="info-item">
                    <dt>Version</dt>
                    <dd>{s.appInfo?.version || 'Development'}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Platform</dt>
                    <dd>{s.appInfo?.platform || navigator.platform}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Architecture</dt>
                    <dd>{s.appInfo?.arch || 'N/A'}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Mode</dt>
                    <dd>{s.appInfo?.isDev ? 'Development' : 'Production'}</dd>
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
                    <dd>{s.user?.username}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Display Name</dt>
                    <dd>{s.user?.name}</dd>
                  </div>
                  <div className="info-item">
                    <dt>Role</dt>
                    <dd>{s.user?.role}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="card full-width">
              <div className="card-header">
                <h2>Available Printers</h2>
              </div>
              <div className="card-body">
                {s.loadingPrinters ? (
                  <p>Loading printers...</p>
                ) : s.printers.length === 0 ? (
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
                      {s.printers.map((printer, index) => (
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

        {s.isAdmin && (
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
                    value={s.inactivityTimeout}
                    onChange={(e) => s.setInactivityTimeout(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
                    min="1"
                    max="60"
                  />
                  <span className="timeout-label">minutes</span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={s.handleSaveInactivityTimeout}
                    disabled={s.savingTimeout}
                  >
                    {s.savingTimeout ? 'Saving...' : 'Save'}
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
                    value={s.scannerFolder}
                    onChange={(e) => s.setScannerFolder(e.target.value)}
                    placeholder="Select or enter scanner folder path..."
                    readOnly={!!window.electronAPI?.selectFolder}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={s.handleSelectScannerFolder}
                  >
                    Browse...
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={s.handleSaveScannerFolder}
                    disabled={s.savingSettings}
                  >
                    {s.savingSettings ? 'Saving...' : 'Save'}
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
                      Set the base folder where company and job card folders are automatically created. When a contact is created, a company folder is created here. When a job card is created, subfolders for Job Files, QA Forms, and Customer Property are created inside the company folder.
                    </div>
                  </div>
                </div>
                <div className="folder-input-group">
                  <input
                    type="text"
                    className="form-control"
                    value={s.jobFoldersBase}
                    onChange={(e) => s.setJobFoldersBase(e.target.value)}
                    placeholder="Select or enter job folders base path..."
                    readOnly={!!window.electronAPI?.selectFolder}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={s.handleSelectJobFolders}
                  >
                    Browse...
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={s.handleSaveJobFolders}
                    disabled={s.savingJobFolders}
                  >
                    {s.savingJobFolders ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {s.isAdmin && (
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
        isOpen={s.showPasswordModal}
        onClose={s.resetPasswordForm}
        title="Change Password"
        size="small"
        closeOnOverlayClick={false}
      >
        <BottomSheet.Body>
          <form id="change-password-form" onSubmit={s.handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                type="password"
                className="form-control"
                value={s.currentPassword}
                onChange={(e) => s.setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-control"
                value={s.newPassword}
                onChange={(e) => s.setNewPassword(e.target.value)}
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
                value={s.confirmPassword}
                onChange={(e) => s.setConfirmPassword(e.target.value)}
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
            disabled={s.savingPassword || !s.currentPassword || !s.newPassword || !s.confirmPassword}
          >
            {s.savingPassword ? 'Changing...' : 'Change Password'}
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
