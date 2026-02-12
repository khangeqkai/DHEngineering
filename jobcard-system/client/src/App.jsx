import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import JobCardList from './components/JobCardList';
import UserManagement from './components/UserManagement';
import CustomerManagement from './components/CustomerManagement';
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
        <Route path="customers" element={<CustomerManagement />} />
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
  );
}

export default App;
