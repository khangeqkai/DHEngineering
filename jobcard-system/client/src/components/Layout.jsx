import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import InactivityWarningModal from './common/InactivityWarningModal';

export default function Layout() {
  const {
    user,
    logout,
    isWarningActive,
    secondsRemaining,
    resetInactivityTimer,
    handleActivity
  } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    // Apply dark mode
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Attach activity listeners for inactivity timeout
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'];

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [handleActivity]);

  // Close sidebar when clicking a nav link on mobile
  const handleNavClick = () => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

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
      {/* Inactivity Warning Modal */}
      <InactivityWarningModal
        isOpen={isWarningActive}
        secondsRemaining={secondsRemaining}
        onStayLoggedIn={resetInactivityTimer}
      />

      {/* Mobile Header */}
      <header className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        <h1 className="mobile-title">Job Card System</h1>
      </header>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h1>Job Card System</h1>
        </div>

        <div className="sidebar-user-section">
          <div className="user-info">
            <div className="user-avatar">{getInitials(user?.name)}</div>
            <div className="user-details">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li>
              <NavLink to="/" end onClick={handleNavClick}>
                <span className="nav-icon">D</span>
                <span className="nav-text">Dashboard</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/jobcards" onClick={handleNavClick}>
                <span className="nav-icon">J</span>
                <span className="nav-text">Job Cards</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/contacts" onClick={handleNavClick}>
                <span className="nav-icon">C</span>
                <span className="nav-text">Contacts</span>
              </NavLink>
            </li>
            {user?.role === 'admin' && (
              <>
                <li>
                  <NavLink to="/suppliers" onClick={handleNavClick}>
                    <span className="nav-icon">S</span>
                    <span className="nav-text">Suppliers</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/users" onClick={handleNavClick}>
                    <span className="nav-icon">U</span>
                    <span className="nav-text">Users</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/activity" onClick={handleNavClick}>
                    <span className="nav-icon">A</span>
                    <span className="nav-text">Activity Log</span>
                  </NavLink>
                </li>
              </>
            )}
            <li>
              <NavLink to="/settings" onClick={handleNavClick}>
                <span className="nav-icon">&#x2699;</span>
                <span className="nav-text">Settings</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button className="btn btn-secondary signout-btn" onClick={logout}>
            <span className="nav-icon">&larr;</span>
            <span className="nav-text">Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
