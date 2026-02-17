import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export function useActivityLog(jobCardId) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!jobCardId) return;
    setLoadingHistory(true);
    try {
      const data = await api.getJobcardHistory(jobCardId);
      setHistory(data || []);
    } catch (err) {
      toast.error('Failed to load activity log');
    } finally {
      setLoadingHistory(false);
    }
  }, [jobCardId]);

  const resetHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, loadingHistory, loadHistory, resetHistory };
}
