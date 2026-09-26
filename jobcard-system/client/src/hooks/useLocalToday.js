import { useState, useEffect, useCallback, useRef } from 'react';
import { todayIsoDate } from '../utils/formatters';

// Milliseconds until one second past the next local midnight — the small buffer
// keeps a timer firing a hair early (setTimeout drift) from re-reading the clock
// while it's still technically yesterday.
function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return next.getTime() - now.getTime();
}

// Today's local calendar date as "YYYY-MM-DD" (same shape as todayIsoDate()),
// kept current for as long as the caller stays mounted. A screen left open
// overnight — the job list, most often — would otherwise go on reading
// yesterday's date forever, so a job due today would never actually flip to
// overdue until the page was reloaded. This re-reads the clock right after the
// next local midnight (and reschedules itself for the one after that), and also
// on window focus / visibilitychange, which covers a laptop that slept through
// midnight or a background tab a plain timer can't be relied on to fire in.
export function useLocalToday() {
  const [today, setToday] = useState(todayIsoDate);
  const timeoutRef = useRef(null);

  const refresh = useCallback(() => {
    setToday((prev) => {
      const next = todayIsoDate();
      return next === prev ? prev : next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const scheduleNext = () => {
      timeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        refresh();
        scheduleNext();
      }, msUntilNextMidnight());
    };
    scheduleNext();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      refresh();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [refresh]);

  return today;
}

export default useLocalToday;
