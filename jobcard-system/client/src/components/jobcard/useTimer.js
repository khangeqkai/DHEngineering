import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export function useTimer(jobcardId) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showQaForm, setShowQaForm] = useState(false);
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const [qaForm, setQaForm] = useState({
    machineNumber: '',
    itemNumber: '',
    qty: '',
    description: '',
    equipmentChecksDone: false,
    measuringVerificationDone: false,
    firstOffInspection: 'NOT_APPLICABLE',
    firstOffInspectionNotes: '',
    inProcessValidation: 'NOT_APPLICABLE',
    inProcessValidationNotes: '',
    scrapAllGood: true,
    scrapRecycleInhouseQty: 0,
    scrapRecycleBinQty: 0
  });
  const intervalRef = useRef(null);

  const loadActiveTimer = useCallback(async () => {
    try {
      const timer = await api.getActiveTimer();
      if (timer && timer.jobcardId === jobcardId) {
        setActiveTimer(timer);
      } else {
        setActiveTimer(null);
      }
    } catch (err) {
      // Silently fail - timer just won't show
    }
  }, [jobcardId]);

  // Calculate elapsed time
  useEffect(() => {
    if (activeTimer) {
      const updateElapsed = () => {
        const start = new Date(activeTimer.startTime).getTime();
        const now = Date.now();
        setElapsed(Math.floor((now - start) / 1000));
      };
      updateElapsed();
      intervalRef.current = setInterval(updateElapsed, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [activeTimer]);

  // Load on mount
  useEffect(() => {
    if (jobcardId) {
      loadActiveTimer();
    }
  }, [jobcardId, loadActiveTimer]);

  const startTimer = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.startTimer(jobcardId);
      setActiveTimer({
        id: result.id,
        jobcardId: result.jobcardId,
        startTime: result.startTime
      });
      toast.success('Timer started');
    } catch (err) {
      if (err.message.includes('Timer running on another job')) {
        // Parse the 409 response - need to handle via raw fetch
        toast.error('Stop your timer on another job first');
      } else {
        toast.error(err.message || 'Failed to start timer');
      }
    } finally {
      setLoading(false);
    }
  }, [jobcardId]);

  const startTimerWithConflictCheck = useCallback(async (showConfirm) => {
    setLoading(true);
    try {
      const result = await api.startTimer(jobcardId);
      setActiveTimer({
        id: result.id,
        jobcardId: result.jobcardId,
        startTime: result.startTime
      });
      toast.success('Timer started');
    } catch (err) {
      // Check for 409 conflict
      if (err.message.includes('Timer running on another job')) {
        try {
          // Get active timer details
          const currentTimer = await api.getActiveTimer();
          if (currentTimer && showConfirm) {
            const shouldSwitch = await showConfirm({
              title: 'Timer Running',
              message: `Stop timer on ${currentTimer.jobNumber || 'another job'} and start here?`,
              confirmLabel: 'Stop & Start',
              cancelLabel: 'Cancel',
              confirmVariant: 'primary'
            });
            if (shouldSwitch) {
              await api.stopTimer(currentTimer.jobcardId, currentTimer.id);
              // Now start on this job
              const result = await api.startTimer(jobcardId);
              setActiveTimer({
                id: result.id,
                jobcardId: result.jobcardId,
                startTime: result.startTime
              });
              toast.success('Timer started');
            }
          }
        } catch (innerErr) {
          toast.error(innerErr.message || 'Failed to switch timer');
        }
      } else {
        toast.error(err.message || 'Failed to start timer');
      }
    } finally {
      setLoading(false);
    }
  }, [jobcardId]);

  const stopTimer = useCallback(async () => {
    if (!activeTimer) return;
    setLoading(true);
    try {
      const entry = await api.stopTimer(jobcardId, activeTimer.id);
      setStoppedEntry(entry);
      setActiveTimer(null);
      setShowQaForm(true);
      toast.success('Timer stopped');
    } catch (err) {
      toast.error(err.message || 'Failed to stop timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, activeTimer]);

  const handleQaChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setQaForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }, []);

  const submitQaFields = useCallback(async (reloadEntries) => {
    if (!stoppedEntry) return;
    setLoading(true);
    try {
      await api.updateTimeEntry(jobcardId, stoppedEntry.id, {
        ...stoppedEntry,
        ...qaForm
      });
      setShowQaForm(false);
      setStoppedEntry(null);
      setQaForm({
        machineNumber: '',
        itemNumber: '',
        qty: '',
        description: '',
        equipmentChecksDone: false,
        measuringVerificationDone: false,
        firstOffInspection: 'NOT_APPLICABLE',
        firstOffInspectionNotes: '',
        inProcessValidation: 'NOT_APPLICABLE',
        inProcessValidationNotes: '',
        scrapAllGood: true,
        scrapRecycleInhouseQty: 0,
        scrapRecycleBinQty: 0
      });
      if (reloadEntries) await reloadEntries();
      toast.success('Time entry updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update time entry');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry, qaForm]);

  const skipQaForm = useCallback(async (reloadEntries) => {
    setShowQaForm(false);
    setStoppedEntry(null);
    if (reloadEntries) await reloadEntries();
  }, []);

  const resetTimer = useCallback(() => {
    setActiveTimer(null);
    setElapsed(0);
    setShowQaForm(false);
    setStoppedEntry(null);
  }, []);

  return {
    activeTimer,
    elapsed,
    loading,
    showQaForm,
    stoppedEntry,
    qaForm,
    startTimer,
    startTimerWithConflictCheck,
    stopTimer,
    handleQaChange,
    submitQaFields,
    skipQaForm,
    loadActiveTimer,
    resetTimer
  };
}
