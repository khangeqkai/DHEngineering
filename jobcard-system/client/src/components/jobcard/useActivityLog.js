import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useLatestRequest } from '../../hooks/useLatestRequest';

export function useActivityLog(jobCardId) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // A failed load leaves the list empty, which on its own is indistinguishable from a
  // job that genuinely has no activity — and the screen said exactly that while the
  // pop-up said the opposite. This lets the list say which of the two it is.
  const [historyFailed, setHistoryFailed] = useState(false);

  const startRequest = useLatestRequest();

  const loadHistory = useCallback(async () => {
    if (!jobCardId) return;
    const isLatest = startRequest();
    setLoadingHistory(true);
    try {
      const data = await api.getJobcardHistory(jobCardId);
      if (!isLatest()) return;
      setHistory(data || []);
      setHistoryFailed(false);
    } catch (err) {
      if (!isLatest()) return;
      setHistoryFailed(true);
      toast.error('Could not load the activity list — press Refresh to try again.', { id: 'jobcard-activity-load-failed' });
    } finally {
      if (isLatest()) setLoadingHistory(false);
    }
  }, [jobCardId, startRequest]);

  const resetHistory = useCallback(() => {
    startRequest(); // a load still out for the job just left must not land on the next one
    setHistory([]);
    setHistoryFailed(false);
  }, [startRequest]);

  return { history, loadingHistory, historyFailed, loadHistory, resetHistory };
}
