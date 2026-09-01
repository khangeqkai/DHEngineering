import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { useInactivityTimer } from '../hooks/useInactivityTimer';

const AuthContext = createContext(null);

const DEFAULT_TIMEOUT_MINUTES = 5;
const SESSION_POLL_MS = 5000;
// How long signing out waits for last-moment work to land before cancelling the
// pass. Long enough for one save on a slow network, short enough to never feel
// like the Sign Out button is stuck.
const BEFORE_LOGOUT_GRACE_MS = 3000;

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
    // Work that has to land while the pass is still good — putting a half-stopped
    // run back on the clock. The server tears the pass up the moment we sign out,
    // so cancel the session only once this has finished, or the put-back is refused
    // and the worker silently loses their run. Capped so a server that never
    // answers can't hold the sign-out open.
    const pending = beforeLogoutCallbacksRef.current.map(cb => cb());
    clearInterval(pollRef.current);
    // Forgets the pass here immediately; hands back the server-side cancel to
    // run once that last-moment work has landed. It never rejects.
    const cancelSession = api.beginLogout();
    setUser(null);
    Promise.race([
      Promise.allSettled(pending),
      new Promise(resolve => setTimeout(resolve, BEFORE_LOGOUT_GRACE_MS))
    ]).then(cancelSession);
  }, []);

  // A browser can keep a whole page alive when you navigate away and hand it
  // back on the Back button, memory and all — which on a shared machine put the
  // previous person straight back in, still signed in. Treat a page that comes
  // back that way as a fresh start and sign out.
  useEffect(() => {
    if (!user) return undefined;
    const handleRestore = (event) => {
      if (!event.persisted) return;
      logout();
      toast.error('You were signed out for safety. Please sign in again.');
    };
    window.addEventListener('pageshow', handleRestore);
    return () => window.removeEventListener('pageshow', handleRestore);
  }, [user, logout]);

  // Register session invalidation handler
  useEffect(() => {
    api.setOnSessionInvalidated((code) => {
      clearInterval(pollRef.current);
      api.setToken(null);
      setUser(null);
      const message = code === 'ACCOUNT_DEACTIVATED'
        ? 'You have been signed out because your account was turned off.'
        : 'You have been signed out because your account was logged in from another device.';
      toast.error(message);
    });
    return () => api.setOnSessionInvalidated(null);
  }, []);

  // Swap ONLY the role. Never adopt the whole fresh profile: an in-flight
  // preference save (updatePreferences) would be reverted by a profile that was
  // fetched just before it landed.
  const applyRole = useCallback((role) => {
    setUser(prev => (prev && role && prev.role !== role ? { ...prev, role } : prev));
  }, []);

  // Poll session validity so stale sessions get kicked promptly, and pick up a
  // role change (someone demoted/promoted us) without forcing a sign-out. The
  // effect re-runs on every user change, so knownRole is never stale.
  useEffect(() => {
    if (!user) return undefined;
    const knownRole = user.role;
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await api.getMe();
        if (fresh?.role && fresh.role !== knownRole) {
          applyRole(fresh.role);
          toast('Your access level was changed. The screen has been updated to match.', { duration: 6000 });
        }
      } catch {
        // A 401 is handled by the forced sign-out handler above; anything else
        // is a blip and the next tick retries.
      }
    }, SESSION_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [user, applyRole]);

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

  // Inactivity timer - active while logged in, except for admins (they stay
  // signed in; the timeout exists for shared shop-floor workstations)
  const {
    isWarningActive,
    secondsRemaining,
    resetTimer,
    handleActivity
  } = useInactivityTimer({
    onTimeout: logout,
    enabled: !!user && user.role !== 'admin',
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
      applyRole,
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
