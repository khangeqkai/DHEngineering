import { useState, useCallback, useRef } from 'react';

// The shared skeleton behind the admin list pages (Users, Suppliers, Customers):
// a loading flag around a fetch, a "show archived" toggle, the
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

  // Every load takes a number; only the latest may touch the page. Ticking "show
  // archived" twice quickly can leave an older load in flight, and its reply
  // landing last would otherwise put the wrong list on screen and turn the spinner
  // off early. This judges only when a load started, not which view it is for —
  // so a reload after a save must run the page's newest load function (see
  // useLatestCallback), not the one captured when the button was pressed, or a
  // toggle made while the save was out reloads the view that has been left.
  const loadRequestIdRef = useRef(0);

  // Runs `fetchFn` (which only fetches, and returns what it got), keeping
  // `loading` true for its duration, then hands the result to `apply` — which
  // puts it on the page — only if no newer load has started since. A failure is
  // reported through `onError` instead of throwing, again only for the latest
  // load. Returns what `apply` returns, or null on failure or when superseded.
  // `resetLoading: false` skips flipping `loading` back to true first — one page
  // only shows the spinner on its very first load, not on every "show archived"
  // toggle, and this preserves that.
  const runLoad = useCallback(async (fetchFn, apply, onError, { resetLoading = true } = {}) => {
    const requestId = ++loadRequestIdRef.current;
    const isLatest = () => requestId === loadRequestIdRef.current;
    if (resetLoading) setLoading(true);
    try {
      const data = await fetchFn();
      return isLatest() ? apply(data) : null;
    } catch (err) {
      if (isLatest()) onError(err);
      return null;
    } finally {
      if (isLatest()) setLoading(false);
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
