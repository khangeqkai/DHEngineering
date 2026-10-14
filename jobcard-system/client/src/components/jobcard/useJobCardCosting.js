import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { mapCostingResponseToForm } from './mappers';
import { useCosting } from './useCosting';

// Everything the job screen needs to run its pricing tab, in one place: fetching the
// job's stored pricing once the Costing tab is actually opened (see the load effect
// below), and the two moments that save it besides leaving a box or pressing Enter —
// leaving the tab, and closing the job.
//
// Wraps useCosting, which owns the figures themselves, and hands back its whole API
// plus the load state the pricing tab needs.
export function useJobCardCosting({
  isEdit, canSeePricing, jobCardId, jobNumber, activeTab, onJobClosed
}) {
  const [costing, setCosting] = useState(null);
  // Set when the pricing couldn't be fetched. The screen shows a plain message and a
  // Try again button instead of an empty sheet — an empty sheet reads as "everything
  // costs nothing", and the screen saves itself, so one keystroke on it would write
  // those zeros over the job's real figures.
  const [loadFailed, setLoadFailed] = useState(false);
  // Whether the Costing tab has been opened in this window — gates both the pricing fetch
  // below and the refresh after every timer/time-entry change, so neither one walks every
  // logged minute unless there's an actual price sheet on screen (or there was, earlier)
  // for it to update. Derived, not just stored: true outright whenever the tab IS
  // currently showing (checked straight off activeTab), OR the stored flag says it was
  // shown earlier. The "currently showing" half makes the very render that lands on
  // Costing — including a window opened straight onto it — count at once, instead of
  // waiting a render for the effect to store it.
  const [costingShownBefore, setCostingShownBefore] = useState(false);
  useEffect(() => {
    if (activeTab === 'costing') setCostingShownBefore(true);
  }, [activeTab]);
  const costingOpened = activeTab === 'costing' || costingShownBefore;

  const loadCosting = useCallback(async () => {
    if (!isEdit || !jobCardId || !canSeePricing) return;
    try {
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) {
        setCosting(mapCostingResponseToForm(costingRes));
        setLoadFailed(false);
      }
    } catch {
      setLoadFailed(true);
    }
  }, [isEdit, jobCardId, canSeePricing]);

  // Load only once the Costing tab has actually been opened in this window, not the instant
  // an admin opens any job — the fetch walks every logged minute, and most job opens never
  // touch pricing at all. The invoice confirm on the status control does not depend on this:
  // it shows costingDirty's own on-screen figure when there are unsaved edits (the sheet is
  // loaded by definition then) and otherwise fetches the stored total straight from the
  // server for whoever is allowed to see one — see JobIdentityStrip.jsx. Still only once per
  // window (costing stays non-null until the job is closed), still admin-only, and still
  // off a brand-new card (isEdit false).
  useEffect(() => {
    if (isEdit && canSeePricing && costingOpened && costing === null) {
      loadCosting();
    }
  }, [isEdit, canSeePricing, costingOpened, costing, loadCosting]);

  const costingHook = useCosting(jobCardId, {
    costing,
    jobNumber,
    // The job screen's shared closed-job handler — see useCostingSave.js.
    onJobClosed,
    // No re-fetch after the save: the reply carries the stored figures, and re-reading
    // would spend a whole recompute — a walk over every logged minute — per save.
    updateCosting: async (data) => {
      const res = await api.updateCosting(jobCardId, data);
      // Hand back what the server actually stored so the screen can adopt it (it folds in
      // any time logged since the screen loaded). The pricing screen only takes these
      // when nothing was typed while the save was in flight and the same job is still
      // open, so this can't overwrite someone mid-type or land on the wrong job.
      return res?.costing ? mapCostingResponseToForm(res.costing) : null;
    }
  });

  // Pricing saves itself when a box is left. The two paths below cover leaving with the
  // cursor still in a box. Closing the job normally saves pricing (and waits for it)
  // in the close guard first — useJobCardCloseGuard.js — so the unmount flush is only a
  // backstop for a close that never went through that guard. Held in a ref so they don't re-run (and re-save) on every render.
  const flushRef = useRef(null);
  flushRef.current = costingHook.flushCosting;

  useEffect(() => {
    if (activeTab === 'costing') return;
    flushRef.current?.();
  }, [activeTab]);

  // The window closing is the window unmounting, and a pricing figure still waiting to be
  // sent must go out as it goes. That backstop lives in useCostingSave.js (flushOnUnmount),
  // not here: this flush commits a box and then sends one render later, and an unmounted
  // window never renders again, so it would send nothing. The save half works the figures
  // out synchronously from refs instead.

  // Asks the server for the job's grand total as it stands right now, without touching
  // anything on screen (costingForm, loadedRef, etc. are all left alone). The figure is
  // worked out afresh on every read — it is not whatever was last written down — so it
  // already carries any time logged since this screen loaded. Used by the "Mark as
  // Invoiced" confirm, which must show the figure that will actually be billed; the one
  // on screen can be behind, and only catches up when the sheet next saves itself.
  const fetchCurrentTotal = useCallback(async () => {
    if (!jobCardId) return null;
    const costingRes = await api.getCosting(jobCardId);
    return typeof costingRes?.grandTotal === 'number' ? costingRes.grandTotal : null;
  }, [jobCardId]);

  return {
    ...costingHook,
    // True once this job's stored pricing has arrived. Until then the tab shows a plain
    // message rather than a sheet of zeros that a keystroke would make real.
    costingLoaded: costing !== null,
    costingLoadFailed: loadFailed,
    retryLoadCosting: loadCosting,
    // True whenever the Costing tab is showing right now, or was shown earlier in
    // this window — see the derivation above.
    costingOpened,
    fetchCurrentTotal
  };
}
