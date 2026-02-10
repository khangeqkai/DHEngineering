import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';

export default function Layout() {
  const { user, logout } = useAuth();
  const [syncStatus, setSyncStatus] = useState('offline');

  useEffect(() => {
    // Start database sync
    const stopSync = db.startSync();

    // Listen for sync status changes
    const unsubscribe = db.onSyncEvent((type, data) => {
      if (type === 'status') {
        setSyncStatus(data);
      }
    });

    return () => {
      stopSync();
      unsubscribe();
    };
  }, []);

  const getInitials = (name) => {
    return name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Job Card System</h1>
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li>
              <NavLink to="/" end>
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/jobcards">Job Cards</NavLink>
            </li>
            {user?.role === 'admin' && (
              <>
                <li>
                  <NavLink to="/users">Users</NavLink>
                </li>
                <li>
                  <NavLink to="/activity">Activity Log</NavLink>
                </li>
              </>
            )}
            <li>
              <NavLink to="/settings">Settings</NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="connection-status">
            <span className={`status-dot ${syncStatus}`}></span>
            <span>
              {syncStatus === 'online' && 'Connected'}
              {syncStatus === 'offline' && 'Offline'}
              {syncStatus === 'syncing' && 'Syncing...'}
            </span>
          </div>

          <div className="user-info">
            <div className="user-avatar">{getInitials(user?.name)}</div>
            <div className="user-details">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>

          <button className="btn btn-secondary" onClick={logout} style={{ width: '100%' }}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
