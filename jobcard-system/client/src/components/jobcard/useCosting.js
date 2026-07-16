import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { getDefaultCostingForm } from './mappers';

export function useCosting(jobCardId, { costing: offlineCosting, updateCosting } = {}) {
  const [costingForm, setCostingForm] = useState(getDefaultCostingForm());
  const [savingCosting, setSavingCosting] = useState(false);
  // True when the pricing screen has hand edits that haven't been saved yet. Used to
  // warn/save before invoicing, since invoicing freezes from the SAVED figures.
  const [costingDirty, setCostingDirty] = useState(false);

  // Sync costingForm from costing data (from useOfflineJobcard)
  useEffect(() => {
    if (offlineCosting) {
      setCostingDirty(false);
      setCostingForm({
        labourHours: offlineCosting.labourHours || 0,
        labourHoursCalculated: offlineCosting.labourHoursCalculated || 0,
        labourHoursOverridden: offlineCosting.labourHoursOverride != null,
        labourRate: offlineCosting.labourRate || 0,
        labourOt1Hours: offlineCosting.labourOt1Hours || 0,
        labourOt1HoursCalculated: offlineCosting.labourOt1HoursCalculated || 0,
        labourOt1Overridden: offlineCosting.labourOt1Override != null,
        labourOt1Multiplier: offlineCosting.labourOt1Multiplier ?? 1.5,
        labourOt2Hours: offlineCosting.labourOt2Hours || 0,
        labourOt2HoursCalculated: offlineCosting.labourOt2HoursCalculated || 0,
        labourOt2Overridden: offlineCosting.labourOt2Override != null,
        labourOt2Multiplier: offlineCosting.labourOt2Multiplier ?? 2,
        labourHolidayHours: offlineCosting.labourHolidayHours || 0,
        labourHolidayHoursCalculated: offlineCosting.labourHolidayHoursCalculated || 0,
        labourHolidayOverridden: offlineCosting.labourHolidayOverride != null,
        labourHolidayMultiplier: offlineCosting.labourHolidayMultiplier ?? 2.5,
        labourSpecialHours: offlineCosting.labourSpecialHours || 0,
        labourSpecialRate: offlineCosting.labourSpecialRate || 0,
        materialsCost: offlineCosting.materialsCost || 0,
        materialsProfitPercent: offlineCosting.materialsProfitPercent ?? 100,
        subcontractorCost: offlineCosting.subcontractorCost || 0,
        subcontractorProfitPercent: offlineCosting.subcontractorProfitPercent ?? 0,
        frozen: offlineCosting.frozen || false
      });
    }
  }, [offlineCosting]);

  // Typing in a tier's hours box marks it as a manual override, so the calculated
  // figure stops driving it (and a later timer refresh won't overwrite it).
  const HOURS_OVERRIDE_FLAG = {
    labourHours: 'labourHoursOverridden',
    labourOt1Hours: 'labourOt1Overridden',
    labourOt2Hours: 'labourOt2Overridden',
    labourHolidayHours: 'labourHolidayOverridden'
  };

  const handleCostingChange = useCallback((e) => {
    const { name, value } = e.target;
    const flag = HOURS_OVERRIDE_FLAG[name];
    setCostingDirty(true);
    setCostingForm(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0,
      ...(flag ? { [flag]: true } : {})
    }));
  }, []);

  // Drop a tier's manual override and snap its hours back to the auto-tallied figure.
  // tier is '' (normal), 'Ot1', 'Ot2', or 'Holiday'.
  const resetTierHours = useCallback((tier = '') => {
    const hoursKey = `labour${tier}Hours`;
    const calcKey = `labour${tier}HoursCalculated`;
    const flagKey = `labour${tier}Overridden`;
    setCostingDirty(true);
    setCostingForm(prev => ({
      ...prev,
      [hoursKey]: prev[calcKey],
      [flagKey]: false
    }));
  }, []);

  const calculateCostingTotals = useCallback(() => {
    const labourTotal = costingForm.labourHours * costingForm.labourRate;
    const labourOt1Total = costingForm.labourOt1Hours * costingForm.labourRate * costingForm.labourOt1Multiplier;
    const labourOt2Total = costingForm.labourOt2Hours * costingForm.labourRate * costingForm.labourOt2Multiplier;
    const labourHolidayTotal = costingForm.labourHolidayHours * costingForm.labourRate * costingForm.labourHolidayMultiplier;
    const labourSpecialTotal = costingForm.labourSpecialHours * costingForm.labourSpecialRate;
    const materialsTotal = costingForm.materialsCost * (1 + costingForm.materialsProfitPercent / 100);
    const subcontractorTotal = costingForm.subcontractorCost * (1 + costingForm.subcontractorProfitPercent / 100);
    const grandTotal = labourTotal + labourOt1Total + labourOt2Total + labourHolidayTotal
      + labourSpecialTotal + materialsTotal + subcontractorTotal;

    return { labourTotal, labourOt1Total, labourOt2Total, labourHolidayTotal, labourSpecialTotal, materialsTotal, subcontractorTotal, grandTotal };
  }, [costingForm]);

  // Returns true when the costing is safely saved, false when the save failed.
  // Callers that gate an irreversible step on the save (invoicing freezes these
  // figures) rely on this to abort instead of locking in stale numbers.
  const handleSaveCosting = useCallback(async () => {
    if (!jobCardId) return true; // nothing to save (new card) — not a failure

    setSavingCosting(true);
    try {
      const totals = calculateCostingTotals();
      const costingData = {
        ...costingForm,
        // Send each tier's manual hours only when overridden; null tells the server to
        // use its auto tally. The server recomputes every total from these + settings.
        labourHoursOverride: costingForm.labourHoursOverridden ? costingForm.labourHours : null,
        labourOt1Override: costingForm.labourOt1Overridden ? costingForm.labourOt1Hours : null,
        labourOt2Override: costingForm.labourOt2Overridden ? costingForm.labourOt2Hours : null,
        labourHolidayOverride: costingForm.labourHolidayOverridden ? costingForm.labourHolidayHours : null,
        labourTotal: totals.labourTotal,
        labourOt1Total: totals.labourOt1Total,
        labourOt2Total: totals.labourOt2Total,
        labourHolidayTotal: totals.labourHolidayTotal,
        labourSpecialTotal: totals.labourSpecialTotal,
        materialsTotal: totals.materialsTotal,
        subcontractorTotal: totals.subcontractorTotal,
        grandTotal: totals.grandTotal
      };

      if (!updateCosting) {
        throw new Error('updateCosting operation not provided');
      }
      await updateCosting(costingData);
      setCostingDirty(false);
      toast.success('Costing saved successfully');
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to save costing');
      return false;
    } finally {
      setSavingCosting(false);
    }
  }, [jobCardId, costingForm, calculateCostingTotals, updateCosting]);

  const refreshCosting = useCallback(async () => {
    if (!jobCardId) return;
    try {
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) {
        // Only labour hours are auto-tallied from time entries; this runs after a
        // timer event to pick that up. Every other field is manually entered, so
        // leave the current form values alone — otherwise an admin's unsaved edits
        // (rate, special-labour hours/rate, materials, etc.) get wiped by a refresh.
        setCostingForm(prev => ({
          ...prev,
          // Always refresh each tier's calculated reference figure. Only push it into
          // the editable box when the admin hasn't typed their own override, so a manual
          // entry survives a timer tick.
          labourHoursCalculated: costingRes.labourHoursCalculated || 0,
          ...(prev.labourHoursOverridden ? {} : { labourHours: costingRes.labourHoursCalculated || 0 }),
          labourOt1HoursCalculated: costingRes.labourOt1HoursCalculated || 0,
          ...(prev.labourOt1Overridden ? {} : { labourOt1Hours: costingRes.labourOt1HoursCalculated || 0 }),
          labourOt2HoursCalculated: costingRes.labourOt2HoursCalculated || 0,
          ...(prev.labourOt2Overridden ? {} : { labourOt2Hours: costingRes.labourOt2HoursCalculated || 0 }),
          labourHolidayHoursCalculated: costingRes.labourHolidayHoursCalculated || 0,
          ...(prev.labourHolidayOverridden ? {} : { labourHolidayHours: costingRes.labourHolidayHoursCalculated || 0 })
        }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to refresh costing hours');
    }
  }, [jobCardId]);

  const resetCosting = useCallback(() => {
    setCostingDirty(false);
    setCostingForm(getDefaultCostingForm());
  }, []);

  return {
    costingForm,
    savingCosting,
    costingDirty,
    handleCostingChange,
    resetTierHours,
    calculateCostingTotals,
    handleSaveCosting,
    refreshCosting,
    resetCosting
  };
}
