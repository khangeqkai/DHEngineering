import { useState, useCallback } from 'react';
import { getDefaultSubcontractForm } from './mappers';

export function useSubcontracts(jobCardId, { addSubcontract, updateSubcontract, deleteSubcontract } = {}) {
  const [showSubcontractForm, setShowSubcontractForm] = useState(false);
  const [editingSubcontractId, setEditingSubcontractId] = useState(null);
  const [subcontractForm, setSubcontractForm] = useState(getDefaultSubcontractForm());

  const resetSubcontractForm = useCallback(() => {
    setSubcontractForm(getDefaultSubcontractForm());
    setEditingSubcontractId(null);
    setShowSubcontractForm(false);
  }, []);

  const handleSubcontractChange = useCallback((e) => {
    const { name, value } = e.target;
    setSubcontractForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleAddSubcontract = useCallback(() => {
    resetSubcontractForm();
    setShowSubcontractForm(true);
  }, [resetSubcontractForm]);

  const handleEditSubcontract = useCallback((sub) => {
    setEditingSubcontractId(sub.id);
    setSubcontractForm({
      supplier_id: sub.supplier_id || '',
      date_sent: sub.date_sent || '',
      date_expected: sub.date_expected || '',
      date_received: sub.date_received || '',
      notes: sub.notes || '',
      status: sub.status || 'PENDING'
    });
    setShowSubcontractForm(true);
  }, []);

  const handleSaveSubcontract = useCallback(async () => {
    if (!subcontractForm.supplier_id) {
      alert('Please select a supplier');
      return;
    }

    if (!jobCardId) return;

    try {
      if (editingSubcontractId) {
        // Use operation passed from parent
        if (updateSubcontract) {
          await updateSubcontract(editingSubcontractId, subcontractForm);
        }
      } else {
        // Use operation passed from parent
        if (addSubcontract) {
          await addSubcontract(subcontractForm);
        }
      }

      // No need to manually reload - useLiveQuery updates automatically
      resetSubcontractForm();
    } catch (err) {
      console.error('Failed to save subcontract:', err);
      alert(err.message || 'Failed to save subcontract');
    }
  }, [jobCardId, subcontractForm, editingSubcontractId, resetSubcontractForm, addSubcontract, updateSubcontract]);

  const handleDeleteSubcontract = useCallback(async (subId) => {
    if (!confirm('Delete this subcontract?')) return;
    if (!jobCardId) return;

    try {
      // Use operation passed from parent
      if (deleteSubcontract) {
        await deleteSubcontract(subId);
      }
      // No need to manually reload - useLiveQuery updates automatically
    } catch (err) {
      console.error('Failed to delete subcontract:', err);
      alert(err.message || 'Failed to delete subcontract');
    }
  }, [jobCardId, deleteSubcontract]);

  const resetSubcontracts = useCallback(() => {
    resetSubcontractForm();
  }, [resetSubcontractForm]);

  return {
    showSubcontractForm,
    setShowSubcontractForm,
    editingSubcontractId,
    subcontractForm,
    resetSubcontractForm,
    handleSubcontractChange,
    handleAddSubcontract,
    handleEditSubcontract,
    handleSaveSubcontract,
    handleDeleteSubcontract,
    resetSubcontracts
  };
}
