import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export function useTimer(jobcardId, { onExternalStop } = {}) {
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const [entryForm, setEntryForm] = useState({
    items: {} // { [itemNumber]: { qty, machineNumbers, description } }
  });
  const intervalRef = useRef(null);
  const selfStoppedRef = useRef(false);

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
            toast('Your timer was stopped by an admin', { icon: '\u2139\uFE0F' });
            if (onExternalStop) onExternalStop();
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
  }, [activeTimer, jobcardId, onExternalStop]);

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
      selfStoppedRef.current = true;
      setActiveTimer(null);
      setShowEntryForm(true);
      toast.success('Timer stopped');
    } catch (err) {
      toast.error(err.message || 'Failed to stop timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, activeTimer]);

  const handleItemFieldChange = useCallback((itemNumber, field, value) => {
    setEntryForm(prev => {
      const existing = prev.items[itemNumber] || { qty: '', machineNumbers: [], description: '' };
      return {
        ...prev,
        items: { ...prev.items, [itemNumber]: { ...existing, [field]: value } }
      };
    });
  }, []);

  const handleItemMachineToggle = useCallback((itemNumber, machineNumber) => {
    setEntryForm(prev => {
      const item = prev.items[itemNumber] || { qty: '', machineNumbers: [], description: '' };
      const current = item.machineNumbers || [];
      const next = current.includes(machineNumber)
        ? current.filter(m => m !== machineNumber)
        : [...current, machineNumber];
      return {
        ...prev,
        items: { ...prev.items, [itemNumber]: { ...item, machineNumbers: next } }
      };
    });
  }, []);

  const submitEntryForm = useCallback(async (reloadEntries) => {
    if (!stoppedEntry) return;

    // Collect items with non-empty qty
    const filledItems = Object.entries(entryForm.items)
      .filter(([, item]) => item.qty && String(item.qty).trim() !== '')
      .map(([itemNumber, item]) => ({
        itemNumber: Number(itemNumber),
        qty: String(item.qty).trim(),
        machineNumbers: item.machineNumbers || [],
        description: (item.description || '').trim()
      }));

    if (filledItems.length === 0) return;

    // Combine into a single entry — one timer stop = one time entry
    const allMachines = [...new Set(filledItems.flatMap(i => i.machineNumbers))];
    const combinedItemNumber = filledItems.map(i => i.itemNumber).join(', ');
    const combinedQty = filledItems.map(i => i.qty).join(', ');
    const combinedDescription = filledItems.length === 1
      ? filledItems[0].description
      : filledItems.map(i => `#${i.itemNumber}: ${i.description}`).join('; ');

    setLoading(true);
    try {
      await api.updateTimeEntry(jobcardId, stoppedEntry.id, {
        ...stoppedEntry,
        itemNumber: combinedItemNumber,
        qty: combinedQty,
        machineNumber: allMachines.join(', '),
        description: combinedDescription
      });

      setShowEntryForm(false);
      setStoppedEntry(null);
      setEntryForm({ items: {} });
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
        startTime: stoppedEntry.startTime
      });
      setShowEntryForm(false);
      setStoppedEntry(null);
      setEntryForm({ items: {} });
      if (reloadEntries) await reloadEntries();
      toast.success('Timer resumed');
    } catch (err) {
      toast.error(err.message || 'Failed to resume timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry]);

  const resetTimer = useCallback(() => {
    setActiveTimer(null);
    setElapsed(0);
    setShowEntryForm(false);
    setStoppedEntry(null);
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
    handleItemFieldChange,
    handleItemMachineToggle,
    submitEntryForm,
    cancelEntryForm,
    loadActiveTimer,
    resetTimer
  };
}
