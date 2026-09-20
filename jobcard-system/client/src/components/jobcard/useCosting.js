import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { getDefaultCostingForm } from './mappers';
import { warningToastIcon } from '../common/toastIcons';

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
// a typed 0.5 snaps to ×1 instead of silently pricing that tier at ×0. (A CLEARED box
// is different: it drops the hand-edit and follows the logged / company figure.)
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

// The on-screen form built from a loaded costing row — used when the pricing first loads,
// and again when a save's reply carries the stored figures back.
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

// An invoiced job's pricing saves itself exactly like any other job's — see the note on
// runSave below for why there is no question in front of it any more.
export function useCosting(jobCardId, {
  costing: loadedCosting,
  updateCosting
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
  // The last figures loaded from (or stored by) the server. While it's still null it
  // marks the pricing as never having arrived, which blocks saving. Without that block, a
  // failed load leaves an all-zero screen that the first keystroke would write over the
  // real figures.
  const loadedRef = useRef(null);
  // The figures as they were when THIS job's pricing was first opened. Unlike loadedRef,
  // a successful autosave never touches this — it is set once per opening and left alone,
  // so it stays the right comparison point for the "opened at $X · put it back" hint below the
  // manual money boxes. (loadedRef chases every save, which used to make that hint compare
  // a just-typed figure against itself and disappear about a second after it appeared.)
  const openingRef = useRef(null);
  // Which job is on screen right now, read inside the save so it sees the current value
  // without being rebuilt (and restarting the save timer) on every render of the job
  // screen — so a reply to a save started for a job that has since been closed can be
  // recognised as stale rather than applied to the next one.
  const jobCardIdRef = useRef(jobCardId);
  jobCardIdRef.current = jobCardId;

  // Fill the form from the costing loaded for this job. That load happens once per
  // opening — the save no longer re-reads.
  useEffect(() => {
    if (loadedCosting) {
      loadedRef.current = loadedCosting;
      openingRef.current = loadedCosting;
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
    // A cleared override box means "go back to the logged / company figure", not "0 by
    // hand". Leave it blank on screen and drop the hand-edit: the save then sends no
    // override, and the reply fills the box with the logged figure. Typing 0 still means 0.
    if (flag && !Number.isFinite(typed)) {
      markEdited();
      setCostingForm(prev => ({ ...prev, [name]: '', [flag]: false }));
      return;
    }
    // A value below the floor is snapped up, but never silently — say why the typed
    // figure vanished. A cleared box (NaN) isn't an attempt at a low value, so no nag;
    // the fixed toast id keeps repeated keystrokes updating one message, not stacking.
    if (Number.isFinite(typed) && typed < min) {
      toast(
        min >= 1
          ? `Overtime multipliers can't go below ×1 — snapped to ×1`
          : `Costing figures can't be negative — snapped to 0`,
        { id: 'costing-min-clamp', icon: warningToastIcon }
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
    // A cleared override box ('') is "follow the logged / company figure", so the totals
    // price it at that figure — not at 0 — while the box sits blank waiting for the reply.
    const fig = (k) => costingForm[k] === '' ? (costingForm[`${k}Calculated`] || 0) : costingForm[k];
    const labourTotal = fig('labourHours') * costingForm.labourRate;
    const labourOt1Total = fig('labourOt1Hours') * costingForm.labourRate * fig('labourOt1Multiplier');
    const labourOt2Total = fig('labourOt2Hours') * costingForm.labourRate * fig('labourOt2Multiplier');
    const labourHolidayTotal = fig('labourHolidayHours') * costingForm.labourRate * costingForm.labourHolidayMultiplier;
    const labourSpecialTotal = costingForm.labourSpecialHours * costingForm.labourSpecialRate;
    const materialsTotal = costingForm.materialsCost * (1 + costingForm.materialsProfitPercent / 100);
    const subcontractorTotal = costingForm.subcontractorCost * (1 + costingForm.subcontractorProfitPercent / 100);
    const grandTotal = labourTotal + labourOt1Total + labourOt2Total + labourHolidayTotal
      + labourSpecialTotal + materialsTotal + subcontractorTotal;

    return { labourTotal, labourOt1Total, labourOt2Total, labourHolidayTotal, labourSpecialTotal, materialsTotal, subcontractorTotal, grandTotal };
  }, [costingForm]);

  // Send the current figures. Returns true when they're safely stored and false when the
  // save failed. Callers that gate an irreversible step on the save (invoicing files the
  // job away) rely on the false case to abort instead of proceeding with unsaved numbers.
  //
  // An invoiced job is saved the same as any other. It used to ask "change an invoiced
  // job?" first, once per opening — but with no Save button that question had to come off
  // the one-second countdown, so it spoke a beat after the typing stopped and with nobody
  // having clicked anything. The sheet is admin-only, the server accepts the change either
  // way, and every figure is recorded in the activity trail with its old and new value, so
  // the question was a speed bump rather than a gate. Saving straight through is the
  // behaviour the rest of the sheet already has.
  const runSave = useCallback(async () => {
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
  // pricing screen, and by closing the job.
  const flushCosting = useCallback(async () => {
    if (!costingDirty) return true;
    setAutoSavePaused(false);
    return saveNowRef.current();
  }, [costingDirty]);

  // Used by the invoicing paths, which run their own "this will archive the job / your
  // unsaved pricing will be billed" prompt before calling it.
  const handleSaveCosting = useCallback(() => saveNowRef.current(), []);

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
    loadedRef.current = null;
    openingRef.current = null;
    // Count the reset as an edit, so a close-time save that resolves after the job is
    // reopened fails runSave's "nothing typed since" check and is dropped rather than
    // adopted onto the freshly blanked form (which would file blank notes as loaded).
    editSeq.current += 1;
    setCostingForm(getDefaultCostingForm());
  }, []);

  // The manual money lines (materials, subcontractor, special labour) have no
  // "reset to auto" link the way the tier hours/multipliers do — this is what the
  // pricing screen's per-field "put it back" control compares against. It is captured
  // ONCE, from openingRef, when the job's pricing is first opened, and never moves again
  // as the screen saves itself: comparing against the last save instead would make the
  // control vanish about a second after it appeared, since this sheet saves on every
  // edit. So for as long as the job stays open it keeps offering the figure the job was
  // opened with, even once later autosaves have moved the actually-stored value past it.
  const openedAt = openingRef.current ? formFromCosting(openingRef.current) : null;

  return {
    costingForm,
    costingSaveState: saveState,
    costingDirty,
    openedAt,
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
