import { Routes, Route, Navigate } from 'react-router-dom';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import JobCardList from './components/JobCardList';
import UserManagement from './components/UserManagement';
import ContactManagement from './components/ContactManagement';
import SupplierManagement from './components/SupplierManagement';
import ActivityLog from './components/ActivityLog';
import Settings from './components/Settings';
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

function App() {
  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#333',
            color: '#fff',
            cursor: 'pointer',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      >
        {(t) => (
          <ToastBar toast={t}>
            {({ icon, message }) => (
              <div
                onClick={() => toast.dismiss(t.id)}
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', width: '100%' }}
              >
                {icon}
                <div style={{ flex: 1 }}>{message}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '0 0 0 8px',
                    opacity: 0.7,
                  }}
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
        <Route index element={<Dashboard />} />
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
