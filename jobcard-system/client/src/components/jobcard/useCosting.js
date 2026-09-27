import { useCallback, useRef } from 'react';
import { useCostingDrafts } from './useCostingDrafts';
import { useCostingSave } from './useCostingSave';

// The pricing sheet's state, split across two halves and composed here:
// useCostingDrafts.js (the committed figures, every draft, commit/reset/revert per box)
// and useCostingSave.js (the save queue, save-now, flush, leave guard, refresh). Read
// docs/notes/time-and-costing.md first — every guard in this hook exists because it once
// billed the wrong number.
//
// The drafts half calls into the save half on every real edit (markEdited,
// requestImmediateSave), but the save half is built FROM the drafts half's own committed
// figures (costingForm, drafts, calculateCostingTotals, commitAllBoxes,
// discardCostingDrafts) — so it has to be built second. markEdited/requestImmediateSave
// are threaded to the drafts half through a stable indirection instead: a ref, filled in
// with the real implementation immediately below, so its identity never changes across
// renders (matching the always-stable identity both functions already had before this
// split). Neither is ever called during render — only from event handlers and effects —
// so by the time either fires the ref is already pointing at the real thing.
export function useCosting(jobCardId, {
  costing: loadedCosting,
  updateCosting
} = {}) {
  const markEditedRef = useRef(() => {});
  const requestImmediateSaveRef = useRef(() => {});
  const markEdited = useCallback((...args) => markEditedRef.current(...args), []);
  const requestImmediateSave = useCallback((...args) => requestImmediateSaveRef.current(...args), []);

  const drafts = useCostingDrafts({ markEdited, requestImmediateSave });

  const save = useCostingSave(jobCardId, {
    loadedCosting,
    updateCosting,
    costingForm: drafts.costingForm,
    drafts: drafts.drafts,
    setCostingForm: drafts.setCostingForm,
    setDrafts: drafts.setDrafts,
    clearAllFieldErrors: drafts.clearAllFieldErrors,
    calculateCostingTotals: drafts.calculateCostingTotals,
    commitAllBoxes: drafts.commitAllBoxes,
    discardCostingDrafts: drafts.discardCostingDrafts
  });

  markEditedRef.current = save.markEdited;
  requestImmediateSaveRef.current = save.requestImmediateSave;

  // Resets both halves, in the same order the single resetCosting always ran in: save
  // state first, then the committed form/drafts/errors. Stable ([] deps) like the
  // original — save.resetSaveState and drafts.resetDraftsState are themselves always the
  // same function instance (each built with useCallback(..., [])), so this closure
  // reaches the current implementation on every call despite never being recreated.
  const resetCosting = useCallback(() => {
    save.resetSaveState();
    drafts.resetDraftsState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    costingForm: drafts.shownCostingForm,
    // A red box overrides the ordinary idle/pending/saving/saved/error progression —
    // there is nothing to report about the rest of the sheet's save state while one
    // figure on it isn't even valid yet.
    costingSaveState: drafts.costingInvalid ? 'invalid' : save.saveState,
    costingDirty: save.costingDirty,
    costingInvalid: drafts.costingInvalid,
    firstInvalidCostingField: drafts.firstInvalidCostingField,
    costingHasDraft: drafts.costingHasDraft,
    costingLandedCount: save.landedCount,
    openedAt: save.openedAt,
    flushCosting: save.flushCosting,
    guardLeaveCosting: save.guardLeaveCosting,
    discardCostingDrafts: drafts.discardCostingDrafts,
    // Kept under its old name — every caller (CostingTab's blur bubbling, Enter handler)
    // already reaches it this way, and it now IS commitBox: a box saves by committing,
    // there is no separate "just send whatever's already committed" blur behaviour left.
    saveOnBoxBlur: drafts.commitBox,
    revertField: drafts.revertField,
    handleCostingChange: drafts.handleCostingChange,
    resetTierHours: drafts.resetTierHours,
    resetTierMultiplier: drafts.resetTierMultiplier,
    useDefaultRate: drafts.useDefaultRate,
    calculateCostingTotals: drafts.calculateCostingTotals,
    handleSaveCosting: save.handleSaveCosting,
    refreshCosting: save.refreshCosting,
    resetCosting,
    costingFieldError: drafts.costingFieldError,
    costingFieldProps: drafts.costingFieldProps,
    costingErrorProps: drafts.costingErrorProps
  };
}
