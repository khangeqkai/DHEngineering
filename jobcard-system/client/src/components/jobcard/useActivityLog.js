import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useLatestRequest } from '../../hooks/useLatestRequest';
import { coalesceRuns } from '../../utils/coalesceRuns';

export function useActivityLog(jobCardId, isWindowUp) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // A failed load leaves the list empty, which on its own is indistinguishable from a
  // job that genuinely has no activity — and the screen said exactly that while the
  // pop-up said the opposite. This lets the list say which of the two it is.
  const [historyFailed, setHistoryFailed] = useState(false);

  // Which job a load has finished for (success or failure). The empty message only means
  // something once a load has finished; before that the panel shows its loading look.
  const [loadedFor, setLoadedFor] = useState(null);

  const startRequest = useLatestRequest();

  const readHistory = useCallback(async () => {
    if (!jobCardId) return;
    const isLatest = startRequest();
    setLoadingHistory(true);
    try {
      const data = await api.getJobcardHistory(jobCardId);
      if (!isLatest()) return;
      setHistory(data || []);
      setHistoryFailed(false);
      setLoadedFor(jobCardId);
    } catch (err) {
      if (!isLatest()) return;
      setHistoryFailed(true);
      setLoadedFor(jobCardId);
      // A failed read for a window that has closed has no one to tell.
      if (!isWindowUp()) return;
      toast.error("Couldn't load this job's history — press Refresh to try again.", { id: 'jobcard-activity-load-failed' });
    } finally {
      if (isLatest()) setLoadingHistory(false);
    }
  }, [jobCardId, startRequest, isWindowUp]);

  // Safe to ask for from anywhere, any number of times: a read asked for while one is in
  // flight runs once more when it settles, never two at once.
  const loadHistory = useMemo(() => coalesceRuns(readHistory), [readHistory]);

  const historyLoaded = loadedFor === jobCardId;

  return { history, historyLoaded, loadingHistory, historyFailed, loadHistory };
}
