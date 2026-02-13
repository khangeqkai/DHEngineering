import { useState, useEffect, useCallback, useRef } from 'react';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes default
const WARNING_DURATION_MS = 30 * 1000;      // 30 seconds warning

export function useInactivityTimer({ onTimeout, enabled = true, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const [isWarningActive, setIsWarningActive] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const timeoutRef = useRef(null);
  const warningRef = useRef(null);
  const countdownRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const timeoutStartRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);

  // Keep onTimeout ref updated to avoid stale closure
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    timeoutStartRef.current = now;
    setIsWarningActive(false);
    setSecondsRemaining(0);
    clearAllTimers();

    if (!enabled || timeoutMs <= 0) return;

    const warningStartMs = Math.max(timeoutMs - WARNING_DURATION_MS, 0);
    const actualWarningDuration = timeoutMs - warningStartMs;

    // Set warning timer (fires 30 seconds before timeout)
    warningRef.current = setTimeout(() => {
      setIsWarningActive(true);
      // Start at warning duration, stop at 1 (not 0) to avoid showing 0
      setSecondsRemaining(Math.floor(actualWarningDuration / 1000));

      // Start countdown - stops at 1 to avoid showing 0 before logout
      countdownRef.current = setInterval(() => {
        setSecondsRemaining(prev => Math.max(prev - 1, 1));
      }, 1000);
    }, warningStartMs);

    // Set final timeout
    timeoutRef.current = setTimeout(() => {
      clearAllTimers();
      setIsWarningActive(false);
      setSecondsRemaining(0);
      onTimeoutRef.current?.();
    }, timeoutMs);
  }, [enabled, timeoutMs, clearAllTimers]);

  // Handle system sleep/wake by checking elapsed time on visibility change
  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Window just became visible (wake from sleep, tab switch back, etc.)
        const elapsed = Date.now() - timeoutStartRef.current;

        if (elapsed >= timeoutMs) {
          // Should have timed out during sleep - trigger logout now
          clearAllTimers();
          setIsWarningActive(false);
          setSecondsRemaining(0);
          onTimeoutRef.current?.();
        } else if (elapsed >= timeoutMs - WARNING_DURATION_MS) {
          // In warning period - update countdown to correct value
          const remaining = Math.max(Math.ceil((timeoutMs - elapsed) / 1000), 1);
          setSecondsRemaining(remaining);
          setIsWarningActive(true);

          // Start countdown interval if not already running
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = setInterval(() => {
            setSecondsRemaining(prev => Math.max(prev - 1, 1));
          }, 1000);
        }
        // Otherwise, timers are still valid - no action needed
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, timeoutMs, clearAllTimers]);

  // Throttled activity handler
  const handleActivity = useCallback(() => {
    // Throttle to max once per second
    if (Date.now() - lastActivityRef.current < 1000) return;
    resetTimer();
  }, [resetTimer]);

  // Cleanup on unmount or when disabled
  useEffect(() => {
    if (enabled && timeoutMs > 0) {
      resetTimer();
    } else {
      clearAllTimers();
      setIsWarningActive(false);
      setSecondsRemaining(0);
    }

    return () => {
      clearAllTimers();
    };
  }, [enabled, timeoutMs, resetTimer, clearAllTimers]);

  return {
    isWarningActive,
    secondsRemaining,
    resetTimer,
    handleActivity
  };
}
