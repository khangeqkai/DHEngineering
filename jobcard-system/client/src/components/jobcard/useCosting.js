import { useState, useEffect, useCallback, useRef } from 'react';
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

// The free-text notes on the three manual cost lines. Everything else on this screen is
// a number, so the change handler runs values through parseFloat — these must skip that
// or every letter typed would be thrown away.
const TEXT_FIELDS = new Set([
  'labourSpecialDescription',
  'materialsDescription',
  'subcontractorDescription'
]);

// How long the screen waits after the last edit before saving itself. Long enough that
// tabbing through several boxes lands as ONE save (and so one audit entry rather than
// one per box), short enough that a figure typed and walked away from is never lost.
const AUTOSAVE_DELAY = 1000;

// The on-screen form built from a loaded costing row. Used both when the pricing first
// loads and when an edit to an invoiced job is declined (snap back to what was billed).
function formFromCosting(c) {
  return {
    labourHours: c.labourHours || 0,
    labourHoursCalculated: c.labourHoursCalculated || 0,
    labourHoursOverridden: c.labourHoursOverride != null,
    labourRate: c.labourRate || 0,
    labourDefaultRate: c.labourDefaultRate || 0,
    labourOt1Hours: c.labourOt1Hours || 0,
    labourOt1HoursCalculated: c.labourOt1HoursCalculated || 0,
    labourOt1Overridden: c.labourOt1Override != null,
    labourOt1Multiplier: c.labourOt1Multiplier ?? 1.5,
    labourOt1MultiplierCalculated: c.labourOt1MultiplierCalculated ?? 1.5,
    labourOt1MultiplierOverridden: c.labourOt1MultiplierOverride != null,
    labourOt2Hours: c.labourOt2Hours || 0,
    labourOt2HoursCalculated: c.labourOt2HoursCalculated || 0,
    labourOt2Overridden: c.labourOt2Override != null,
    labourOt2Multiplier: c.labourOt2Multiplier ?? 2,
    labourOt2MultiplierCalculated: c.labourOt2MultiplierCalculated ?? 2,
    labourOt2MultiplierOverridden: c.labourOt2MultiplierOverride != null,
    labourHolidayHours: c.labourHolidayHours || 0,
    labourHolidayHoursCalculated: c.labourHolidayHoursCalculated || 0,
    labourHolidayOverridden: c.labourHolidayOverride != null,
    labourHolidayMultiplier: c.labourHolidayMultiplier ?? 2.5,
    labourSpecialHours: c.labourSpecialHours || 0,
    labourSpecialRate: c.labourSpecialRate || 0,
    materialsCost: c.materialsCost || 0,
    materialsProfitPercent: c.materialsProfitPercent ?? 100,
    subcontractorCost: c.subcontractorCost || 0,
    subcontractorProfitPercent: c.subcontractorProfitPercent ?? 0,
    labourSpecialDescription: c.labourSpecialDescription || '',
    materialsDescription: c.materialsDescription || '',
    subcontractorDescription: c.subcontractorDescription || ''
  };
}

