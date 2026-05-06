import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getDefaultTimeEntryForm } from './mappers';

export function useTimeEntries(jobCardId, { addTimeEntry, updateTimeEntry, deleteTimeEntry, stopActiveEntry, showConfirm }) {
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [timeEntryForm, setTimeEntryForm] = useState(getDefaultTimeEntryForm());

  const resetTimeEntryForm = useCallback(() => {
    setTimeEntryForm({
      ...getDefaultTimeEntryForm(),
      startTime: new Date().toISOString().slice(0, 16)
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
      startTime: new Date().toISOString().slice(0, 16)
    }));
    setShowTimeEntryForm(true);
  }, [resetTimeEntryForm]);

  const handleEditTimeEntry = useCallback((entry) => {
    setEditingTimeEntryId(entry.id);
    setTimeEntryForm({
      itemNumber: entry.itemNumber || '',
      machineNumber: entry.machineNumber || '',
      qty: entry.qty || '',
      description: entry.description || '',
      startTime: entry.startTime ? entry.startTime.slice(0, 16) : '',
      endTime: entry.endTime ? entry.endTime.slice(0, 16) : ''
    });
    setShowTimeEntryForm(true);
  }, []);

  const handleSaveTimeEntry = useCallback(async () => {
    if (!jobCardId) return;

    try {
      const entryData = {
        ...timeEntryForm,
        itemNumber: timeEntryForm.itemNumber ? parseInt(timeEntryForm.itemNumber) : null
      };

      if (editingTimeEntryId) {
        await updateTimeEntry(editingTimeEntryId, entryData);
      } else {
        await addTimeEntry(entryData);
      }

      resetTimeEntryForm();
    } catch (err) {
      console.error('Failed to save time entry:', err);
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
      console.error('Failed to delete time entry:', err);
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
