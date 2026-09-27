import { useState, useCallback, useRef } from 'react';
import { getDefaultCostingForm } from './mappers';
import { capitalizeFirst } from '../../utils/formatters';
import { useFieldErrors } from '../../hooks/useFieldErrors';
import { roundTo } from '../../../../server/src/shared/round';

// The draft-text half of the pricing sheet: the committed figures, everything currently
// being typed, and every commit/reset/revert operation on a single box. See
// useCostingSave.js for the save-queue half and useCosting.js for how the two are
// composed — every guard here exists because it once billed the wrong number, see
// docs/notes/time-and-costing.md.

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
// Exported: useCostingSave's runSave also reads this set (to decide which committed
// fields survive an in-flight edit untouched when a save lands).
export const TEXT_FIELDS = new Set([
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

// markEdited and requestImmediateSave belong to useCostingSave.js — every box function
// here calls into that half after a real change, but never reads anything back from it.
export function useCostingDrafts({ markEdited, requestImmediateSave }) {
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

  // Every keystroke in any box — number or text — just records what's being typed.
  // Nothing else happens here: no parsing, no clamping, no toast, no save. commitBox
  // (below) is the only place a draft is ever judged.
  const handleCostingChange = useCallback((e) => {
    const { name, value } = e.target;
    setDrafts(prev => ({ ...prev, [name]: value }));
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
    // A figure too long to fit (over ~309 digits) parses as Infinity, which travels as
    // empty and would save as 0 — or clear a hand-typed override.
    if (!Number.isFinite(parsed)) {
      setFieldErrors({ [name]: 'Enter a smaller number.' }, { [name]: raw });
      return { ok: false };
    }
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
    // Each line rounded to whole cents and the grand total added up from those rounded
    // lines — the same way the server works them out (costingCompute.js), so the figure
    // on screen is the figure a save stores.
    const cents = (n) => roundTo(n, 2);
    const labourRate = fig('labourRate');
    const labourTotal = cents(fig('labourHours') * labourRate);
    const labourOt1Total = cents(fig('labourOt1Hours') * labourRate * fig('labourOt1Multiplier'));
    const labourOt2Total = cents(fig('labourOt2Hours') * labourRate * fig('labourOt2Multiplier'));
    const labourHolidayTotal = cents(fig('labourHolidayHours') * labourRate * fig('labourHolidayMultiplier'));
    const labourSpecialTotal = cents(fig('labourSpecialHours') * fig('labourSpecialRate'));
    const materialsTotal = cents(fig('materialsCost') * (1 + fig('materialsProfitPercent') / 100));
    const subcontractorTotal = cents(fig('subcontractorCost') * (1 + fig('subcontractorProfitPercent') / 100));
    const grandTotal = cents(labourTotal + labourOt1Total + labourOt2Total + labourHolidayTotal
      + labourSpecialTotal + materialsTotal + subcontractorTotal);

    return { labourTotal, labourOt1Total, labourOt2Total, labourHolidayTotal, labourSpecialTotal, materialsTotal, subcontractorTotal, grandTotal };
  }, [costingForm, drafts]);

  // Held in refs so commitAllBoxes (below, used from effects and event handlers in
  // useCostingSave.js) always commits against the CURRENT set of drafts and errors
  // rather than whatever was on screen when it was created.
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

  // Blank the committed form and every draft/error — used when the job on screen is
  // switched or closed. Counterpart to useCostingSave.js's resetSaveState; useCosting.js
  // calls both, in the same order runSave/resetCosting always has.
  const resetDraftsState = useCallback(() => {
    setCostingForm(getDefaultCostingForm());
    setDrafts({});
    clearAllFieldErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the sheet actually renders: every committed figure, with any box currently
  // being typed in showing its draft text instead. Built here so every caller (the tab,
  // the totals, the save) reads one already-merged form rather than each doing its own
  // overlay.
  const shownCostingForm = { ...costingForm };
  for (const [name, text] of Object.entries(drafts)) shownCostingForm[name] = text;

  const costingInvalid = Object.keys(fieldErrors).length > 0;
  const firstInvalidCostingField = costingInvalid ? Object.keys(fieldErrors)[0] : null;
  // Any box currently being typed in — including a red one, which is still a draft, just
  // one that hasn't committed yet. Distinct from costingDirty (useCostingSave.js keeps
  // that meaning "committed figures not yet stored"): typing "50" into a box that already
  // read 50 leaves a draft here with costingDirty still false. The window-refresh/close-tab
  // warning (useUnsavedGuard.js) needs this too — a draft is exactly the kind of typed,
  // unsaved work that guard exists to catch, and today it only reads costingDirty.
  const costingHasDraft = Object.keys(drafts).length > 0;

  return {
    // Raw committed form/drafts — consumed by useCostingSave.js's load effect, runSave
    // (which reads and adopts them) and refreshCosting (which patches calculated
    // figures into them).
    costingForm,
    setCostingForm,
    drafts,
    setDrafts,
    clearAllFieldErrors,
    shownCostingForm,
    costingInvalid,
    firstInvalidCostingField,
    costingHasDraft,
    handleCostingChange,
    commitBox,
    discardCostingDrafts,
    resetTierHours,
    resetTierMultiplier,
    useDefaultRate,
    revertField,
    calculateCostingTotals,
    commitAllBoxes,
    resetDraftsState,
    costingFieldError: (name) => fieldErrors[name] || null,
    costingFieldProps: fieldProps,
    costingErrorProps: errorProps
  };
}
