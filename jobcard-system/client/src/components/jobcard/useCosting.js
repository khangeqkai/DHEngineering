import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { getDefaultCostingForm } from './mappers';
import { capitalizeFirst } from '../../utils/formatters';
import { useFieldErrors, scrollFieldIntoView } from '../../hooks/useFieldErrors';

// Which override flag each hand-editable box drives. Note the normal tier's hours flag
// is `labourHoursOverridden` (with "Hours"), while the OT/holiday tiers drop it — so this
// map is the single source of truth rather than deriving the name from the tier key.
// The two overtime multipliers follow the same pattern: typing in the box marks the
// job as owning its own multiplier instead of following the company setting. It also
// doubles as "is this box an override box at all" — every numeric box on the sheet that
// ISN'T a key here is a plain box (see commitBox and parsedDraftValue below).
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
// floor at ×1 (below 1 would undercharge overtime — the server refuses it). Everything
// else floors at 0. A box below its floor is refused outright now (see commitBox) —
// there is no more silent snapping.
const FIELD_MIN = {
  labourOt1Multiplier: 1,
  labourOt2Multiplier: 1
};

// The free-text notes on the three manual cost lines. Everything else on this screen is
// a number, so commitBox runs these through capitalizeFirst instead of the numeric checks.
const TEXT_FIELDS = new Set([
  'labourSpecialDescription',
  'materialsDescription',
  'subcontractorDescription'
]);

// A plain decimal, deliberately allowing a leading "-": a negative figure is still A
// NUMBER as far as this pattern is concerned, so it reaches the floor check below and
// reads "Can't be negative."/"Can't be below ×1." rather than the less helpful
// "Enter a number." — only genuine junk ("abc", a lone "-" or ".") fails to match.
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$|^-?\.\d+$/;

const floorMessage = (min) => (min >= 1 ? "Can't be below ×1." : "Can't be negative.");

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

