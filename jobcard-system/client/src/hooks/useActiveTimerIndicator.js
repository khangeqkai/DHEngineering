import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useActiveTimerIndicator() {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  const fetchTimer = useCallback(async () => {
    try {
      const timer = await api.getActiveTimer();
      setActiveTimer(timer || null);
    } catch {
      setActiveTimer(null);
    }
  }, []);

  useEffect(() => {
    fetchTimer();
  }, [fetchTimer]);

  useEffect(() => {
    if (activeTimer) {
      const updateElapsed = () => {
        const start = new Date(activeTimer.startTime).getTime();
        setElapsed(Math.floor((Date.now() - start) / 1000));
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
