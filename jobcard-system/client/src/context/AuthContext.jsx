import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useInactivityTimer } from '../hooks/useInactivityTimer';

const AuthContext = createContext(null);

const DEFAULT_TIMEOUT_MINUTES = 5;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false); // No token check needed on mount
  const [inactivityTimeoutMs, setInactivityTimeoutMs] = useState(DEFAULT_TIMEOUT_MINUTES * 60 * 1000);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  // Load inactivity timeout from server
  const loadInactivityTimeout = useCallback(async () => {
    try {
      const { inactivity_timeout_minutes } = await api.getInactivityTimeout();
      setInactivityTimeoutMs((inactivity_timeout_minutes || DEFAULT_TIMEOUT_MINUTES) * 60 * 1000);
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
    setUser(response.user);
    await loadInactivityTimeout();
    return response.user;
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
      refreshInactivityTimeout: loadInactivityTimeout
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
