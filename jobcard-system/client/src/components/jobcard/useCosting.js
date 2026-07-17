import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { getDefaultCostingForm } from './mappers';

// Which override flag each hand-editable box drives. Note the normal tier's hours flag
// is `labourHoursOverridden` (with "Hours"), while the OT/holiday tiers drop it — so this
// map is the single source of truth rather than deriving the name from the tier key.
// The two overtime multipliers follow the same pattern: typing in the box marks the
// job as owning its own multiplier instead of following the company setting.
const OVERRIDE_FLAG = {
  labourHours: 'labourHoursOverridden',
  labourOt1Hours: 'labourOt1Overridden',
  labourOt2Hours: 'labourOt2Overridden',
  labourHolidayHours: 'labourHolidayOverridden',
  labourOt1Multiplier: 'labourOt1MultiplierOverridden',
  labourOt2Multiplier: 'labourOt2MultiplierOverridden'
};

// The lowest value each box accepts, matching the server's clamps exactly so the
// on-screen totals always equal what a save will store. The two overtime multipliers
// floor at ×1 (below 1 would undercharge overtime — the server refuses it), so
// clearing a multiplier box snaps to ×1 instead of silently pricing that tier at ×0.
// Everything else floors at 0.
const FIELD_MIN = {
  labourOt1Multiplier: 1,
  labourOt2Multiplier: 1
};

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
        labourDefaultRate: offlineCosting.labourDefaultRate || 0,
        labourOt1Hours: offlineCosting.labourOt1Hours || 0,
        labourOt1HoursCalculated: offlineCosting.labourOt1HoursCalculated || 0,
        labourOt1Overridden: offlineCosting.labourOt1Override != null,
        labourOt1Multiplier: offlineCosting.labourOt1Multiplier ?? 1.5,
        labourOt1MultiplierCalculated: offlineCosting.labourOt1MultiplierCalculated ?? 1.5,
        labourOt1MultiplierOverridden: offlineCosting.labourOt1MultiplierOverride != null,
        labourOt2Hours: offlineCosting.labourOt2Hours || 0,
        labourOt2HoursCalculated: offlineCosting.labourOt2HoursCalculated || 0,
        labourOt2Overridden: offlineCosting.labourOt2Override != null,
        labourOt2Multiplier: offlineCosting.labourOt2Multiplier ?? 2,
        labourOt2MultiplierCalculated: offlineCosting.labourOt2MultiplierCalculated ?? 2,
        labourOt2MultiplierOverridden: offlineCosting.labourOt2MultiplierOverride != null,
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

  // Typing in a tier's hours or multiplier box marks it as a manual override, so the
  // auto figure stops driving it (and a later timer/settings refresh won't overwrite it).
  const handleCostingChange = useCallback((e) => {
    const { name, value } = e.target;
    const flag = OVERRIDE_FLAG[name];
    const min = FIELD_MIN[name] ?? 0;
    const typed = parseFloat(value);
    // A value below the floor is snapped up, but never silently — say why the typed
    // figure vanished. A cleared box (NaN) isn't an attempt at a low value, so no nag;
    // the fixed toast id keeps repeated keystrokes updating one message, not stacking.
    if (Number.isFinite(typed) && typed < min) {
      toast(
        min >= 1
          ? `Overtime multipliers can't go below ×1 — snapped to ×1`
          : `Costing figures can't be negative — snapped to 0`,
        { id: 'costing-min-clamp', icon: '⚠️' }
      );
    }
    setCostingDirty(true);
    setCostingForm(prev => ({
      ...prev,
      [name]: Math.max(min, typed || 0),
      ...(flag ? { [flag]: true } : {})
    }));
  }, []);

  // Drop a tier's manual override and snap its hours back to the auto-tallied figure.
  // tier is '' (normal), 'Ot1', 'Ot2', or 'Holiday'.
  const resetTierHours = useCallback((tier = '') => {
    const hoursKey = `labour${tier}Hours`;
    const calcKey = `labour${tier}HoursCalculated`;
    const flagKey = OVERRIDE_FLAG[hoursKey];
    setCostingDirty(true);
    setCostingForm(prev => ({
      ...prev,
      [hoursKey]: prev[calcKey],
      [flagKey]: false
    }));
  }, []);

  // Drop an overtime tier's hand-typed multiplier and snap it back to the company
  // setting. tier is 'Ot1' or 'Ot2' (the only tiers with a per-job multiplier).
  const resetTierMultiplier = useCallback((tier) => {
    const multKey = `labour${tier}Multiplier`;
    const calcKey = `labour${tier}MultiplierCalculated`;
    const flagKey = OVERRIDE_FLAG[multKey];
    setCostingDirty(true);
    setCostingForm(prev => ({
      ...prev,
      [multKey]: prev[calcKey],
      [flagKey]: false
    }));
  }, []);

  // Fill the base rate with the current company default — a one-tap convenience. It's a
  // plain value set (the job still owns its rate); nothing "follows" the default after.
  const useDefaultRate = useCallback(() => {
    setCostingDirty(true);
    setCostingForm(prev => ({ ...prev, labourRate: prev.labourDefaultRate }));
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
        // Same deal for the two overtime multipliers: a hand-typed figure travels as
        // the override, null tells the server to follow the company setting.
        labourOt1MultiplierOverride: costingForm.labourOt1MultiplierOverridden ? costingForm.labourOt1Multiplier : null,
        labourOt2MultiplierOverride: costingForm.labourOt2MultiplierOverridden ? costingForm.labourOt2Multiplier : null,
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
          // Keep the company-default reference fresh (used only by the "use default" link).
          // The rate box itself is never touched here — the job owns its rate.
          labourDefaultRate: costingRes.labourDefaultRate || 0,
          // Always refresh each tier's calculated reference figure. Only push it into
          // the editable box when the admin hasn't typed their own override, so a manual
          // entry survives a timer tick.
          labourHoursCalculated: costingRes.labourHoursCalculated || 0,
          ...(prev.labourHoursOverridden ? {} : { labourHours: costingRes.labourHoursCalculated || 0 }),
          labourOt1HoursCalculated: costingRes.labourOt1HoursCalculated || 0,
          ...(prev.labourOt1Overridden ? {} : { labourOt1Hours: costingRes.labourOt1HoursCalculated || 0 }),
          labourOt2HoursCalculated: costingRes.labourOt2HoursCalculated || 0,
          ...(prev.labourOt2Overridden ? {} : { labourOt2Hours: costingRes.labourOt2HoursCalculated || 0 }),
          // Keep the company-setting reference for the two OT multipliers fresh, and
          // only push it into the box when the admin hasn't typed their own figure.
          labourOt1MultiplierCalculated: costingRes.labourOt1MultiplierCalculated ?? 1.5,
          ...(prev.labourOt1MultiplierOverridden ? {} : { labourOt1Multiplier: costingRes.labourOt1MultiplierCalculated ?? 1.5 }),
          labourOt2MultiplierCalculated: costingRes.labourOt2MultiplierCalculated ?? 2,
          ...(prev.labourOt2MultiplierOverridden ? {} : { labourOt2Multiplier: costingRes.labourOt2MultiplierCalculated ?? 2 }),
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
    resetTierMultiplier,
    useDefaultRate,
    calculateCostingTotals,
    handleSaveCosting,
    refreshCosting,
    resetCosting
  };
}
