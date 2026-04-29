import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useInactivityTimer } from '../hooks/useInactivityTimer';

const AuthContext = createContext(null);

const DEFAULT_TIMEOUT_MINUTES = 5;
const SESSION_POLL_MS = 5000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false); // No token check needed on mount
  const [inactivityTimeoutMs, setInactivityTimeoutMs] = useState(DEFAULT_TIMEOUT_MINUTES * 60 * 1000);
  const pollRef = useRef(null);
  const beforeLogoutCallbacksRef = useRef([]);

  const registerBeforeLogout = useCallback((callback) => {
    beforeLogoutCallbacksRef.current.push(callback);
    return () => {
      beforeLogoutCallbacksRef.current = beforeLogoutCallbacksRef.current.filter(cb => cb !== callback);
    };
  }, []);

  const logout = useCallback(() => {
    beforeLogoutCallbacksRef.current.forEach(cb => cb());
    clearInterval(pollRef.current);
    api.setToken(null);
    setUser(null);
  }, []);

  // Register session invalidation handler
  useEffect(() => {
    api.setOnSessionInvalidated(() => {
      clearInterval(pollRef.current);
      api.setToken(null);
      setUser(null);
      toast.error('You have been signed out because your account was logged in from another device.');
    });
    return () => api.setOnSessionInvalidated(null);
  }, []);

  // Poll session validity so stale sessions get kicked promptly
  useEffect(() => {
    if (user) {
      pollRef.current = setInterval(() => {
        api.getMe().catch(() => {});
      }, SESSION_POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [user]);

  // Load inactivity timeout from server
  const loadInactivityTimeout = useCallback(async () => {
    try {
      const { inactivityTimeoutMinutes } = await api.getInactivityTimeout();
      setInactivityTimeoutMs((inactivityTimeoutMinutes || DEFAULT_TIMEOUT_MINUTES) * 60 * 1000);
    } catch (err) {
      // Use default if fetch fails
      setInactivityTimeoutMs(DEFAULT_TIMEOUT_MINUTES * 60 * 1000);
    }
  }, []);

  // Inactivity timer - only active when user is logged in
  const {
    isWarningActive,
    secondsRemaining,
    resetTimer,
    handleActivity
  } = useInactivityTimer({
    onTimeout: logout,
    enabled: !!user,
    timeoutMs: inactivityTimeoutMs
  });

  const login = async (username, password) => {
    const response = await api.login(username, password);
    api.setToken(response.token);
    
    // Fetch full user profile to get preferences
    const fullUser = await api.getMe();
    setUser(fullUser);
    
    await loadInactivityTimeout();
    return fullUser;
  };

  const updatePreferences = async (preferences) => {
    await api.updatePreferences(preferences);
    setUser(prev => ({ ...prev, ...preferences }));
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      isWarningActive,
      secondsRemaining,
      resetInactivityTimer: resetTimer,
      handleActivity,
      refreshInactivityTimeout: loadInactivityTimeout,
      registerBeforeLogout,
      updatePreferences
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
