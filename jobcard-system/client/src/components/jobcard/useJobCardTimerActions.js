import { useCallback } from 'react';
import { api } from '../../services/api';
import { isTimeLocked, showTimeLockedToast } from './timeLock';

/**
 * Orchestrates the timer and time-entry actions JobCardModal wires into the
 * screen — starting/stopping a timer, the stop-timer fill-in form, and the
 * admin's manual add/edit form. Split out of JobCardModal.jsx purely to stop that
 * file growing any longer; every dependency below is something JobCardModal
 * already holds, just handed in instead of closed over.
 *
 * A part is identified to the server by its permanent id (itemId) throughout —
 * displayNumber only ever reaches the user, in a toast or a confirm prompt.
 */
export function useJobCardTimerActions({
  jobCardId,
  canSeePricing,
  isInvoiced = false,
  costingLoaded,
  refreshCosting,
  refreshJobStatus,
  reloadTimeEntries,
  timer,
  showConfirm,
  creditAssignee,
  dropAssignee,
  employees,
  currentUserId,
  setFormData,
  onTimerChange,
  // Raised after a hand-added, edited or deleted block: the server may have moved the
  // job's status or put the worker on it, so the job list reloads when this job
  // closes — the same close-time flag the field, part and worker saves raise.
  onWorkSaved,
  // Whether the job window is still up (useStillMounted.js). A reply that lands after the
  // window has closed must not go on to reload that job's lists, status or assignee
  // credit; the page-wide refreshes (onTimerChange) fire regardless, since the header
  // badge and job list aren't tied to the window.
  isWindowUp
}) {
  const reloadTimeEntriesAndCosting = useCallback(async () => {
    if (!isWindowUp()) return;
    await reloadTimeEntries();
    if (!isWindowUp()) return;
    // Costing endpoint is admin-only; skip for non-admin to avoid 403 toast. Also skip
    // unless this job's stored pricing has actually arrived on screen — before that
    // there's nothing to update, and the first load is already on its way with the
    // latest hours anyway. Tests costingLoaded rather than costingOpened so a load that
    // failed isn't retried on every timer tick, and so this never writes hours onto a
    // still-default sheet ahead of the real figures landing.
    if (canSeePricing && costingLoaded) await refreshCosting();
    if (!isWindowUp()) return;
    await refreshJobStatus();
  }, [isWindowUp, reloadTimeEntries, canSeePricing, costingLoaded, refreshCosting, refreshJobStatus]);

  const handleSubmitEntryForm = useCallback(async () => {
    const result = await timer.submitEntryForm(reloadTimeEntriesAndCosting);
    // The "Stop & Start" switch starts its new timer from inside submitEntryForm
    // (once the old run's fill-in form is answered) — that's always the current
    // user's own timer (see useTimer.js), so credit them exactly as a direct
    // Start would. Skipped when the reply is for a job that's no longer open.
    if (result?.startedNewTimer && isWindowUp()) creditAssignee(currentUserId, employees);
    // The header's running-timer badge and the job list aren't tied to the open
    // job, so they refresh even when the screen has since moved to another one.
    if (onTimerChange) onTimerChange();
    // The form reads this back for a Critical-inspection refusal (StopTimerForm.jsx).
    return result;
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange, isWindowUp, creditAssignee, currentUserId, employees]);

  const handleCancelEntryForm = useCallback(async () => {
    await timer.cancelEntryForm(reloadTimeEntriesAndCosting);
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange]);

  const apiTimeEntryOperations = {
    addTimeEntry: async (data) => {
      await api.addTimeEntry(jobCardId, data);
      onWorkSaved?.();
      creditAssignee(data.workerId, employees);
      await reloadTimeEntriesAndCosting();
    },
    updateTimeEntry: async (id, data) => {
      await api.updateTimeEntry(jobCardId, id, data);
      onWorkSaved?.();
      creditAssignee(data.workerId, employees);
      await reloadTimeEntriesAndCosting();
    },
    deleteTimeEntry: async (id) => {
      await api.deleteTimeEntry(jobCardId, id);
      onWorkSaved?.();
      await reloadTimeEntriesAndCosting();
    }
  };

  const handleStartItemTimer = useCallback(async (itemId, displayNumber, workerId, workerName) => {
    // The server refuses this outright once a job is invoiced — reopening is
    // the only way back in, so say that up front rather than let the attempt
    // fail silently against a job whose timer buttons are otherwise still live.
    if (isTimeLocked(isInvoiced)) {
      showTimeLockedToast();
      return;
    }
    const started = await timer.startTimerWithConflictCheck(itemId, displayNumber, showConfirm, workerId, workerName);
    if (!isWindowUp()) {
      // This job is no longer the one open — drop the reply's effect on its screen,
      // but the header badge and job list still need to see the timer that started.
      if (onTimerChange) onTimerChange();
      return;
    }
    await reloadTimeEntries();
    // Only when a timer actually started — the server may have auto-assigned that
    // worker and nudged the status. A failed or cancelled attempt (including "stop &
    // start" queued behind the old run's fill-in form) credited nobody, so crediting
    // here would wrongly add the worker to the job for a timer that never ran.
    if (started) creditAssignee(workerId || currentUserId, employees);
    try {
      const fresh = await api.getJobcard(jobCardId);
      if (isWindowUp() && fresh.status) setFormData(prev => ({ ...prev, status: fresh.status }));
    } catch {
      // Non-fatal — status will refresh next time the modal opens
    }
    if (onTimerChange) onTimerChange();
  }, [timer, showConfirm, reloadTimeEntries, onTimerChange, jobCardId, creditAssignee, employees, setFormData, currentUserId, isInvoiced, isWindowUp]);

  // Both stop paths land here. A tap discarded as an accident is undone server-side,
  // so untick the worker it put on — a Save would otherwise put them straight back.
  // The stop itself already happened server-side by the time this runs; only the
  // reply's own effect on screen is skipped when it's no longer for the open job —
  // the header badge and job list refresh regardless, since they aren't per-job.
  const afterStop = useCallback(async (result) => {
    if (isWindowUp()) {
      if (result?.unassignedUserId) {
        dropAssignee(result.unassignedUserId);
      }
      await reloadTimeEntries();
      if (isWindowUp()) await refreshJobStatus();
    }
    if (onTimerChange) onTimerChange();
  }, [reloadTimeEntries, refreshJobStatus, onTimerChange, dropAssignee, isWindowUp]);

  const handleStopItemTimer = useCallback(
    () => timer.stopTimer().then(afterStop), [timer, afterStop]);

  // Admin stops a running timer from a line's Progress list (their own or one they
  // set up for a worker). Opens the same fill-in form so the pieces/scrap/description
  // for that run get recorded, instead of silently dropping a blank block.
  const handleStopEntryWithForm = useCallback(
    (entry) => timer.stopEntryWithForm(entry).then(afterStop), [timer, afterStop]);

  return {
    reloadTimeEntriesAndCosting,
    handleSubmitEntryForm,
    handleCancelEntryForm,
    apiTimeEntryOperations,
    handleStartItemTimer,
    handleStopItemTimer,
    handleStopEntryWithForm
  };
}
