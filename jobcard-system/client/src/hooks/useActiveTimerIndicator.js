import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { formatElapsed, elapsedSecondsSince } from '../utils/formatters';

export function useActiveTimerIndicator() {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const requestId = useRef(0);

  const fetchTimer = useCallback(async () => {
    // Tag each poll so a slow response that resolves out of order can't
    // overwrite a newer one and flicker the indicator to a stale state.
    const id = ++requestId.current;
    try {
      const timer = await api.getActiveTimer();
      if (id === requestId.current) setActiveTimer(timer || null);
    } catch {
      if (id === requestId.current) setActiveTimer(null);
    }
  }, []);

  useEffect(() => {
    fetchTimer();
    // Poll every 10s for external timer changes
    const pollInterval = setInterval(fetchTimer, 10000);
    return () => clearInterval(pollInterval);
  }, [fetchTimer]);

  useEffect(() => {
    if (activeTimer) {
      const updateElapsed = () => {
        setElapsed(elapsedSecondsSince(activeTimer.startTime));
      };
      updateElapsed();
      intervalRef.current = setInterval(updateElapsed, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [activeTimer]);

  return {
    activeTimerJobcardId: activeTimer?.jobcardId || null,
    elapsed,
    formattedElapsed: formatElapsed(elapsed),
    refresh: fetchTimer
  };
}