// `isInvoiced` + `confirmInvoicedEdit` drive the one-per-opening "change an invoiced
// job?" question: with no Save button to hang it on, the question is asked the first
// time an auto-save would change a job that's already been billed.
export function useCosting(jobCardId, {
  costing: loadedCosting,
  updateCosting,
  isInvoiced = false,
  confirmInvoicedEdit
} = {}) {
  const [costingForm, setCostingForm] = useState(getDefaultCostingForm());
  const [savingCosting, setSavingCosting] = useState(false);
  // True when the pricing screen has hand edits that haven't been saved yet. Used to
  // warn/save before invoicing so unsaved edits aren't lost when the job is filed away.
  const [costingDirty, setCostingDirty] = useState(false);
  // What the status line beside the grand total shows, in place of the old Save button:
  // 'idle' | 'pending' (edited, save due) | 'saving' | 'saved' | 'error'.
  const [saveState, setSaveState] = useState('idle');
  // A failed save stops the countdown re-arming itself, so a server that's down gets one
  // attempt per typing burst instead of one every second. Cleared by the next edit or by
  // the "try again" link.
  const [autoSavePaused, setAutoSavePaused] = useState(false);

  // Bumped by every hand edit. A save snapshots it and only reports "saved" when nothing
  // was typed while the request was in flight — otherwise those keystrokes would be
  // marked saved without ever having been sent.
  const editSeq = useRef(0);
  // The "change an invoiced job?" question is answered once per opening, then remembered.
  const invoicedAck = useRef(false);
  // The edit count as at the moment that question was last answered "no". While nothing
  // further has been typed, another save attempt is simply dropped instead of asking the
  // same question again (two saves can land together — a keypress and the countdown).
  const declinedAtSeq = useRef(null);
  // The last figures loaded from (or stored by) the server. Two jobs: it's what a declined
  // edit on an invoiced job snaps back to, and — while it's still null — it marks the
  // pricing as never having arrived, which blocks saving. Without that block, a failed
  // load leaves an all-zero screen that the first keystroke would write over the real
  // figures.
  const loadedRef = useRef(null);
  // Read inside the save, which must see the current values without being rebuilt (and
  // restarting the save timer) on every render of the job screen.
  const isInvoicedRef = useRef(isInvoiced);
  const confirmRef = useRef(confirmInvoicedEdit);
  isInvoicedRef.current = isInvoiced;
  confirmRef.current = confirmInvoicedEdit;
  // Which job is on screen right now, so a reply to a save started for a job that has
  // since been closed can be recognised as stale rather than applied to the next one.
  const jobCardIdRef = useRef(jobCardId);
  jobCardIdRef.current = jobCardId;

  // Fill the form from the costing loaded for this job. That load happens once per
  // opening (the save no longer re-reads), so this is also where the invoiced-job
  // question resets to being asked again.
  useEffect(() => {
    if (loadedCosting) {
      loadedRef.current = loadedCosting;
      invoicedAck.current = false;
      declinedAtSeq.current = null;
      setCostingDirty(false);
      setSaveState('idle');
      setCostingForm(formFromCosting(loadedCosting));
    }
  }, [loadedCosting]);

  // Every hand edit marks the screen as owing a save and restarts the save timer.
  const markEdited = useCallback(() => {
    editSeq.current += 1;
    setCostingDirty(true);
    setSaveState('pending');
    setAutoSavePaused(false);
  }, []);

  // Typing in a tier's hours or multiplier box marks it as a manual override, so the
  // auto figure stops driving it (and a later timer/settings refresh won't overwrite it).
  const handleCostingChange = useCallback((e) => {
    const { name, value } = e.target;
    if (TEXT_FIELDS.has(name)) {
      markEdited();
      setCostingForm(prev => ({ ...prev, [name]: value }));
      return;
    }
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
    markEdited();
    setCostingForm(prev => ({
      ...prev,
      [name]: Math.max(min, typed || 0),
      ...(flag ? { [flag]: true } : {})
    }));
  }, [markEdited]);

  // Drop a tier's manual override and snap its hours back to the auto-tallied figure.
  // tier is '' (normal), 'Ot1', 'Ot2', or 'Holiday'.
  const resetTierHours = useCallback((tier = '') => {
    const hoursKey = `labour${tier}Hours`;
    const calcKey = `labour${tier}HoursCalculated`;
    const flagKey = OVERRIDE_FLAG[hoursKey];
    markEdited();
    setCostingForm(prev => ({
      ...prev,
      [hoursKey]: prev[calcKey],
      [flagKey]: false
    }));
  }, [markEdited]);

  // Drop an overtime tier's hand-typed multiplier and snap it back to the company
  // setting. tier is 'Ot1' or 'Ot2' (the only tiers with a per-job multiplier).
  const resetTierMultiplier = useCallback((tier) => {
    const multKey = `labour${tier}Multiplier`;
    const calcKey = `labour${tier}MultiplierCalculated`;
    const flagKey = OVERRIDE_FLAG[multKey];
    markEdited();
    setCostingForm(prev => ({
      ...prev,
      [multKey]: prev[calcKey],
      [flagKey]: false
    }));
  }, [markEdited]);

  // Fill the base rate with the current company default — a one-tap convenience. It's a
  // plain value set (the job still owns its rate); nothing "follows" the default after.
  const useDefaultRate = useCallback(() => {
    markEdited();
    setCostingForm(prev => ({ ...prev, labourRate: prev.labourDefaultRate }));
  }, [markEdited]);

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

  // Send the current figures. Returns true when they're safely stored, false when the
  // save failed, and 'declined' when the user turned down changing an invoiced job (the
  // figures snap back to what was billed, so nothing is left pending). Callers that gate
  // an irreversible step on the save (invoicing files the job away) rely on the false
  // case to abort instead of proceeding with unsaved numbers.
  //
  // `skipConfirm` is for the invoicing paths: they run their own "this will archive the
  // job / your unsaved pricing will be billed" prompt, so asking again here would be a
  // second dialog for the same decision.
  const runSave = useCallback(async ({ skipConfirm = false } = {}) => {
    if (!jobCardId) return true; // nothing to save (new card) — not a failure

    // The job's stored pricing never arrived (the load failed, or hasn't finished). The
    // boxes are showing an empty sheet, so sending it would write zeros over the job's
    // real rate, materials, subcontractor figures and notes. Refuse instead.
    if (!loadedRef.current) {
      setSaveState('error');
      setAutoSavePaused(true);
      toast.error("This job's pricing hasn't loaded — reopen the pricing screen before making changes.", { id: 'costing-not-loaded' });
      return false;
    }

    // Changing a job that's already been billed is asked once per opening, then
    // remembered — with no Save button, there's nothing else to hang the question on.
    if (isInvoicedRef.current && !invoicedAck.current && !skipConfirm) {
      // Already said no, and nothing typed since — don't ask the same question twice
      // when a keypress and the countdown both call for a save. Same outcome as the
      // decline itself, so it reports the same way.
      if (declinedAtSeq.current === editSeq.current) return 'declined';
      const ok = confirmRef.current ? await confirmRef.current() : true;
      if (!ok) {
        // "No" means leave the billed figures alone — put back what was loaded, and say
        // so, since the pricing visibly snaps back to what it was.
        setCostingForm(formFromCosting(loadedRef.current));
        declinedAtSeq.current = editSeq.current;
        setCostingDirty(false);
        setSaveState('idle');
        toast('Pricing left as invoiced — your changes were not kept.', { id: 'costing-declined', icon: '⚠️' });
        // Not 'false': nothing failed and nothing is left pending, so a caller that was
        // waiting on this save (the job form's Update) can carry on with the rest of
        // its save instead of silently doing nothing.
        return 'declined';
      }
      invoicedAck.current = true;
    }

    const seq = editSeq.current;
    setSavingCosting(true);
    setSaveState('saving');
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
      const stored = await updateCosting(costingData);
      // Only call it saved when nothing was typed while the request was in flight —
      // otherwise those later keystrokes would look stored without ever being sent.
      // Leaving it dirty re-arms the save timer as soon as this save finishes.
      // The job must also still be the one on screen: a save that started as a job was
      // closed can land after the next job has opened, and its figures would otherwise
      // be adopted onto that job.
      if (editSeq.current === seq && jobCardIdRef.current === jobCardId) {
        // Adopt what the server actually stored. It folds in any time logged since the
        // screen loaded, so its totals can be higher than the ones worked out here —
        // without this the grand total on screen quietly drifts from the billed one.
        // Safe to replace every box: nothing was typed while the save was in flight.
        if (stored) {
          loadedRef.current = stored;
          setCostingForm(prev => {
            const next = formFromCosting(stored);
            // Keep the notes exactly as they are in the boxes. The server trims them for
            // storage, so swapping the stored copy back in mid-sentence would eat the
            // space just typed before the next word ("Weekend " → "Weekendshift").
            for (const field of TEXT_FIELDS) next[field] = prev[field];
            return next;
          });
        }
        setCostingDirty(false);
        setSaveState('saved');
      }
      return true;
    } catch (err) {
      setSaveState('error');
      setAutoSavePaused(true);
      toast.error(err.message || 'Failed to save costing');
      return false;
    } finally {
      setSavingCosting(false);
    }
  }, [jobCardId, costingForm, calculateCostingTotals, updateCosting]);

  // Read by the queue below so a save that waits its turn sends the figures as they are
  // when it finally runs, not as they were when it was asked for.
  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;

  // One save at a time, but a second caller is QUEUED BEHIND the first rather than handed
  // the first one's promise. That promise carries the figures from when it started, so
  // handing it back would tell an invoicing or closing caller "saved" about keystrokes
  // that were never sent — and file the job away billing the older number.
  const inFlight = useRef(null);
  const saveNow = useCallback((options) => {
    const runNext = () => runSaveRef.current(options);
    const chained = inFlight.current
      ? inFlight.current.then(runNext, runNext)
      : runNext();
    const tracked = chained.finally(() => {
      if (inFlight.current === tracked) inFlight.current = null;
    });
    inFlight.current = tracked;
    return tracked;
  }, []);

  // Held in a ref so the save timer below can fire the newest save without listing it as
  // a dependency — the job screen re-renders every second while a timer runs, and a
  // dependency that changes identity each render would restart the timer forever.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  // The auto-save itself: every edit restarts a short countdown, so a burst of typing
  // (or tabbing across boxes) lands as one save. Nothing overlaps an in-flight save —
  // when that finishes, an edit made during it re-arms this.
  useEffect(() => {
    if (!costingDirty || savingCosting || autoSavePaused) return undefined;
    const timerId = setTimeout(() => { saveNowRef.current(); }, AUTOSAVE_DELAY);
    return () => clearTimeout(timerId);
  }, [costingForm, costingDirty, savingCosting, autoSavePaused]);

  // Save right now instead of waiting out the countdown — used by Enter, by leaving the
  // pricing screen, and by closing the job. `withoutPrompt` is for the close path: the
  // job screen is gone by then, so a dialog can't be shown. That case returns
  // 'needs-confirm' (rather than a plain false, which means the save itself failed) so
  // the caller can say why the change wasn't kept.
  const flushCosting = useCallback(async ({ withoutPrompt = false } = {}) => {
    if (!costingDirty) return true;
    if (withoutPrompt && isInvoicedRef.current && !invoicedAck.current) return 'needs-confirm';
    setAutoSavePaused(false);
    return saveNowRef.current();
  }, [costingDirty]);

  // The invoicing paths ask their own question before saving, so they skip this one.
  const handleSaveCosting = useCallback(() => saveNowRef.current({ skipConfirm: true }), []);

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
    setSaveState('idle');
    invoicedAck.current = false;
    declinedAtSeq.current = null;
    loadedRef.current = null;
    setCostingForm(getDefaultCostingForm());
  }, []);

  return {
    costingForm,
    costingSaveState: saveState,
    costingDirty,
    flushCosting,
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
