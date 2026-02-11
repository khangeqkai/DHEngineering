import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user } = useAuth();
  const [appInfo, setAppInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    loadAppInfo();
    loadPrinters();
  }, []);

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
      <div className="page-header">
        <h1>Settings</h1>
      </div>

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
        .page-header {
          margin-bottom: 1.5rem;
        }

        .page-header h1 {
          font-size: 1.5rem;
          font-weight: 600;
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

        @media (max-width: 768px) {
          .settings-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
