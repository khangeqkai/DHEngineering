import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { getDefaultCostingForm } from './mappers';

export function useCosting(jobCardId, { costing: offlineCosting, updateCosting } = {}) {
  const [costingForm, setCostingForm] = useState(getDefaultCostingForm());
  const [savingCosting, setSavingCosting] = useState(false);

  // Sync costingForm from costing data (from useOfflineJobcard)
  useEffect(() => {
    if (offlineCosting) {
      setCostingForm({
        labourHours: offlineCosting.labourHours || 0,
        labourRate: offlineCosting.labourRate || 0,
        labourSpecialHours: offlineCosting.labourSpecialHours || 0,
        labourSpecialRate: offlineCosting.labourSpecialRate || 0,
        materialsCost: offlineCosting.materialsCost || 0,
        materialsProfitPercent: offlineCosting.materialsProfitPercent || 100,
        subcontractorCost: offlineCosting.subcontractorCost || 0,
        subcontractorProfitPercent: offlineCosting.subcontractorProfitPercent || 0
      });
    }
  }, [offlineCosting]);

  const handleCostingChange = useCallback((e) => {
    const { name, value } = e.target;
    setCostingForm(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  }, []);

  const calculateCostingTotals = useCallback(() => {
    const labourTotal = costingForm.labourHours * costingForm.labourRate;
    const labourSpecialTotal = costingForm.labourSpecialHours * costingForm.labourSpecialRate;
    const materialsTotal = costingForm.materialsCost * (1 + costingForm.materialsProfitPercent / 100);
    const subcontractorTotal = costingForm.subcontractorCost * (1 + costingForm.subcontractorProfitPercent / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    return { labourTotal, labourSpecialTotal, materialsTotal, subcontractorTotal, grandTotal };
  }, [costingForm]);

  const handleSaveCosting = useCallback(async () => {
    if (!jobCardId) return;

    setSavingCosting(true);
    try {
      const totals = calculateCostingTotals();
      const costingData = {
        ...costingForm,
        labourTotal: totals.labourTotal,
        labourSpecialTotal: totals.labourSpecialTotal,
        materialsTotal: totals.materialsTotal,
        subcontractorTotal: totals.subcontractorTotal,
        grandTotal: totals.grandTotal
      };

      if (!updateCosting) {
        throw new Error('updateCosting operation not provided');
      }
      await updateCosting(costingData);
      toast.success('Costing saved successfully');
    } catch (err) {
      console.error('Failed to save costing:', err);
      toast.error(err.message || 'Failed to save costing');
    } finally {
      setSavingCosting(false);
    }
  }, [jobCardId, costingForm, calculateCostingTotals, updateCosting]);

  const resetCosting = useCallback(() => {
    setCostingForm(getDefaultCostingForm());
  }, []);

  return {
    costingForm,
    savingCosting,
    handleCostingChange,
    calculateCostingTotals,
    handleSaveCosting,
    resetCosting
  };
}
