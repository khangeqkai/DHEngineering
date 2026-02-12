import { useState, useEffect, useCallback } from 'react';
import { getDefaultCostingForm } from './mappers';

export function useCosting(jobCardId, { costing: offlineCosting, updateCosting } = {}) {
  const [costingForm, setCostingForm] = useState(getDefaultCostingForm());
  const [savingCosting, setSavingCosting] = useState(false);

  // Sync costingForm from costing data (from useOfflineJobcard)
  useEffect(() => {
    if (offlineCosting) {
      setCostingForm({
        labour_hours: offlineCosting.labour_hours || 0,
        labour_rate: offlineCosting.labour_rate || 0,
        labour_special_hours: offlineCosting.labour_special_hours || 0,
        labour_special_rate: offlineCosting.labour_special_rate || 0,
        materials_cost: offlineCosting.materials_cost || 0,
        materials_profit_percent: offlineCosting.materials_profit_percent || 100,
        subcontractor_cost: offlineCosting.subcontractor_cost || 0,
        subcontractor_profit_percent: offlineCosting.subcontractor_profit_percent || 0
      });
    }
  }, [offlineCosting]);

  const handleCostingChange = useCallback((e) => {
    const { name, value } = e.target;
    setCostingForm(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  }, []);

  const calculateCostingTotals = useCallback(() => {
    const labourTotal = costingForm.labour_hours * costingForm.labour_rate;
    const labourSpecialTotal = costingForm.labour_special_hours * costingForm.labour_special_rate;
    const materialsTotal = costingForm.materials_cost * (1 + costingForm.materials_profit_percent / 100);
    const subcontractorTotal = costingForm.subcontractor_cost * (1 + costingForm.subcontractor_profit_percent / 100);
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
        labour_total: totals.labourTotal,
        labour_special_total: totals.labourSpecialTotal,
        materials_total: totals.materialsTotal,
        subcontractor_total: totals.subcontractorTotal,
        grand_total: totals.grandTotal
      };

      // Use updateCosting operation from parent - data updates automatically via useLiveQuery
      if (!updateCosting) {
        throw new Error('updateCosting operation not provided');
      }
      await updateCosting(costingData);
      // No need to manually reload - useLiveQuery updates automatically
      alert('Costing saved successfully');
    } catch (err) {
      console.error('Failed to save costing:', err);
      alert(err.message || 'Failed to save costing');
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
