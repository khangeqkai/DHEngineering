import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { getDefaultCostingForm } from './mappers';

export function useCosting(jobCardId) {
  const [costing, setCosting] = useState(null);
  const [costingForm, setCostingForm] = useState(getDefaultCostingForm());
  const [savingCosting, setSavingCosting] = useState(false);

  // Sync costingForm from costing data
  useEffect(() => {
    if (costing) {
      setCostingForm({
        labour_hours: costing.labour_hours || 0,
        labour_rate: costing.labour_rate || 0,
        labour_special_hours: costing.labour_special_hours || 0,
        labour_special_rate: costing.labour_special_rate || 0,
        materials_cost: costing.materials_cost || 0,
        materials_profit_percent: costing.materials_profit_percent || 100,
        subcontractor_cost: costing.subcontractor_cost || 0,
        subcontractor_profit_percent: costing.subcontractor_profit_percent || 0
      });
    }
  }, [costing]);

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

      await api.updateCosting(jobCardId, costingData);
      const updatedCosting = await api.getCosting(jobCardId);
      setCosting(updatedCosting);
      alert('Costing saved successfully');
    } catch (err) {
      console.error('Failed to save costing:', err);
      alert(err.message || 'Failed to save costing');
    } finally {
      setSavingCosting(false);
    }
  }, [jobCardId, costingForm, calculateCostingTotals]);

  const loadCosting = useCallback(async () => {
    if (!jobCardId) return null;

    try {
      const costingData = await api.getCosting(jobCardId);
      if (costingData) {
        setCosting({
          labour_hours: costingData.labourHours || 0,
          labour_rate: costingData.labourRate || 0,
          labour_special_hours: costingData.labourSpecialHours || 0,
          labour_special_rate: costingData.labourSpecialRate || 0,
          materials_cost: costingData.materialsCost || 0,
          materials_profit_percent: costingData.materialsProfitPercent || 100,
          subcontractor_cost: costingData.subcontractorCost || 0,
          subcontractor_profit_percent: costingData.subcontractorProfitPercent || 0
        });
      }
      return costingData;
    } catch (err) {
      console.error('Failed to load costing:', err);
      return null;
    }
  }, [jobCardId]);

  const resetCosting = useCallback(() => {
    setCosting(null);
    setCostingForm(getDefaultCostingForm());
  }, []);

  return {
    costing,
    setCosting,
    costingForm,
    savingCosting,
    handleCostingChange,
    calculateCostingTotals,
    handleSaveCosting,
    loadCosting,
    resetCosting
  };
}
