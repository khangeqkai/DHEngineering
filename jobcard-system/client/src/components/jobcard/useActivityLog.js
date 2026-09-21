import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export function useActivityLog(jobCardId) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // A failed load leaves the list empty, which on its own is indistinguishable from a
  // job that genuinely has no activity — and the screen said exactly that while the
  // pop-up said the opposite. This lets the list say which of the two it is.
  const [historyFailed, setHistoryFailed] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!jobCardId) return;
    setLoadingHistory(true);
    try {
      const data = await api.getJobcardHistory(jobCardId);
      setHistory(data || []);
      setHistoryFailed(false);
    } catch (err) {
      setHistoryFailed(true);
      toast.error('Could not load the activity list — press Refresh to try again.', { id: 'jobcard-activity-load-failed' });
    } finally {
      setLoadingHistory(false);
    }
  }, [jobCardId]);

  const resetHistory = useCallback(() => {
    setHistory([]);
    setHistoryFailed(false);
  }, []);

  return { history, loadingHistory, historyFailed, loadHistory, resetHistory };
}
