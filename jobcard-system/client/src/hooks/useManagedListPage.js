import { useState, useCallback } from 'react';

// The shared skeleton behind the admin list pages (Users, Suppliers, Customers,
// QA Levels): a loading flag around a fetch, a "show archived" toggle, the
// pendingId guard that stops a second click on an archive/restore row while the
// first is still in flight, and the activity-log refresh key. Each page keeps
// its own wording, its own columns, and the exact order it calls these in —
// this hook only owns the state and the two small pieces of sequencing (load,
// and mark-busy/run/clear-busy) that are identical everywhere they appear.
export function useManagedListPage({ initialShowArchived = false } = {}) {
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(initialShowArchived);
  const [pendingId, setPendingId] = useState(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showActivityLog, setShowActivityLog] = useState(false);

  // Runs `fetchFn`, keeping `loading` true for its duration, and reports any
  // failure through `onError` instead of throwing. Returns whatever `fetchFn`
  // returns, or null on failure. `resetLoading: false` skips flipping `loading`
  // back to true first — one page only shows the spinner on its very first
  // load, not on every "show archived" toggle, and this preserves that.
  const runLoad = useCallback(async (fetchFn, onError, { resetLoading = true } = {}) => {
    if (resetLoading) setLoading(true);
    try {
      return await fetchFn();
    } catch (err) {
      onError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const bumpActivity = useCallback(() => setActivityRefreshKey(k => k + 1), []);

  // The "mark busy, run, clear busy" half of the double-click guard. Callers
  // check `pendingId !== null` themselves before this — for an archive that
  // asks a confirm question first, that check happens before the question is
  // shown, and `runPending` only wraps what happens once the answer is yes, so
  // a row never reads as busy while its confirm dialog is still open.
  const runPending = useCallback(async (id, action) => {
    setPendingId(id);
    try {
      await action();
    } finally {
      setPendingId(null);
    }
  }, []);

  return {
    loading, setLoading,
    showArchived, setShowArchived,
    pendingId, setPendingId, runPending,
    activityRefreshKey, bumpActivity,
    showActivityLog, setShowActivityLog,
    runLoad
  };
}
