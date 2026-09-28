import { useEffect, useRef } from 'react';
import PageHeader from './common/PageHeader';
import BottomSheet from './common/BottomSheet';
import Spinner from './common/Spinner';
import { useSettings } from '../hooks/useSettings';
import SecurityCard from './settings/SecurityCard';
import FoldersCard from './settings/FoldersCard';
import HomeAccessCard from './settings/HomeAccessCard';
import DataBackupCard from './settings/DataBackupCard';
import FieldError from './common/FieldError';
import EmptyState from './common/EmptyState';
import { pushModal, removeModal, isTopModal } from './common/modalStack';
import './Settings.css';

export default function Settings() {
  const s = useSettings();
  const restoreOverlayRef = useRef(null);

  // While a restore runs the cover owns the keyboard: it takes focus when it
  // appears and, while it is the top layer, swallows Tab so nothing behind it
  // (the sidebar, this page's buttons) can be reached and pressed — leaving the
  // page mid-restore would pull the cover down while the restore is still going.
  // Escape does nothing either: a restore can't be cancelled.
  useEffect(() => {
    if (!s.importing) return undefined;
    pushModal('restore-overlay');
    restoreOverlayRef.current?.focus();
    const handleKeyDown = (e) => {
      if (!isTopModal('restore-overlay')) return;
      if (e.key === 'Tab' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      removeModal('restore-overlay');
    };
  }, [s.importing]);

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
              <label className="settings-toggle">
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
                onClick={s.openPasswordModal}
              >
                Change PIN
              </button>
            </div>
          </div>
        </div>

        {s.canManage && (
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
                  <p className="setting-description">Loading printers…</p>
                ) : s.printers.length === 0 ? (
                  <p className="setting-description">
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

        {/* The cards below edit stored settings, so they only appear once those have
            loaded — before that their boxes hold blanks that Save would write over the
            real settings. A failed load offers another try in their place. */}
        {s.canManage && s.loadFailed && (
          <div className="card full-width">
            <EmptyState
              icon="cpu"
              title="Couldn't load the settings"
              description="The security, job number, home access and folder settings can't be changed until they load."
              actionLabel="Try again"
              onAction={s.loadSettings}
            />
          </div>
        )}

        {s.canManage && s.settings && <SecurityCard s={s} />}

        {/* Home access: the tunnel's public address (any manager can read it out)
            and the home access code (admin-only to set, like any security setting). */}
        {s.canManage && s.settings && <HomeAccessCard s={s} />}

        {/* The job-folders base path stays admin-only: it decides where every job's
            files (and backups) are written, so a manager can't repoint it to a
            personal/removable drive. */}
        {s.canSeeSystemData && s.settings && <FoldersCard s={s} />}

        {/* Backups stay admin-only: a backup carries the whole database, pricing included. */}
        {s.canSeeSystemData && <DataBackupCard s={s} />}

        {s.canManage && (
          <div className="card full-width">
            <div className="card-header">
              <h2>Server Connection</h2>
            </div>
            <div className="card-body">
              <dl className="info-list">
                <div className="info-item">
                  <dt>This computer</dt>
                  <dd>Runs the shared system for everyone</dd>
                </div>
                {(() => {
                  const addrs = s.settings?.serverAddresses || [];
                  const secure = s.settings?.secureServing;
                  const name = s.settings?.mdnsName;
                  if (!secure) {
                    return (
                      <div className="info-item">
                        <dt>Open it from another computer</dt>
                        <dd>
                          In a web browser on the same office network, go to:
                          <div className="settings-list">
                            {addrs.length
                              ? addrs.map((ip) => <div key={ip}><strong>{`http://${ip}:3000`}</strong></div>)
                              : <em>address not showing yet — reopen this page in a moment</em>}
                          </div>
                        </dd>
                      </div>
                    );
                  }
                  const openLines = [];
                  if (name) openLines.push(`https://${name}`);
                  addrs.forEach((ip) => openLines.push(`https://${ip}`));
                  const setupLines = [];
                  if (name) setupLines.push(`http://${name}/setup`);
                  addrs.forEach((ip) => setupLines.push(`http://${ip}/setup`));
                  if (!openLines.length) {
                    return (
                      <div className="info-item">
                        <dt>Open it from another computer</dt>
                        <dd>Type this computer's private web address into a web browser on the same office network. (The address isn't showing yet — reopen this page in a moment.)</dd>
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className="info-item">
                        <dt>Open it from another computer</dt>
                        <dd>
                          In a web browser on the same office network, go to{openLines.length > 1 ? ' one of these' : ''}:
                          <div className="settings-list">
                            {openLines.map((a) => <div key={a}><strong>{a}</strong></div>)}
                          </div>
                          {name && <div className="settings-hint">The name usually works best. If it doesn't on some computer, use one of the number addresses instead.</div>}
                        </dd>
                      </div>
                      <div className="info-item">
                        <dt>Set up another computer (first time)</dt>
                        <dd>
                          Before the address above works, set up each computer once. In its web browser, go to:
                          <div className="settings-list">
                            {setupLines.map((a) => <div key={a}><strong>{a}</strong></div>)}
                          </div>
                          It walks you through a one-time setup so the camera works and downloads aren't blocked. If the browser shows a safety warning, choose <strong>Continue</strong> to reach the page.
                        </dd>
                      </div>
                    </>
                  );
                })()}
                <div className="info-item">
                  <dt>Records</dt>
                  <dd>Kept safely on this computer</dd>
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
              <label className="form-label" htmlFor="currentPin">Current PIN</label>
              <input
                id="currentPin"
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
            <div className={s.pinFieldErrors.groupClass('newPin')}>
              <label className="form-label" htmlFor="newPin">New PIN</label>
              <input
                {...s.pinFieldErrors.fieldProps('newPin')}
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="form-control"
                value={s.newPassword}
                onChange={(e) => s.setNewPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter 4-digit PIN"
                required
              />
              <FieldError {...s.pinFieldErrors.errorProps('newPin')} message={s.pinFieldErrors.errorFor('newPin')} />
            </div>
            <div className={s.pinFieldErrors.groupClass('confirmPin')}>
              <label className="form-label" htmlFor="confirmPin">Confirm New PIN</label>
              <input
                {...s.pinFieldErrors.fieldProps('confirmPin')}
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="form-control"
                value={s.confirmPassword}
                onChange={(e) => s.setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Re-enter 4-digit PIN"
                required
              />
              <FieldError {...s.pinFieldErrors.errorProps('confirmPin')} message={s.pinFieldErrors.errorFor('confirmPin')} />
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
          <p className="settings-note">
            This will REPLACE all current data with the backup contents:
          </p>
          <ul className="settings-note-list">
            <li>All database records (job cards, contacts, users, etc.)</li>
            <li>All job folder files (drawings, photos, scanned documents, etc.)</li>
          </ul>
          <p className="settings-note">
            Everyone will be signed out and the app will reload when it finishes.
          </p>
          <p className="settings-note settings-note--danger">
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
          ref={restoreOverlayRef}
          tabIndex={-1}
          role="alertdialog"
          aria-modal="true"
          aria-label="Restoring backup"
          aria-describedby="restore-overlay-desc"
          className="restore-overlay"
        >
          <Spinner size={40} />
          <h2>Restoring…</h2>
          <p id="restore-overlay-desc">
            Please wait and don't close the app. The screen will return to the login page when it's done.
          </p>
        </div>
      )}
    </div>
  );
}
