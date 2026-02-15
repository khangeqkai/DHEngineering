import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
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
      supplierId: sub.supplierId || '',
      dateSent: sub.dateSent || '',
      dateExpected: sub.dateExpected || '',
      dateReceived: sub.dateReceived || '',
      notes: sub.notes || '',
      status: sub.status || 'PENDING'
    });
    setShowSubcontractForm(true);
  }, []);

  const handleSaveSubcontract = useCallback(async () => {
    if (!subcontractForm.supplierId) {
      toast.error('Please select a supplier');
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

      resetSubcontractForm();
    } catch (err) {
      console.error('Failed to save subcontract:', err);
      toast.error(err.message || 'Failed to save subcontract');
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
    } catch (err) {
      console.error('Failed to delete subcontract:', err);
      toast.error(err.message || 'Failed to delete subcontract');
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