// What a box currently being typed in (a draft, not yet committed) is worth for the
// LIVE totals only — never sent. A blank plain box prices at 0; a blank override box
// prices at its calculated figure, exactly like the committed form does once the box is
// actually left; anything that doesn't parse as a number prices at 0 rather than NaN-ing
// the whole total while someone is still mid-keystroke.
function parsedDraftValue(name, text, committedForm) {
  const trimmed = text.trim();
  if (trimmed === '') {
    return OVERRIDE_FLAG[name] ? (committedForm[`${name}Calculated`] ?? 0) : 0;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : 0;
}

// An invoiced job's pricing saves itself exactly like any other job's — see the note on
// runSave below for why there is no question in front of it any more.
export function useCosting(jobCardId, {
  costing: loadedCosting,
  updateCosting
} = {}) {
  // The committed figures — numbers and flags, exactly as they'll be sent. The only
  // thing a save ever reads. Never holds a box's half-typed text; see `drafts` below.
  const [costingForm, setCostingForm] = useState(getDefaultCostingForm());
  // What's being typed right now, keyed by field name, for every box on the sheet —
  // number boxes and the three description boxes alike. A field with no entry here shows
  // its committed figure; one with an entry shows exactly what's been typed, however
  // half-formed. Nothing here is ever sent — see commitBox, the only place a draft turns
  // into a committed figure (or is found wanting and stays a draft, marked red).
  const [drafts, setDrafts] = useState({});
  // A box's shown value is its draft if one exists, else its committed figure —
  // exactly what shownCostingForm (below) renders, read here directly off drafts/
  // costingForm rather than waiting for that merged object to be built.
  const { fieldErrors, setFieldErrors, clearAll: clearAllFieldErrors, fieldProps, errorProps } = useFieldErrors(
    (name) => (name in drafts ? drafts[name] : costingForm[name])
  );
  const [savingCosting, setSavingCosting] = useState(false);
  // True when the pricing screen has hand edits that haven't been saved yet. Used to
  // warn/save before invoicing so unsaved edits aren't lost when the job is filed away.
  const [costingDirty, setCostingDirty] = useState(false);
  // What the status line beside the grand total shows, in place of the old Save button:
  // 'idle' | 'pending' (edited, save due) | 'saving' | 'saved' | 'error'. A box sitting
  // red overrides all of these on the way out — see costingSaveState in the return below.
  const [saveState, setSaveState] = useState('idle');
  // How many of this screen's writes the server has confirmed during this opening —
  // the pricing half of the job window's "that reached the job" green, counted the same
  // way and for the same reason as the job's own writes (useSaveQueue.js's landedCount).
  // `costingDirty` going false cannot stand in for it: it also goes false when a figure
  // is put back the way it was, and answering that with green would report a save that
  // never happened. Reset with the rest of the screen on open, so it only ever counts
  // this job's landings.
  const [landedCount, setLandedCount] = useState(0);
  // A failed save stops leaving a box from retrying, so a server that's down gets one
  // attempt per edit instead of one per box tabbed across. Cleared by the next edit or by
  // the "try again" link.
  const [autoSavePaused, setAutoSavePaused] = useState(false);

  // Bumped by every hand edit. A save snapshots it and only reports "saved" when nothing
  // was typed while the request was in flight — otherwise those keystrokes would be
  // marked saved without ever having been sent.
  const editSeq = useRef(0);
  // The edit count the save currently in flight snapshotted, or null when nothing is in
  // flight. It lets a flush tell "a save carrying exactly these figures is already on its
  // way" apart from "something has been typed since that save started".
  const inFlightSeq = useRef(null);
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
      setDrafts({});
      clearAllFieldErrors();
    }
    // clearAllFieldErrors is stable (useCallback with no deps in useFieldErrors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedCosting]);

  // Every hand edit marks the screen as owing a save and restarts the save timer.
  const markEdited = useCallback(() => {
    editSeq.current += 1;
    setCostingDirty(true);
    setSaveState('pending');
    setAutoSavePaused(false);
  }, []);

  // Every keystroke in any box — number or text — just records what's being typed.
  // Nothing else happens here: no parsing, no clamping, no toast, no save. commitBox
  // (below) is the only place a draft is ever judged.
  const handleCostingChange = useCallback((e) => {
    const { name, value } = e.target;
    setDrafts(prev => ({ ...prev, [name]: value }));
  }, []);

  // Save now — carried out ONE RENDER from now. Asked for
  // by every figure changed by PRESSING A LINK rather than by typing (a tier's "reset to
  // logged", an overtime multiplier's "standard ×N", "use company default", "put it back",
  // "Reset all to auto"), which has no box for the user to leave, and by commitBox below.
  //
  // It is a request rather than a call because the save has to read the figures as they
  // are AFTER the change it belongs to, and the handler asking for it cannot: the new
  // value is still a queued state update at that point, so saving there would send the
  // one it replaced. Bumping this counter lets the effect further down carry it out when
  // the new figures are really on screen. Several bumps in one render (Reset all to auto
  // resets six things) batch into a single save.
  const [immediateSaveSeq, setImmediateSaveSeq] = useState(0);
  // The save that has been asked for but not yet carried out, held as a promise anyone
  // can wait on. Without it, leaving the pricing screen in the same breath as a box was
  // left saw no save in flight yet, started one of its own carrying the figures from
  // BEFORE that box tidied itself, and then ran the requested one behind it for nothing.
  const pendingImmediate = useRef(null);
  const requestImmediateSave = useCallback(() => {
    if (!pendingImmediate.current) {
      let settle;
      const promise = new Promise((resolve) => { settle = resolve; });
      pendingImmediate.current = { promise, settle };
    }
    setImmediateSaveSeq(n => n + 1);
    return pendingImmediate.current.promise;
  }, []);

  // Nothing is going to carry out a requested save once this screen is gone, so anything
  // waiting on one is told so rather than left hanging on a promise that never settles.
  useEffect(() => () => {
    if (pendingImmediate.current) {
      pendingImmediate.current.settle(false);
      pendingImmediate.current = null;
    }
  }, []);

  // The single place a draft becomes a committed figure — or is found wanting and stays
  // a draft, marked red. Called by a box's blur (which already covers Tab, click-away,
  // Escape-then-close, tab switch) and by Enter; both go through the same function so
  // there is exactly one moment a typed box is judged. Returns { ok } so a caller that
  // needs to know whether the box actually cleared (flushCosting, guardLeaveCosting) can
  // tell without waiting on the field-error state to re-render.
  const commitBox = useCallback((name) => {
    if (!(name in drafts)) return { ok: true }; // nothing being typed here — nothing to do

    const raw = drafts[name];

    if (TEXT_FIELDS.has(name)) {
      const formatted = capitalizeFirst(raw);
      setDrafts(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      if (formatted !== costingForm[name]) {
        markEdited();
        setCostingForm(prev => ({ ...prev, [name]: formatted }));
        requestImmediateSave();
      }
      return { ok: true };
    }

    const flag = OVERRIDE_FLAG[name];
    const min = FIELD_MIN[name] ?? 0;
    const trimmed = raw.trim();

    // Blank: a plain box commits to 0; an override box drops the hand figure and
    // follows the logged/company figure instead — never a typed 0 either way, just
    // nothing typed at all.
    if (trimmed === '') {
      setDrafts(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      if (flag) {
        const calcVal = costingForm[`${name}Calculated`] ?? 0;
        if (costingForm[name] !== calcVal || costingForm[flag] !== false) {
          markEdited();
          setCostingForm(prev => ({ ...prev, [name]: calcVal, [flag]: false }));
          requestImmediateSave();
        }
      } else if (costingForm[name] !== 0) {
        markEdited();
        setCostingForm(prev => ({ ...prev, [name]: 0 }));
        requestImmediateSave();
      }
      return { ok: true };
    }

    // Not blank: it has to actually be a number, and clear the floor, or it stays a
    // draft — keep the typed text, mark it red, send nothing.
    if (!NUMERIC_PATTERN.test(trimmed)) {
      setFieldErrors({ [name]: 'Enter a number.' }, { [name]: raw });
      return { ok: false };
    }
    const parsed = parseFloat(trimmed);
    if (parsed < min) {
      setFieldErrors({ [name]: floorMessage(min) }, { [name]: raw });
      return { ok: false };
    }

    // Valid — commit it, but only actually save when it changed. Leaving a box that was
    // typed in and then put back exactly as it was is not an edit.
    setDrafts(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    const changed = costingForm[name] !== parsed || (flag ? costingForm[flag] !== true : false);
    if (changed) {
      markEdited();
      setCostingForm(prev => ({ ...prev, [name]: parsed, ...(flag ? { [flag]: true } : {}) }));
      requestImmediateSave();
    }
    return { ok: true };
  }, [drafts, costingForm, markEdited, requestImmediateSave, setFieldErrors]);

  // Drop every box's typed text and the errors that go with them, without committing
  // anything — used when the person answers "discard" to the red-box question on close
  // or on leaving the tab. Every box then falls back to showing its last committed
  // (i.e. last saved) figure, exactly as if nothing had been typed this visit.
  const discardCostingDrafts = useCallback(() => {
    setDrafts({});
    clearAllFieldErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop a tier's manual override and snap its hours back to the auto-tallied figure.
  // tier is '' (normal), 'Ot1', 'Ot2', or 'Holiday'.
  const resetTierHours = useCallback((tier = '') => {
    const hoursKey = `labour${tier}Hours`;
    const calcKey = `labour${tier}HoursCalculated`;
    const flagKey = OVERRIDE_FLAG[hoursKey];
    setDrafts(prev => {
      if (!(hoursKey in prev)) return prev;
      const next = { ...prev };
      delete next[hoursKey];
      return next;
    });
    markEdited();
    setCostingForm(prev => ({
      ...prev,
      [hoursKey]: prev[calcKey],
      [flagKey]: false
    }));
    requestImmediateSave();
  }, [markEdited, requestImmediateSave]);

  // Drop an overtime tier's hand-typed multiplier and snap it back to the company
  // setting. tier is 'Ot1' or 'Ot2' (the only tiers with a per-job multiplier).
  const resetTierMultiplier = useCallback((tier) => {
    const multKey = `labour${tier}Multiplier`;
    const calcKey = `labour${tier}MultiplierCalculated`;
    const flagKey = OVERRIDE_FLAG[multKey];
    setDrafts(prev => {
      if (!(multKey in prev)) return prev;
      const next = { ...prev };
      delete next[multKey];
      return next;
    });
    markEdited();
    setCostingForm(prev => ({
      ...prev,
      [multKey]: prev[calcKey],
      [flagKey]: false
    }));
    requestImmediateSave();
  }, [markEdited, requestImmediateSave]);

  // Fill the base rate with the current company default — a one-tap convenience. It's a
  // plain value set (the job still owns its rate); nothing "follows" the default after.
  const useDefaultRate = useCallback(() => {
    setDrafts(prev => {
      if (!('labourRate' in prev)) return prev;
      const next = { ...prev };
      delete next.labourRate;
      return next;
    });
    markEdited();
    setCostingForm(prev => ({ ...prev, labourRate: prev.labourDefaultRate }));
    requestImmediateSave();
  }, [markEdited, requestImmediateSave]);

  // The "opened at $X · put it back" link beside each manual money box. It sets the
  // committed value directly (dropping that box's draft and error, if any) and saves
  // straight away like the other links — typing into the same box must not.
  const revertField = useCallback((name, value) => {
    const parsed = parseFloat(value);
    setDrafts(prev => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    markEdited();
    setCostingForm(prev => ({ ...prev, [name]: Number.isFinite(parsed) ? parsed : 0 }));
    requestImmediateSave();
  }, [markEdited, requestImmediateSave]);

  // The figures actually priced right now. With no form argument, that's the committed
  // figures overlaid with every box currently being typed in (parsed per the rules in
  // parsedDraftValue) — what the sheet's own totals and the header running total show
  // live, updating on every keystroke without sending anything. Callers that already
  // have the exact committed form to price (runSave, sending only what was just
  // committed) pass it explicitly and get no draft overlay at all.
  const calculateCostingTotals = useCallback((form) => {
    const fig = (name) => {
      if (form) return form[name];
      if (name in drafts) return parsedDraftValue(name, drafts[name], costingForm);
      return costingForm[name];
    };
    const labourRate = fig('labourRate');
    const labourTotal = fig('labourHours') * labourRate;
    const labourOt1Total = fig('labourOt1Hours') * labourRate * fig('labourOt1Multiplier');
    const labourOt2Total = fig('labourOt2Hours') * labourRate * fig('labourOt2Multiplier');
    const labourHolidayTotal = fig('labourHolidayHours') * labourRate * fig('labourHolidayMultiplier');
    const labourSpecialTotal = fig('labourSpecialHours') * fig('labourSpecialRate');
    const materialsTotal = fig('materialsCost') * (1 + fig('materialsProfitPercent') / 100);
    const subcontractorTotal = fig('subcontractorCost') * (1 + fig('subcontractorProfitPercent') / 100);
    const grandTotal = labourTotal + labourOt1Total + labourOt2Total + labourHolidayTotal
      + labourSpecialTotal + materialsTotal + subcontractorTotal;

    return { labourTotal, labourOt1Total, labourOt2Total, labourHolidayTotal, labourSpecialTotal, materialsTotal, subcontractorTotal, grandTotal };
  }, [costingForm, drafts]);

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
      toastNotLoaded();
      return false;
    }

    const form = costingForm;
    const seq = editSeq.current;
    // What this save covers, for flushCosting to compare against — see there.
    inFlightSeq.current = seq;
    setSavingCosting(true);
    setSaveState('saving');
    try {
      const totals = calculateCostingTotals(form);
      const costingData = {
        ...form,
        // Send each tier's manual hours only when overridden; null tells the server to
        // use its auto tally. The server recomputes every total from these + settings.
        labourHoursOverride: form.labourHoursOverridden ? form.labourHours : null,
        labourOt1Override: form.labourOt1Overridden ? form.labourOt1Hours : null,
        labourOt2Override: form.labourOt2Overridden ? form.labourOt2Hours : null,
        labourHolidayOverride: form.labourHolidayOverridden ? form.labourHolidayHours : null,
        // Same deal for the two overtime multipliers: a hand-typed figure travels as
        // the override, null tells the server to follow the company setting.
        labourOt1MultiplierOverride: form.labourOt1MultiplierOverridden ? form.labourOt1Multiplier : null,
        labourOt2MultiplierOverride: form.labourOt2MultiplierOverridden ? form.labourOt2Multiplier : null,
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
      // otherwise those later keystrokes would look stored without ever having been sent.
      // Left dirty, they go out with the next box left, Enter, or flush.
      // The job must also still be the one on screen: a save that started as a job was
      // closed can land after the next job has opened, and its figures would otherwise
      // be adopted onto that job.
      if (editSeq.current === seq && jobCardIdRef.current === jobCardId) {
        // Adopt what the server actually stored. It folds in any time logged since the
        // screen loaded, so its totals can be higher than the ones worked out here —
        // without this the grand total on screen quietly drifts from the billed one.
        // Safe to replace every box — nothing was typed anywhere while this save was in
        // flight (a box someone started typing in during the wait would still carry a
        // draft, which display already overlays on top of whatever this puts in below).
        if (stored) {
          loadedRef.current = stored;
          setCostingForm(prev => {
            const next = formFromCosting(stored);
            // Keep the notes exactly as they are in the boxes when nothing was typed in
            // them (there is no draft to preserve instead) — the server trims them for
            // storage, and swapping the trimmed copy back in would only ever differ by
            // that trim, never by wording, since nothing was typed meanwhile.
            for (const field of TEXT_FIELDS) {
              if (!(field in drafts)) next[field] = prev[field];
            }
            return next;
          });
        }
        setCostingDirty(false);
        setSaveState('saved');
        setLandedCount(n => n + 1);
      }
      return true;
    } catch (err) {
      setSaveState('error');
      setAutoSavePaused(true);
      toastSaveFailed(err);
      return false;
    } finally {
      inFlightSeq.current = null;
      setSavingCosting(false);
    }
  }, [jobCardId, costingForm, calculateCostingTotals, updateCosting, drafts]);

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

  // Held in a ref so the effect below and flushCosting fire the newest save without
  // listing it as a dependency — the job screen re-renders every second while a timer
  // runs, and a dependency that changes identity each render would re-fire them.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  // Carries out a requested save one render after it was asked for, so it sends the
  // figures that change produced rather than the ones it replaced. See
  // requestImmediateSave above.
  useEffect(() => {
    if (immediateSaveSeq === 0) return;
    const waiting = pendingImmediate.current;
    pendingImmediate.current = null;
    const saved = saveNowRef.current();
    if (waiting) saved.then(waiting.settle, () => waiting.settle(false));
  }, [immediateSaveSeq]);

  // Held in refs so flushCosting and guardLeaveCosting (both stable-ish callbacks used
  // from effects and event handlers elsewhere) always commit against the CURRENT set of
  // drafts and errors rather than whatever was on screen when they were created.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const commitBoxRef = useRef(commitBox);
  commitBoxRef.current = commitBox;

  // Commit every box still being typed in — leaving the tab, closing the job and
  // invoicing are all "leave every box at once". Each one either lands (valid) or stays
  // a draft, marked red (invalid); nothing is ever discarded here. Returns the name of
  // the first box that stayed red, or null when everything committed cleanly.
  const commitAllBoxes = useCallback(() => {
    let firstInvalid = null;
    for (const name of Object.keys(draftsRef.current)) {
      const result = commitBoxRef.current(name);
      if (!result.ok && !firstInvalid) firstInvalid = name;
    }
    return firstInvalid;
  }, []);

  // Save right now — used by leaving the tab, and by closing the job.
  //
  // A save already carrying every edit made so far counts as done for this purpose:
  // leaving the pricing screen with the cursor still in a box fires the blur commit a
  // moment before this runs, and the sheet goes on reading as dirty until that reply
  // lands. Waiting on it beats sending the same figures again — the second trip stores
  // nothing new, but it is a wasted round trip on every tab-away and it counts as another
  // confirmed save for the job window's green frame. Anything typed since that save
  // started is a real difference, so that case still queues a fresh save behind it.
  //
  // Committing every open box first (commitAllBoxes) means this can also be asked while
  // the cursor is still in a box — a red one stays red and this refuses to save, naming
  // which field, rather than silently sending the committed figures around it.
  const flushCosting = useCallback(async () => {
    const invalidField = commitAllBoxes();
    if (invalidField) return { ok: false, invalid: true, field: invalidField };

    // commitAllBoxes may just have queued a save of its own (requestImmediateSave, for
    // any box that actually changed) — that's checked FIRST and is the authoritative
    // signal here. `costingDirty` is still whatever it was before this synchronous pass;
    // the setCostingDirty(true) a fresh commit just queued hasn't been applied to this
    // closure yet, so reading it here would miss a save that was just asked for and
    // return "done" a render before it actually goes out.
    if (pendingImmediate.current) {
      const ok = await pendingImmediate.current.promise;
      return { ok };
    }
    if (!costingDirty) return { ok: true };
    if (inFlight.current && inFlightSeq.current === editSeq.current) {
      const ok = await inFlight.current;
      return { ok };
    }
    setAutoSavePaused(false);
    const ok = await saveNowRef.current();
    return { ok };
  }, [costingDirty, commitAllBoxes]);

  // Leaving the Costing tab, or trying to close the job, while a box is still red: ask
  // whether to go fix it or throw the typed text away. Resolves `{ proceed, field }` —
  // proceed true when it's safe to go on (either nothing was wrong, or the person chose
  // to discard); false means stay put, and field names the box to bring into view. field
  // is returned rather than left for the caller to re-read off costingHook, because
  // firstInvalidCostingField is derived from React state that hasn't re-rendered yet by
  // the time this resolves — the field name commitAllBoxes actually found is the only
  // reliable one in this same async breath.
  //
  // showConfirm is optional: callers that can't supply one (this hook is used before the
  // job screen wires it in) get the safer default of staying put rather than losing a
  // typed figure with no way to ask about it.
  const guardLeaveCosting = useCallback(async (showConfirm) => {
    const invalidField = commitAllBoxes();
    if (!invalidField) return { proceed: true, field: null };

    if (!showConfirm) {
      requestAnimationFrame(() => scrollFieldIntoView(invalidField));
      return { proceed: false, field: invalidField };
    }
    const discard = await showConfirm({
      title: 'Pricing not saved',
      message: "This pricing figure isn't saved — fix it or discard it?",
      confirmLabel: 'Discard',
      cancelLabel: 'Fix it',
      confirmVariant: 'danger'
    });
    if (!discard) {
      requestAnimationFrame(() => scrollFieldIntoView(invalidField));
      return { proceed: false, field: invalidField };
    }
    discardCostingDrafts();
    return { proceed: true, field: null };
  }, [commitAllBoxes, discardCostingDrafts]);

  // Used by the invoicing paths, which run their own "this will archive the job / your
  // unsaved pricing will be billed" prompt before calling it.
  const handleSaveCosting = useCallback(() => saveNowRef.current(), []);

  // Which job this refresh was asked for, and how many refreshes have been asked for
  // altogether — both captured at call time, same as runSave's jobCardIdRef guard above.
  // A reply is dropped when either has moved on by the time it lands: the job on screen
  // has changed (this job's figures would otherwise land on the next job's sheet), or a
  // later refresh was started after this one (two quick timer actions could otherwise
  // land in either order, with the older reply overwriting the newer one's figures).
  const refreshSeq = useRef(0);
  const refreshCosting = useCallback(async () => {
    if (!jobCardId) return;
    const calledForJobId = jobCardId;
    const seq = ++refreshSeq.current;
    try {
      const costingRes = await api.getCosting(jobCardId);
      if (jobCardIdRef.current !== calledForJobId || refreshSeq.current !== seq) return;
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
      if (jobCardIdRef.current !== calledForJobId || refreshSeq.current !== seq) return;
      toastRefreshFailed(err);
    }
  }, [jobCardId]);

  const resetCosting = useCallback(() => {
    setCostingDirty(false);
    setSaveState('idle');
    setLandedCount(0);
    loadedRef.current = null;
    openingRef.current = null;
    // Count the reset as an edit, so a close-time save that resolves after the job is
    // reopened fails runSave's "nothing typed since" check and is dropped rather than
    // adopted onto the freshly blanked form (which would file blank notes as loaded).
    editSeq.current += 1;
    setCostingForm(getDefaultCostingForm());
    setDrafts({});
    clearAllFieldErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // What the sheet actually renders: every committed figure, with any box currently
  // being typed in showing its draft text instead. Built here so every caller (the tab,
  // the totals, the save) reads one already-merged form rather than each doing its own
  // overlay.
  const shownCostingForm = { ...costingForm };
  for (const [name, text] of Object.entries(drafts)) shownCostingForm[name] = text;

  const costingInvalid = Object.keys(fieldErrors).length > 0;
  const firstInvalidCostingField = costingInvalid ? Object.keys(fieldErrors)[0] : null;
  // Any box currently being typed in — including a red one, which is still a draft, just
  // one that hasn't committed yet. Distinct from costingDirty (P4.1 keeps that meaning
  // "committed figures not yet stored"): typing "50" into a box that already read 50
  // leaves a draft here with costingDirty still false. The window-refresh/close-tab
  // warning (useUnsavedGuard.js) needs this too — a draft is exactly the kind of typed,
  // unsaved work that guard exists to catch, and today it only reads costingDirty.
  const costingHasDraft = Object.keys(drafts).length > 0;

  return {
    costingForm: shownCostingForm,
    // A red box overrides the ordinary idle/pending/saving/saved/error progression —
    // there is nothing to report about the rest of the sheet's save state while one
    // figure on it isn't even valid yet.
    costingSaveState: costingInvalid ? 'invalid' : saveState,
    costingDirty,
    costingInvalid,
    firstInvalidCostingField,
    costingHasDraft,
    costingLandedCount: landedCount,
    openedAt,
    flushCosting,
    guardLeaveCosting,
    discardCostingDrafts,
    // Kept under its old name — every caller (CostingTab's blur bubbling, Enter handler)
    // already reaches it this way, and it now IS commitBox: a box saves by committing,
    // there is no separate "just send whatever's already committed" blur behaviour left.
    saveOnBoxBlur: commitBox,
    revertField,
    handleCostingChange,
    resetTierHours,
    resetTierMultiplier,
    useDefaultRate,
    calculateCostingTotals,
    handleSaveCosting,
    refreshCosting,
    resetCosting,
    costingFieldError: (name) => fieldErrors[name] || null,
    costingFieldProps: fieldProps,
    costingErrorProps: errorProps
  };
}

// Split out so runSave (already long) reads as a list of steps rather than a wall of
// toast wording.
function toastNotLoaded() {
  toast.error("This job's pricing hasn't loaded — reopen the pricing screen before making changes.", { id: 'costing-not-loaded' });
}
function toastSaveFailed(err) {
  toast.error(err.message || 'Failed to save costing', { id: 'save-costing-failed' });
}
function toastRefreshFailed(err) {
  toast.error(err.message || 'Failed to refresh costing hours');
}
