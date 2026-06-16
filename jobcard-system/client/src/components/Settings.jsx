import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import { useSettings } from '../hooks/useSettings';
import SecurityCard from './settings/SecurityCard';
import FoldersCard from './settings/FoldersCard';
import DataBackupCard from './settings/DataBackupCard';

export default function Settings() {
  const s = useSettings();

  return (
    <div className="settings page-enter">
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
                <div className="setting-label">Change PIN</div>
                <div className="setting-description">
                  Update your 4-digit PIN
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => s.setShowPasswordModal(true)}
              >
                Change PIN
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
            <SecurityCard s={s} />
            <FoldersCard s={s} />
          </>
        )}

        {s.isAdmin && <DataBackupCard s={s} />}

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
                  <dt>Database</dt>
                  <dd>SQLite (embedded)</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>

      <BottomSheet
        isOpen={s.showPasswordModal}
        onClose={s.resetPasswordForm}
        title="Change PIN"
        size="small"
      >
        <BottomSheet.Body>
          <form id="change-password-form" onSubmit={s.handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="form-control"
                value={s.currentPassword}
                onChange={(e) => s.setCurrentPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter current 4-digit PIN"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="form-control"
                value={s.newPassword}
                onChange={(e) => s.setNewPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter 4-digit PIN"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="form-control"
                value={s.confirmPassword}
                onChange={(e) => s.setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Re-enter 4-digit PIN"
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
            {s.savingPassword ? 'Changing...' : 'Change PIN'}
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      <BottomSheet
        isOpen={s.showImportConfirm}
        onClose={s.handleCancelImport}
        title="Confirm Import"
        size="small"
      >
        <BottomSheet.Body>
          <p style={{ marginBottom: '0.75rem', fontWeight: 500 }}>
            This will REPLACE all current data with the backup contents:
          </p>
          <ul style={{ margin: '0 0 1rem 1.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            <li>All database records (job cards, contacts, users, etc.)</li>
            <li>All job folder files (scanned documents, QA forms, etc.)</li>
          </ul>
          <p style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Everyone will be signed out and the app will reload when it finishes.
          </p>
          <p style={{ color: 'var(--danger)', fontWeight: 500 }}>
            This cannot be undone.
          </p>
        </BottomSheet.Body>
        <BottomSheet.Footer>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={s.handleCancelImport}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={s.handleConfirmImport}
          >
            Import and Replace All Data
          </button>
        </BottomSheet.Footer>
      </BottomSheet>

      {s.importing && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Restoring backup"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            color: '#fff',
            textAlign: 'center',
            padding: '2rem'
          }}
        >
          <div className="restore-spinner" aria-hidden="true" />
          <h2 style={{ margin: 0, color: '#fff' }}>Restoring…</h2>
          <p style={{ margin: 0, maxWidth: '24rem', opacity: 0.85 }}>
            Please wait and don't close the app. The screen will return to the login page when it's done.
          </p>
        </div>
      )}

      <style>{`
        .restore-spinner {
          width: 48px;
          height: 48px;
          border: 4px solid rgba(255, 255, 255, 0.25);
          border-top-color: #fff;
          border-radius: 50%;
          animation: restore-spin 0.9s linear infinite;
        }
        @keyframes restore-spin {
          to { transform: rotate(360deg); }
        }
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

        .backup-export-row {
          margin-bottom: 1rem;
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

        .job-number-input-group {
          display: flex;
          align-items: flex-end;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .job-number-input-group .form-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 0.25rem;
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

          .job-number-input-group {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}
