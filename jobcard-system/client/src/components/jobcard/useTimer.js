import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const emptyEntryForm = () => ({ qty: '', machineNumbers: [], description: '' });

export function useTimer(jobcardId, { onExternalStop } = {}) {
  const { registerBeforeLogout } = useAuth();
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const intervalRef = useRef(null);
  const selfStoppedRef = useRef(false);
  const onExternalStopRef = useRef(onExternalStop);
  onExternalStopRef.current = onExternalStop;

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

  // Poll for external stops (e.g. admin stopped the timer)
  useEffect(() => {
    if (!activeTimer || !jobcardId) return;

    const poll = setInterval(async () => {
      try {
        const current = await api.getActiveTimer();
        if (!current || current.id !== activeTimer.id) {
          if (!selfStoppedRef.current) {
            toast('Your timer was stopped by an admin', { icon: 'ℹ️' });
            if (onExternalStopRef.current) onExternalStopRef.current();
          }
          selfStoppedRef.current = false;
          setActiveTimer(null);
          setElapsed(0);
        }
      } catch {
        // Ignore poll errors — network hiccups should not surface to user
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [activeTimer, jobcardId]);

  const startTimer = useCallback(async (itemNumber) => {
    if (!Number.isInteger(itemNumber) || itemNumber < 1) {
      toast.error('Pick an item to start the timer');
      return;
    }
    setLoading(true);
    try {
      const result = await api.startTimer(jobcardId, itemNumber);
      setActiveTimer({
        id: result.id,
        jobcardId: result.jobcardId,
        itemNumber: result.itemNumber,
        startTime: result.startTime
      });
      toast.success(`Timer started on item #${itemNumber}`);
    } catch (err) {
      toast.error(err.message || 'Failed to start timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId]);

  const startTimerWithConflictCheck = useCallback(async (itemNumber, showConfirm) => {
    if (!Number.isInteger(itemNumber) || itemNumber < 1) {
      toast.error('Pick an item to start the timer');
      return;
    }
    setLoading(true);
    try {
      const result = await api.startTimer(jobcardId, itemNumber);
      setActiveTimer({
        id: result.id,
        jobcardId: result.jobcardId,
        itemNumber: result.itemNumber,
        startTime: result.startTime
      });
      toast.success(`Timer started on item #${itemNumber}`);
    } catch (err) {
      // Check for 409 conflict (timer running on another job/item)
      if (err.message.includes('Timer running on another job')) {
        try {
          const currentTimer = await api.getActiveTimer();
          if (currentTimer && showConfirm) {
            const onSameJob = currentTimer.jobcardId === jobcardId;
            const message = onSameJob
              ? `Stop timer on item #${currentTimer.itemNumber} and start on item #${itemNumber}?`
              : `Stop timer on ${currentTimer.jobNumber || 'another job'} and start here?`;
            const shouldSwitch = await showConfirm({
              title: 'Timer Running',
              message,
              confirmLabel: 'Stop & Start',
              cancelLabel: 'Cancel',
              confirmVariant: 'primary'
            });
            if (shouldSwitch) {
              await api.stopTimer(currentTimer.jobcardId, currentTimer.id);
              const result = await api.startTimer(jobcardId, itemNumber);
              setActiveTimer({
                id: result.id,
                jobcardId: result.jobcardId,
                itemNumber: result.itemNumber,
                startTime: result.startTime
              });
              toast.success(`Timer started on item #${itemNumber}`);
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
      selfStoppedRef.current = true;
      setActiveTimer(null);
      setEntryForm(emptyEntryForm());
      setShowEntryForm(true);
      toast.success('Timer stopped');
    } catch (err) {
      toast.error(err.message || 'Failed to stop timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, activeTimer]);

  const handleEntryFieldChange = useCallback((field, value) => {
    setEntryForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleEntryMachineToggle = useCallback((machineNumber) => {
    setEntryForm(prev => {
      const current = prev.machineNumbers || [];
      const next = current.includes(machineNumber)
        ? current.filter(m => m !== machineNumber)
        : [...current, machineNumber];
      return { ...prev, machineNumbers: next };
    });
  }, []);

  const submitEntryForm = useCallback(async (reloadEntries) => {
    if (!stoppedEntry) return;

    const hasMachines = (entryForm.machineNumbers || []).length > 0;
    const hasDescription = entryForm.description && String(entryForm.description).trim() !== '';
    if (!hasMachines && !hasDescription) return;

    const qty = String(entryForm.qty || '0').trim() || '0';
    const machines = (entryForm.machineNumbers || []).join(', ');
    const description = (entryForm.description || '').trim();

    setLoading(true);
    try {
      await api.updateTimeEntry(jobcardId, stoppedEntry.id, {
        ...stoppedEntry,
        qty,
        machineNumber: machines,
        description
      });

      setShowEntryForm(false);
      setStoppedEntry(null);
      setEntryForm(emptyEntryForm());
      if (reloadEntries) await reloadEntries();
      toast.success('Time entry updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update time entry');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry, entryForm]);

  const cancelEntryForm = useCallback(async (reloadEntries) => {
    if (!stoppedEntry) return;
    setLoading(true);
    try {
      // Clear end_time to resume the original entry (preserves original startTime)
      await api.updateTimeEntry(jobcardId, stoppedEntry.id, {
        ...stoppedEntry,
        endTime: null
      });
      setActiveTimer({
        id: stoppedEntry.id,
        jobcardId,
        itemNumber: stoppedEntry.itemNumber,
        startTime: stoppedEntry.startTime
      });
      setShowEntryForm(false);
      setStoppedEntry(null);
      setEntryForm(emptyEntryForm());
      if (reloadEntries) await reloadEntries();
      toast.success('Timer resumed');
    } catch (err) {
      toast.error(err.message || 'Failed to resume timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry]);

  // Resume timer if user gets auto-logged out while filling StopTimerForm
  const stoppedEntryRef = useRef(null);
  useEffect(() => { stoppedEntryRef.current = stoppedEntry; }, [stoppedEntry]);

  const hasStoppedEntry = !!stoppedEntry;
  useEffect(() => {
    if (!showEntryForm || !hasStoppedEntry) return;
    return registerBeforeLogout(() => {
      const entry = stoppedEntryRef.current;
      if (!entry) return;
      // Fire-and-forget: clear end_time to resume the timer
      api.updateTimeEntry(jobcardId, entry.id, { ...entry, endTime: null }).catch(() => {});
    });
  }, [showEntryForm, hasStoppedEntry, jobcardId, registerBeforeLogout]);

  const resetTimer = useCallback(() => {
    setActiveTimer(null);
    setElapsed(0);
    setShowEntryForm(false);
    setStoppedEntry(null);
    setEntryForm(emptyEntryForm());
  }, []);

  return {
    activeTimer,
    elapsed,
    loading,
    showEntryForm,
    stoppedEntry,
    entryForm,
    startTimer,
    startTimerWithConflictCheck,
    stopTimer,
    handleEntryFieldChange,
    handleEntryMachineToggle,
    submitEntryForm,
    cancelEntryForm,
    loadActiveTimer,
    resetTimer
  };
}
