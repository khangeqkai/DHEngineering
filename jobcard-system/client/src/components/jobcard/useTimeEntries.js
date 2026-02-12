import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getDefaultTimeEntryForm } from './mappers';

export function useTimeEntries(jobCardId, { addTimeEntry, updateTimeEntry, deleteTimeEntry }) {
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [timeEntryForm, setTimeEntryForm] = useState(getDefaultTimeEntryForm());

  const resetTimeEntryForm = useCallback(() => {
    setTimeEntryForm({
      ...getDefaultTimeEntryForm(),
      start_time: new Date().toISOString().slice(0, 16)
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

  const handleAddTimeEntry = useCallback(() => {
    resetTimeEntryForm();
    setTimeEntryForm(prev => ({
      ...prev,
      start_time: new Date().toISOString().slice(0, 16)
    }));
    setShowTimeEntryForm(true);
  }, [resetTimeEntryForm]);

  const handleEditTimeEntry = useCallback((entry) => {
    setEditingTimeEntryId(entry.id);
    setTimeEntryForm({
      item_number: entry.item_number || '',
      machine_number: entry.machine_number || '',
      qty: entry.qty || '',
      description: entry.description || '',
      start_time: entry.start_time ? entry.start_time.slice(0, 16) : '',
      end_time: entry.end_time ? entry.end_time.slice(0, 16) : '',
      equipment_checks_done: entry.equipment_checks_done || false,
      measuring_verification_done: entry.measuring_verification_done || false,
      first_off_inspection: entry.first_off_inspection || 'NOT_APPLICABLE',
      first_off_inspection_notes: entry.first_off_inspection_notes || '',
      in_process_validation: entry.in_process_validation || 'NOT_APPLICABLE',
      in_process_validation_notes: entry.in_process_validation_notes || '',
      scrap_all_good: entry.scrap_all_good !== false,
      scrap_recycle_inhouse_qty: entry.scrap_recycle_inhouse_qty || 0,
      scrap_recycle_bin_qty: entry.scrap_recycle_bin_qty || 0
    });
    setShowTimeEntryForm(true);
  }, []);

  const handleSaveTimeEntry = useCallback(async () => {
    // Validation: Special Ops and Scrap Rate must be filled
    if (!timeEntryForm.equipment_checks_done || !timeEntryForm.measuring_verification_done) {
      toast.error('Equipment Checks and Measuring Equipment Verification must be completed');
      return;
    }
    if (timeEntryForm.first_off_inspection === 'ERROR' && !timeEntryForm.first_off_inspection_notes) {
      toast.error('Please provide notes for First Off Inspection error');
      return;
    }
    if (timeEntryForm.in_process_validation === 'ERROR' && !timeEntryForm.in_process_validation_notes) {
      toast.error('Please provide notes for In-process Validation error');
      return;
    }

    if (!jobCardId) return;

    try {
      const entryData = {
        ...timeEntryForm,
        item_number: timeEntryForm.item_number ? parseInt(timeEntryForm.item_number) : null,
        scrap_recycle_inhouse_qty: parseInt(timeEntryForm.scrap_recycle_inhouse_qty) || 0,
        scrap_recycle_bin_qty: parseInt(timeEntryForm.scrap_recycle_bin_qty) || 0
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
    if (!confirm('Delete this time entry?')) return;
    if (!jobCardId) return;

    try {
      await deleteTimeEntry(entryId);
    } catch (err) {
      console.error('Failed to delete time entry:', err);
      toast.error(err.message || 'Failed to delete time entry');
    }
  }, [jobCardId, deleteTimeEntry]);

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
    resetTimeEntries
  };
}
