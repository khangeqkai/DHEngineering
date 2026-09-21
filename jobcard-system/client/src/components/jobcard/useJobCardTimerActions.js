import { useCallback } from 'react';
import { api } from '../../services/api';

/**
 * Orchestrates the timer and time-entry actions JobCardModal wires into the
 * screen — starting/stopping a timer, the stop-timer fill-in form, and the
 * admin's manual add/edit form. Split out of JobCardModal.jsx (which was at the
 * 600-line limit) purely to keep that file under it; every dependency below is
 * something JobCardModal already holds, just handed in instead of closed over.
 *
 * A part is identified to the server by its permanent id (itemId) throughout —
 * displayNumber only ever reaches the user, in a toast or a confirm prompt.
 */
export function useJobCardTimerActions({
  jobCardId,
  isAdmin,
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
  onTimerChange
}) {
  const reloadTimeEntriesAndCosting = useCallback(async () => {
    await reloadTimeEntries();
    // Costing endpoint is admin-only; skip for non-admin to avoid 403 toast. Also skip
    // unless this job's stored pricing has actually arrived on screen — before that
    // there's nothing to update, and the first load is already on its way with the
    // latest hours anyway. Tests costingLoaded rather than costingOpened so a load that
    // failed isn't retried on every timer tick, and so this never writes hours onto a
    // still-default sheet ahead of the real figures landing.
    if (isAdmin && costingLoaded) await refreshCosting();
    await refreshJobStatus();
  }, [reloadTimeEntries, isAdmin, costingLoaded, refreshCosting, refreshJobStatus]);

  const handleSubmitEntryForm = useCallback(async () => {
    await timer.submitEntryForm(reloadTimeEntriesAndCosting);
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange]);

  const handleCancelEntryForm = useCallback(async () => {
    await timer.cancelEntryForm(reloadTimeEntriesAndCosting);
    if (onTimerChange) onTimerChange();
  }, [timer, reloadTimeEntriesAndCosting, onTimerChange]);

  const apiTimeEntryOperations = {
    addTimeEntry: async (data) => {
      await api.addTimeEntry(jobCardId, data);
      creditAssignee(data.workerId, employees);
      await reloadTimeEntriesAndCosting();
    },
    updateTimeEntry: async (id, data) => {
      await api.updateTimeEntry(jobCardId, id, data);
      creditAssignee(data.workerId, employees);
      await reloadTimeEntriesAndCosting();
    },
    deleteTimeEntry: async (id) => {
      await api.deleteTimeEntry(jobCardId, id);
      await reloadTimeEntriesAndCosting();
    }
  };

  const handleStartItemTimer = useCallback(async (itemId, displayNumber, workerId, workerName) => {
    await timer.startTimerWithConflictCheck(itemId, displayNumber, showConfirm, workerId, workerName);
    await reloadTimeEntries();
    // Server may have auto-assigned the timer's worker and nudged the status.
    creditAssignee(workerId || currentUserId, employees);
    try {
      const fresh = await api.getJobcard(jobCardId);
      if (fresh.status) setFormData(prev => ({ ...prev, status: fresh.status }));
    } catch {
      // Non-fatal — status will refresh next time the modal opens
    }
    if (onTimerChange) onTimerChange();
  }, [timer, showConfirm, reloadTimeEntries, onTimerChange, jobCardId, creditAssignee, employees, setFormData, currentUserId]);

  // Both stop paths land here. A tap discarded as an accident is undone server-side,
  // so untick the worker it put on — a Save would otherwise put them straight back.
  const afterStop = useCallback(async (result) => {
    if (result?.unassignedUserId) {
      dropAssignee(result.unassignedUserId);
    }
    await reloadTimeEntries();
    await refreshJobStatus();
    if (onTimerChange) onTimerChange();
  }, [reloadTimeEntries, refreshJobStatus, onTimerChange, dropAssignee]);

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
