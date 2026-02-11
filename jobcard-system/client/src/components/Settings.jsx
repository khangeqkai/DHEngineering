import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import PageHeader from './common/PageHeader';

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [appInfo, setAppInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  // Scanner folder settings (admin only)
  const [scannerFolder, setScannerFolder] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    loadAppInfo();
    loadPrinters();
    if (isAdmin) {
      loadSettings();
    }
  }, [isAdmin]);

  const loadSettings = async () => {
    try {
      const settings = await api.getSettings();
      setScannerFolder(settings.scanner_folder || '');
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

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
      await api.updateSettings({ scanner_folder: scannerFolder });
      alert('Settings saved successfully');
    } catch (err) {
      console.error('Failed to save settings:', err);
      alert(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
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
      console.error('Failed to load printers:', err);
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
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={toggleDarkMode}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

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

        {isAdmin && (
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
        )}

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
      </div>

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

        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 52px;
          height: 28px;
          flex-shrink: 0;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--border-color);
          transition: 0.3s;
          border-radius: 34px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }

        .toggle-switch input:checked + .toggle-slider {
          background-color: var(--primary-color);
        }

        .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(24px);
        }

        .folder-input-group {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .folder-input-group .form-control {
          flex: 1;
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
