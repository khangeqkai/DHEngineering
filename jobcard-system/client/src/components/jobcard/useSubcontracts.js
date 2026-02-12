import { useState, useCallback } from 'react';
import { api } from '../../services/api';
import { mapSubcontractFromApi, getDefaultSubcontractForm } from './mappers';

export function useSubcontracts(jobCardId) {
  const [subcontracts, setSubcontracts] = useState([]);
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
        await api.updateSubcontract(jobCardId, editingSubcontractId, subcontractForm);
      } else {
        await api.addSubcontract(jobCardId, subcontractForm);
      }

      // Reload and map subcontracts from API response
      const subsData = await api.getSubcontracts(jobCardId);
      const mappedSubs = subsData.map(mapSubcontractFromApi);
      setSubcontracts(mappedSubs);
      resetSubcontractForm();
    } catch (err) {
      console.error('Failed to save subcontract:', err);
      alert(err.message || 'Failed to save subcontract');
    }
  }, [jobCardId, subcontractForm, editingSubcontractId, resetSubcontractForm]);

  const handleDeleteSubcontract = useCallback(async (subId) => {
    if (!confirm('Delete this subcontract?')) return;
    if (!jobCardId) return;

    try {
      await api.deleteSubcontract(jobCardId, subId);
      const subsData = await api.getSubcontracts(jobCardId);
      const mappedSubs = subsData.map(mapSubcontractFromApi);
      setSubcontracts(mappedSubs);
    } catch (err) {
      console.error('Failed to delete subcontract:', err);
      alert(err.message || 'Failed to delete subcontract');
    }
  }, [jobCardId]);

  const resetSubcontracts = useCallback(() => {
    setSubcontracts([]);
    resetSubcontractForm();
  }, [resetSubcontractForm]);

  return {
    subcontracts,
    setSubcontracts,
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
