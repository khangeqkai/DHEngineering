import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getDefaultTimeEntryForm, isoToLocalInput, localInputToIso } from './mappers';

export function useTimeEntries(jobCardId, { addTimeEntry, updateTimeEntry, deleteTimeEntry, stopActiveEntry, showConfirm }) {
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [timeEntryForm, setTimeEntryForm] = useState(getDefaultTimeEntryForm());

  const resetTimeEntryForm = useCallback(() => {
    setTimeEntryForm({
      ...getDefaultTimeEntryForm(),
      startTime: isoToLocalInput(new Date().toISOString())
    });
    setEditingTimeEntryId(null);
    setShowTimeEntryForm(false);
  }, []);

  const handleTimeEntryChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setTimeEntryForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }, []);

  const handleAddTimeEntry = useCallback((itemNumber = '') => {
    resetTimeEntryForm();
    setTimeEntryForm(prev => ({
      ...prev,
      itemNumber: itemNumber !== '' && itemNumber != null ? String(itemNumber) : '',
      startTime: isoToLocalInput(new Date().toISOString())
    }));
    setShowTimeEntryForm(true);
  }, [resetTimeEntryForm]);

  const handleEditTimeEntry = useCallback((entry) => {
    setEditingTimeEntryId(entry.id);
    setTimeEntryForm({
      workerId: entry.userId || '',
      itemNumber: entry.itemNumber || '',
      machineNumber: entry.machineNumber || '',
      qty: entry.qty || '',
      scrapQty: entry.scrapQty ?? '',
      description: entry.description || '',
      startTime: isoToLocalInput(entry.startTime),
      endTime: isoToLocalInput(entry.endTime)
    });
    setShowTimeEntryForm(true);
  }, []);

  const handleSaveTimeEntry = useCallback(async () => {
    if (!jobCardId) return;

    // Sanity-check hand-entered times before saving: both must be real,
    // and the finish must come after the start, so bad times can't poison
    // the job's labour hours and cost totals.
    // A hand-entered block must be credited to the worker who actually did the
    // work, so per-worker hours stay accurate — not to the admin filling the form.
    if (!timeEntryForm.workerId) {
      toast.error('Please choose the worker who did this work');
      return;
    }

    const { startTime, endTime } = timeEntryForm;
    if (!startTime) {
      toast.error('Please enter a start time');
      return;
    }
    const start = new Date(startTime).getTime();
    if (isNaN(start)) {
      toast.error('Start time is not a valid date');
      return;
    }
    if (endTime) {
      const end = new Date(endTime).getTime();
      if (isNaN(end)) {
        toast.error('Finish time is not a valid date');
        return;
      }
      if (end <= start) {
        toast.error('Finish time must be after the start time');
        return;
      }
    }

    try {
      const entryData = {
        ...timeEntryForm,
        itemNumber: timeEntryForm.itemNumber ? parseInt(timeEntryForm.itemNumber) : null,
        // Store both ends with full time-zone info so a block's start and finish
        // can never end up in mismatched formats (would mis-calculate duration).
        startTime: localInputToIso(timeEntryForm.startTime),
        endTime: localInputToIso(timeEntryForm.endTime)
      };

      if (editingTimeEntryId) {
        await updateTimeEntry(editingTimeEntryId, entryData);
      } else {
        await addTimeEntry(entryData);
      }

      resetTimeEntryForm();
    } catch (err) {
      toast.error(err.message || 'Failed to save time entry');
    }
  }, [jobCardId, timeEntryForm, editingTimeEntryId, resetTimeEntryForm, addTimeEntry, updateTimeEntry]);

  const handleDeleteTimeEntry = useCallback(async (entryId) => {
    if (!jobCardId) return;

    // Use custom confirm dialog if available, otherwise fall back to native confirm
    const confirmed = showConfirm
      ? await showConfirm({
          title: 'Delete Time Entry',
          message: 'Delete this time entry?',
          confirmLabel: 'Delete',
          confirmVariant: 'danger'
        })
      : window.confirm('Delete this time entry?');
    if (!confirmed) return;

    try {
      await deleteTimeEntry(entryId);
    } catch (err) {
      toast.error(err.message || 'Failed to delete time entry');
    }
  }, [jobCardId, deleteTimeEntry, showConfirm]);

  const handleStopActiveEntry = useCallback(async (entry) => {
    if (!jobCardId) return;

    const confirmed = showConfirm
      ? await showConfirm({
          title: 'Stop Timer',
          message: `Stop ${entry.userName}'s active timer?`,
          confirmLabel: 'Stop Timer',
          confirmVariant: 'danger'
        })
      : window.confirm(`Stop ${entry.userName}'s timer?`);
    if (!confirmed) return;

    try {
      await stopActiveEntry(entry.id);
      toast.success('Timer stopped');
    } catch (err) {
      toast.error(err.message || 'Failed to stop timer');
    }
  }, [jobCardId, stopActiveEntry, showConfirm]);

  const resetTimeEntries = useCallback(() => {
    resetTimeEntryForm();
  }, [resetTimeEntryForm]);

  return {
    showTimeEntryForm,
    setShowTimeEntryForm,
    editingTimeEntryId,
    timeEntryForm,
    resetTimeEntryForm,
    handleTimeEntryChange,
    handleAddTimeEntry,
    handleEditTimeEntry,
    handleSaveTimeEntry,
    handleDeleteTimeEntry,
    handleStopActiveEntry,
    resetTimeEntries
  };
}
