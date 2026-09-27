import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import { X } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { isManagement, can } from './utils/roles';
import Login from './components/Login';
import JobCardList from './components/JobCardList';
import Layout from './components/Layout';
import Spinner from './components/common/Spinner';
import './App.css';

// Everything below is a screen a worker doesn't need before they see their jobs —
// splitting these out means the sign-in screen and job list download and paint
// without waiting on statistics, settings, user management, etc. Login and
// JobCardList stay eager above because they're the common path.
const UserManagement = lazy(() => import('./components/UserManagement'));
const ContactManagement = lazy(() => import('./components/ContactManagement'));
const SupplierManagement = lazy(() => import('./components/SupplierManagement'));
const ActivityLog = lazy(() => import('./components/ActivityLog'));
const TagManagement = lazy(() => import('./components/TagManagement'));
const LabourRatesSettings = lazy(() => import('./components/LabourRatesSettings'));
const Settings = lazy(() => import('./components/Settings'));
const SearchPage = lazy(() => import('./components/SearchPage'));
const Statistics = lazy(() => import('./components/Statistics'));

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return user ? children : <Navigate to="/login" replace />;
}

// Gated on a named permission rather than the admin role itself, so each route
// carries the reason it's locked down (pricing, the activity trail, ...) instead
// of a bare "admin only" that can't tell the two apart.
function PermissionRoute({ permission, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!can(user, permission)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// Admin or manager. Managers get every admin page except the money ones
// (Labour Rates stays behind PermissionRoute's pricing permission; costing has
// no page of its own).
function ManagementRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isManagement(user)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          className: 'custom-toast',
          success: {
            duration: 3000,
            className: 'custom-toast custom-toast-success',
          },
          error: {
            duration: 5000,
            className: 'custom-toast custom-toast-error',
          },
        }}
      >
        {(t) => (
          <ToastBar toast={t}>
            {({ icon, message }) => (
              <div
                onClick={() => toast.dismiss(t.id)}
                className="toast-content"
              >
                {icon}
                <div style={{ flex: 1 }}>{message}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
                  className="toast-dismiss"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </ToastBar>
        )}
      </Toaster>
      <Suspense fallback={<div className="loading"><Spinner size={24} /></div>}>
        <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/jobcards" replace />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="jobcards" element={<JobCardList />} />
          <Route
            path="statistics"
            element={
              <ManagementRoute>
                <Statistics />
              </ManagementRoute>
            }
          />
          <Route
            path="contacts"
            element={
              <ManagementRoute>
                <ContactManagement />
              </ManagementRoute>
            }
          />
          <Route
            path="suppliers"
            element={
              <ManagementRoute>
                <SupplierManagement />
              </ManagementRoute>
            }
          />
          <Route
            path="users"
            element={
              <ManagementRoute>
                <UserManagement />
              </ManagementRoute>
            }
          />
          <Route path="equipment" element={<Navigate to="/tags" replace />} />
          <Route
            path="tags"
            element={
              <ManagementRoute>
                <TagManagement />
              </ManagementRoute>
            }
          />
          <Route
            path="labour-rates"
            element={
              <PermissionRoute permission="pricing">
                <LabourRatesSettings />
              </PermissionRoute>
            }
          />
          <Route
            path="activity"
            element={
              <PermissionRoute permission="activityTrail">
                <ActivityLog />
              </PermissionRoute>
            }
          />
          <Route path="settings" element={<Settings />} />
        </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
