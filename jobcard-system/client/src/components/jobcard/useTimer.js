import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const emptyEntryForm = () => ({
  qty: '',
  scrapBinQty: '',
  scrapRecycleQty: '',
  machineNumbers: [],
  description: '',
  // Critical-job inspection checklist (null = unanswered until the worker taps Yes/No)
  firstOffInspection: null,
  inProcessValidation: null,
  measuringEquipmentVerification: null,
  equipmentChecks: null,
  equipmentChecksComments: ''
});

export function useTimer(jobcardId, { onExternalStop } = {}) {
  const { registerBeforeLogout, user } = useAuth();
  const currentUserId = user?.id;
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const [stoppedEntryJobCard, setStoppedEntryJobCard] = useState(null);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [pendingStartItem, setPendingStartItem] = useState(null);
  const intervalRef = useRef(null);
  const selfStoppedRef = useRef(false);
  const pollInFlightRef = useRef(false);
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

    // A freshly-adopted timer is ours from this moment on. Clear any leftover
    // "I stopped it myself" latch from a previous timer — otherwise the first
    // time an admin stops this new timer, the poll below would silently swallow
    // the "stopped by an admin" alert and leave a phantom running timer on screen.
    selfStoppedRef.current = false;

    const poll = setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      // Guard against overlapping checks: a slow check (>5s) would otherwise let
      // the next tick start a second check, and the two race on selfStoppedRef —
      // producing a false "stopped by an admin" message when the user stopped it.
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
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
      } finally {
        pollInFlightRef.current = false;
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [activeTimer, jobcardId]);

  const startTimerWithConflictCheck = useCallback(async (itemNumber, showConfirm, workerId, workerName) => {
    if (!Number.isInteger(itemNumber) || itemNumber < 1) {
      toast.error('Pick an item to start the timer');
      return;
    }
    // An admin can start a timer FOR another worker. When they do, the running
    // timer belongs to that person (it shows on the worker's own screen and in
    // this job's Progress list), so we must NOT adopt it as the admin's own
    // active timer here.
    const isOnBehalf = !!workerId && workerId !== currentUserId;
    setLoading(true);
    try {
      const result = await api.startTimer(jobcardId, itemNumber, workerId);
      if (isOnBehalf) {
        toast.success(`Timer started for ${workerName || 'that worker'} on item #${itemNumber}`);
      } else {
        setActiveTimer({
          id: result.id,
          jobcardId: result.jobcardId,
          itemNumber: result.itemNumber,
          startTime: result.startTime
        });
        toast.success(`Timer started on item #${itemNumber}`);
      }
    } catch (err) {
      // On-behalf: the chosen worker already has a timer running elsewhere. This
      // is their conflict, not the admin's, so just report it — the admin's own
      // stop-and-switch flow below only makes sense for the admin's own timer.
      if (isOnBehalf) {
        if (err.status === 409 || err.message.includes('Timer running on another job')) {
          const t = err.data?.activeTimer;
          toast.error(t
            ? `That worker already has a timer running on ${t.jobNumber || 'another job'}, item #${t.itemNumber}`
            : 'That worker already has a timer running');
        } else {
          toast.error(err.message || 'Failed to start timer');
        }
        return;
      }
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
              selfStoppedRef.current = true;
              const entry = await api.stopTimer(currentTimer.jobcardId, currentTimer.id);
              setActiveTimer(null);
              // If the old run was under 15s it's discarded — don't ask about it, just
              // start the new timer straight away.
              if (entry?.discarded) {
                const result = await api.startTimer(jobcardId, itemNumber);
                setActiveTimer({
                  id: result.id,
                  jobcardId: result.jobcardId,
                  itemNumber: result.itemNumber,
                  startTime: result.startTime
                });
                toast.success(`Timer started on item #${itemNumber}`);
                return;
              }
              setStoppedEntry(entry);
              if (!onSameJob) {
                setStoppedEntryJobCard({
                  id: currentTimer.jobcardId,
                  jobNumber: currentTimer.jobNumber
                });
              }
              setEntryForm(emptyEntryForm());
              setShowEntryForm(true);
              setPendingStartItem(itemNumber);
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
  }, [jobcardId, currentUserId]);

  const stopTimer = useCallback(async () => {
    if (!activeTimer) return;
    setLoading(true);
    try {
      selfStoppedRef.current = true;
      const entry = await api.stopTimer(jobcardId, activeTimer.id);
      setActiveTimer(null);
      // A run under 15s is discarded server-side — no block, no form, just a heads-up.
      if (entry?.discarded) {
        toast('Timer discarded — under 15 seconds', { icon: '🗑️' });
        return;
      }
      setStoppedEntry(entry);
      setEntryForm(emptyEntryForm());
      setShowEntryForm(true);
      toast.success('Timer stopped');
    } catch (err) {
      toast.error(err.message || 'Failed to stop timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, activeTimer]);

  // Stop a specific running entry (from the per-item Progress list) and open the
  // fill-in form so the good pieces / scrap / description get recorded — the same
  // form a worker gets when stopping their own timer. Used by an admin, who may be
  // stopping someone else's run (e.g. one they set up for a worker); when the entry
  // isn't the admin's own we must NOT adopt it as the admin's active timer.
  const stopEntryWithForm = useCallback(async (entry) => {
    if (!entry?.id) return;
    setLoading(true);
    try {
      const entryJobcardId = entry.jobcardId || jobcardId;
      const isOwnActive = activeTimer && activeTimer.id === entry.id;
      // Stopping our own running timer here behaves like the normal stop — clear it
      // and stop the background poller crying "stopped by an admin".
      if (isOwnActive) selfStoppedRef.current = true;
      const result = await api.stopTimer(entryJobcardId, entry.id);
      if (isOwnActive) setActiveTimer(null);
      // A run under 15s is discarded server-side — no block, no form, just a heads-up.
      if (result?.discarded) {
        toast('Timer discarded — under 15 seconds', { icon: '🗑️' });
        return;
      }
      setStoppedEntry(result);
      setStoppedEntryJobCard(entryJobcardId !== jobcardId
        ? { id: entryJobcardId, jobNumber: entry.jobNumber }
        : null);
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

    const hasDescription = entryForm.description && String(entryForm.description).trim() !== '';
    if (!hasDescription) return;

    const qty = String(entryForm.qty || '0').trim() || '0';
    const scrapBinQty = Math.max(0, parseInt(entryForm.scrapBinQty, 10) || 0);
    const scrapRecycleQty = Math.max(0, parseInt(entryForm.scrapRecycleQty, 10) || 0);
    const machines = (entryForm.machineNumbers || []).join(', ');
    const description = (entryForm.description || '').trim();

    const entryJobcardId = stoppedEntry.jobcardId || jobcardId;

    setLoading(true);
    try {
      await api.updateTimeEntry(entryJobcardId, stoppedEntry.id, {
        ...stoppedEntry,
        qty,
        scrapBinQty,
        scrapRecycleQty,
        machineNumber: machines,
        description,
        // Inspection answers ride along; the server stores them only on Critical jobs
        // and requires all four there before it will save.
        firstOffInspection: entryForm.firstOffInspection,
        inProcessValidation: entryForm.inProcessValidation,
        measuringEquipmentVerification: entryForm.measuringEquipmentVerification,
        equipmentChecks: entryForm.equipmentChecks,
        equipmentChecksComments: (entryForm.equipmentChecksComments || '').trim()
      });

      setShowEntryForm(false);
      setStoppedEntry(null);
      setStoppedEntryJobCard(null);
      setEntryForm(emptyEntryForm());

      if (pendingStartItem != null) {
        const nextItem = pendingStartItem;
        setPendingStartItem(null);
        try {
          const result = await api.startTimer(jobcardId, nextItem);
          setActiveTimer({
            id: result.id,
            jobcardId: result.jobcardId,
            itemNumber: result.itemNumber,
            startTime: result.startTime
          });
          toast.success(`Timer started on item #${nextItem}`);
        } catch (startErr) {
          toast.error(startErr.message || 'Failed to start new timer');
        }
      } else {
        toast.success('Time entry updated');
      }

      if (reloadEntries) await reloadEntries();
    } catch (err) {
      toast.error(err.message || 'Failed to update time entry');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry, entryForm, pendingStartItem]);

  const cancelEntryForm = useCallback(async (reloadEntries) => {
    if (!stoppedEntry) return;
    const entryJobcardId = stoppedEntry.jobcardId || jobcardId;
    const isSameJob = entryJobcardId === jobcardId;
    setLoading(true);
    try {
      await api.updateTimeEntry(entryJobcardId, stoppedEntry.id, {
        ...stoppedEntry,
        endTime: null
      });
      // Re-adopt the resumed timer as our own only when it's actually ours. An admin
      // may be resuming a run that belongs to another worker (one they stopped from
      // the Progress list) — that timer reopens for the worker, but it must not become
      // the admin's active timer. Cross-job resume: the other job's timer stays
      // running and re-attaches when that modal opens.
      if (isSameJob && stoppedEntry.userId === currentUserId) {
        setActiveTimer({
          id: stoppedEntry.id,
          jobcardId,
          itemNumber: stoppedEntry.itemNumber,
          startTime: stoppedEntry.startTime
        });
      }
      setShowEntryForm(false);
      setStoppedEntry(null);
      setStoppedEntryJobCard(null);
      setEntryForm(emptyEntryForm());
      setPendingStartItem(null);
      if (reloadEntries) await reloadEntries();
      toast.success('Timer resumed');
    } catch (err) {
      toast.error(err.message || 'Failed to resume timer');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry, currentUserId]);

  // Resume timer if user gets auto-logged out while filling StopTimerForm
  const stoppedEntryRef = useRef(null);
  useEffect(() => { stoppedEntryRef.current = stoppedEntry; }, [stoppedEntry]);

  const hasStoppedEntry = !!stoppedEntry;
  useEffect(() => {
    if (!showEntryForm || !hasStoppedEntry) return;
    return registerBeforeLogout(() => {
      const entry = stoppedEntryRef.current;
      if (!entry) return;
      // Use entry.jobcardId (not jobcardId) so cross-job stops resume on the correct job
      api.updateTimeEntry(entry.jobcardId || jobcardId, entry.id, { ...entry, endTime: null }).catch(() => {});
    });
  }, [showEntryForm, hasStoppedEntry, jobcardId, registerBeforeLogout]);

  const resetTimer = useCallback(() => {
    setActiveTimer(null);
    setElapsed(0);
    setShowEntryForm(false);
    setStoppedEntry(null);
    setStoppedEntryJobCard(null);
    setEntryForm(emptyEntryForm());
    setPendingStartItem(null);
  }, []);

  return {
    activeTimer,
    elapsed,
    loading,
    showEntryForm,
    stoppedEntry,
    stoppedEntryJobCard,
    entryForm,
    startTimerWithConflictCheck,
    stopTimer,
    stopEntryWithForm,
    handleEntryFieldChange,
    handleEntryMachineToggle,
    submitEntryForm,
    cancelEntryForm,
    loadActiveTimer,
    resetTimer
  };
}
