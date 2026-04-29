import { Routes, Route, Navigate } from 'react-router-dom';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import JobCardList from './components/JobCardList';
import UserManagement from './components/UserManagement';
import ContactManagement from './components/ContactManagement';
import SupplierManagement from './components/SupplierManagement';
import ActivityLog from './components/ActivityLog';
import QALevelManagement from './components/QALevelManagement';
import TagManagement from './components/TagManagement';
import Settings from './components/Settings';
import SearchPage from './components/SearchPage';
import Layout from './components/Layout';
import './App.css';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" />;
  }

  return children;
}

const getCssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

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
            iconTheme: {
              primary: getCssVar('--success-color') || '#22c55e',
              secondary: getCssVar('--text-inverse') || '#fff',
            },
          },
          error: {
            duration: 5000,
            className: 'custom-toast custom-toast-error',
            iconTheme: {
              primary: getCssVar('--danger-color') || '#ef4444',
              secondary: getCssVar('--text-inverse') || '#fff',
            },
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
                  ✕
                </button>
              </div>
            )}
          </ToastBar>
        )}
      </Toaster>
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
          path="contacts"
          element={
            <AdminRoute>
              <ContactManagement />
            </AdminRoute>
          }
        />
        <Route
          path="suppliers"
          element={
            <AdminRoute>
              <SupplierManagement />
            </AdminRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          }
        />
        <Route path="equipment" element={<Navigate to="/tags" replace />} />
        <Route
          path="tags"
          element={
            <AdminRoute>
              <TagManagement />
            </AdminRoute>
          }
        />
        <Route
          path="qa-levels"
          element={
            <AdminRoute>
              <QALevelManagement />
            </AdminRoute>
          }
        />
        <Route
          path="activity"
          element={
            <AdminRoute>
              <ActivityLog />
            </AdminRoute>
          }
        />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
