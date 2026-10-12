import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { formatElapsed, elapsedSecondsSince } from '../utils/formatters';
import { useFinishQuestion } from '../context/FinishQuestionContext';

export function useActiveTimerIndicator() {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);
  const requestId = useRef(0);
  // A clock that vanishes may have been stopped by the server itself (a forgotten
  // clock) — the signed-in shell is asked to re-check for its "when did you finish?"
  // question the moment that happens. No toast here; the question explains itself.
  const finishQuestion = useFinishQuestion();
  const refreshFinishQuestionRef = useRef(finishQuestion?.refresh);
  refreshFinishQuestionRef.current = finishQuestion?.refresh;
  const takeOwnStopRef = useRef(finishQuestion?.takeOwnStop);
  takeOwnStopRef.current = finishQuestion?.takeOwnStop;
  const hadTimerRef = useRef(false);
  const lastTimerIdRef = useRef(null);

  const fetchTimer = useCallback(async () => {
    // Tag each poll so a slow response that resolves out of order can't
    // overwrite a newer one and flicker the indicator to a stale state.
    const id = ++requestId.current;
    try {
      const timer = await api.getActiveTimer();
      if (id === requestId.current) {
        const next = timer || null;
        // A different clock being here proves any earlier note of this screen's own stop is
        // spent (that stop was never seen vanishing, e.g. a part switch between two polls).
        // Left live, it would excuse the next vanish — maybe a real server cut — for 30s.
        if (next && next.id !== lastTimerIdRef.current) takeOwnStopRef.current?.();
        if (hadTimerRef.current && !next) {
          // A stop this very screen just made is never the server's doing: no need to ask.
          const ownStop = takeOwnStopRef.current?.() === true;
          if (!ownStop) refreshFinishQuestionRef.current?.();
        }
        hadTimerRef.current = Boolean(next);
        if (next) lastTimerIdRef.current = next.id;
        setActiveTimer(next);
      }
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
