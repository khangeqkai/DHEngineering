import { NavLink, Outlet } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import { useAuth, useInactivityCountdown } from '../context/AuthContext';
import { isManagement } from '../utils/roles';
import InactivityWarningModal from './common/InactivityWarningModal';
import Spinner from './common/Spinner';
import dhLogo from '../assets/dh-logo.png';
import {
  ClipboardList,
  UserCircle,
  Truck,
  Users,
  Clock,
  Settings,
  LogOut,
  ShieldCheck,
  Tag,
  DollarSign,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  BarChart3
} from 'lucide-react';
import Waves from './common/Waves';

export default function Layout() {
  const {
    user,
    logout,
    isWarningActive,
    resetInactivityTimer,
    handleActivity
  } = useAuth();
  // On its own context so only this component re-renders on the once-a-second
  // tick — see the comment on InactivityCountdownContext in AuthContext.jsx.
  const secondsRemaining = useInactivityCountdown();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

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
        <img src={dhLogo} alt="DH Engineering" className="mobile-logo" />
        {/* Branding label, not a document heading — each page supplies its own
            single level-1 heading ("Job Cards", "Customers", ...), and this
            sits alongside it below the breakpoint where both are visible. */}
        <p className="mobile-title">Job Card System</p>
      </header>

      {/* Overlay for mobile. A real button for keyboard parity with the
          hamburger control that already closes the sidebar — this is an
          additional way in, not the only one. The button chrome is
          stripped in App.css beside the scrim's own rules, so it still covers
          the screen edge-to-edge and looks identical to the old div. */}
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        ></button>
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-waves">
          <Waves
            staticRender
            lineColor="rgba(37, 99, 235, 0.35)"
            backgroundColor="transparent"
            waveAmpX={40}
            waveAmpY={20}
            xGap={12}
            yGap={36}
            maxCursorMove={120}
          />
        </div>
        <div className="sidebar-header">
          <img src={dhLogo} alt="DH Engineering" className="sidebar-logo" />
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
              <NavLink to="/jobcards" onClick={handleNavClick}>
                <span className="nav-icon">
                  <ClipboardList size={18} />
                </span>
                <span className="nav-text">Job Cards</span>
              </NavLink>
            </li>
            {isManagement(user) && (
              <>
                <li>
                  <NavLink to="/statistics" onClick={handleNavClick}>
                    <span className="nav-icon">
                      <BarChart3 size={18} />
                    </span>
                    <span className="nav-text">Statistics</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/contacts" onClick={handleNavClick}>
                    <span className="nav-icon">
                      <UserCircle size={18} />
                    </span>
                    <span className="nav-text">Contacts</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/suppliers" onClick={handleNavClick}>
                    <span className="nav-icon">
                      <Truck size={18} />
                    </span>
                    <span className="nav-text">Suppliers</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/tags" onClick={handleNavClick}>
                    <span className="nav-icon">
                      <Tag size={18} />
                    </span>
                    <span className="nav-text">Tags &amp; Equipment</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/qa-levels" onClick={handleNavClick}>
                    <span className="nav-icon">
                      <ShieldCheck size={18} />
                    </span>
                    <span className="nav-text">QA Levels</span>
                  </NavLink>
                </li>
                {user?.role === 'admin' && (
                  <li>
                    <NavLink to="/labour-rates" onClick={handleNavClick}>
                      <span className="nav-icon">
                        <DollarSign size={18} />
                      </span>
                      <span className="nav-text">Labour Rates</span>
                    </NavLink>
                  </li>
                )}
                <li>
                  <NavLink to="/users" onClick={handleNavClick}>
                    <span className="nav-icon">
                      <Users size={18} />
                    </span>
                    <span className="nav-text">Users</span>
                  </NavLink>
                </li>
              </>
            )}
            <li>
              <NavLink to="/search" onClick={handleNavClick}>
                <span className="nav-icon">
                  <Search size={18} />
                </span>
                <span className="nav-text">Search</span>
              </NavLink>
            </li>
            {user?.role === 'admin' && (
              <li>
                <NavLink to="/activity" onClick={handleNavClick}>
                  <span className="nav-icon">
                    <Clock size={18} />
                  </span>
                  <span className="nav-text">Activity Log</span>
                </NavLink>
              </li>
            )}
            <li>
              <NavLink to="/settings" onClick={handleNavClick}>
                <span className="nav-icon">
                  <Settings size={18} />
                </span>
                <span className="nav-text">Settings</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="nav-icon">
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </span>
            <span className="nav-text">{sidebarCollapsed ? 'Expand' : 'Collapse'}</span>
          </button>
          <button className="btn btn-secondary signout-btn" onClick={logout}>
            <span className="nav-icon">
              <LogOut size={18} />
            </span>
            <span className="nav-text">Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        {/* The screens under this shell are loaded on demand, so the wait belongs
            here rather than above the whole app — the sidebar and header stay put
            while the next screen arrives, instead of the window blanking out. */}
        <Suspense fallback={<div className="loading"><Spinner size={24} /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
