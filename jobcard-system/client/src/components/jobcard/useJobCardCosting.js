import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { mapCostingResponseToData } from './mappers';
import { useCosting } from './useCosting';

// Everything the job screen needs to run its pricing tab, in one place: fetching the
// job's stored pricing once the Costing tab is actually opened (see the load effect
// below), and the two moments that save straight away rather than waiting out the pricing
// screen's own countdown — leaving the tab, and closing the job.
//
// Wraps useCosting, which owns the figures themselves, and hands back its whole API
// plus the load state the pricing tab needs.
export function useJobCardCosting({
  isOpen, isEdit, isAdmin, jobCardId, activeTab
}) {
  const [costing, setCosting] = useState(null);
  // Set when the pricing couldn't be fetched. The screen shows a plain message and a
  // Try again button instead of an empty sheet — an empty sheet reads as "everything
  // costs nothing", and the screen saves itself, so one keystroke on it would write
  // those zeros over the job's real figures.
  const [loadFailed, setLoadFailed] = useState(false);
  // Whether the Costing tab has been opened this opening — gates both the pricing fetch
  // below and the refresh after every timer/time-entry change, so neither one walks every
  // logged minute unless there's an actual price sheet on screen (or there was, earlier
  // this opening) for it to update. Derived, not just stored: true outright whenever the
  // tab IS currently showing (checked straight off activeTab, not the stored flag), OR the
  // stored flag says it was shown earlier. That "currently showing" half matters because
  // the stored flag is cleared by resetCosting() on every open (see below) and only set
  // again by the effect underneath — an admin who opens straight onto Costing from the
  // activity list (activeTab arrives already 'costing') would otherwise see React skip
  // that effect, since activeTab didn't change value from the previous, now-reset opening.
  const [costingOpenedThisOpening, setCostingOpenedThisOpening] = useState(false);
  useEffect(() => {
    if (activeTab === 'costing') setCostingOpenedThisOpening(true);
  }, [activeTab]);
  const costingOpened = activeTab === 'costing' || costingOpenedThisOpening;

  // Bumped whenever the job screen closes or switches job. The fetch is slow — it walks
  // every logged minute — so a reply can land after the job it was for has been closed
  // and another opened. Without this check that reply painted the old job's figures
  // onto the new one, and the next keystroke saved them there. Bumped in an effect
  // CLEANUP, not in resetCosting: the load effect below runs before the modal's open
  // effect calls resetCosting, so a bump there threw away the new job's own reply and
  // left the tab on "Loading pricing…" for good. Cleanups run before any effect of the
  // same commit, so the load effect always reads the fresh counter.
  const loadSeq = useRef(0);
  useEffect(() => () => { loadSeq.current += 1; }, [isOpen, jobCardId]);

  const loadCosting = useCallback(async () => {
    if (!isEdit || !jobCardId || !isAdmin) return;
    const seq = loadSeq.current;
    try {
      const costingRes = await api.getCosting(jobCardId);
      if (seq !== loadSeq.current) return; // a different opening now — not ours
      if (costingRes) {
        setCosting(mapCostingResponseToData(costingRes));
        setLoadFailed(false);
      }
    } catch {
      if (seq === loadSeq.current) setLoadFailed(true);
    }
  }, [isEdit, jobCardId, isAdmin]);

  // Load only once the Costing tab has actually been opened this opening, not the instant
  // an admin opens any job — the fetch walks every logged minute, and most job opens never
  // touch pricing at all. The invoice confirm on the status control does not depend on this:
  // it shows costingDirty's own on-screen figure when there are unsaved edits (the sheet is
  // loaded by definition then) and otherwise fetches the stored total straight from the
  // server for whoever is allowed to see one — see JobIdentityStrip.jsx. Still only once per
  // opening (costing stays non-null until the job is closed), still admin-only, and still
  // off a brand-new card (isEdit false).
  useEffect(() => {
    if (isOpen && isEdit && isAdmin && costingOpened && costing === null) {
      loadCosting();
    }
  }, [isOpen, isEdit, isAdmin, costingOpened, costing, loadCosting]);

  const costingHook = useCosting(jobCardId, {
    costing,
    // No re-fetch after the save: the reply carries the stored figures, and re-reading
    // would spend a whole recompute — a walk over every logged minute — per save.
    updateCosting: async (data) => {
      const res = await api.updateCosting(jobCardId, data);
      // Hand back what the server actually stored so the screen can adopt it (it folds in
      // any time logged since the screen loaded). The pricing screen only takes these
      // when nothing was typed while the save was in flight and the same job is still
      // open, so this can't overwrite someone mid-type or land on the wrong job.
      return res?.costing ? mapCostingResponseToData(res.costing) : null;
    }
  });

  // Pricing saves itself a moment after each edit. The two paths below don't wait for
  // that countdown. Held in a ref so they don't re-run (and re-save) on every render.
  const flushRef = useRef(null);
  flushRef.current = costingHook.flushCosting;

  useEffect(() => {
    if (activeTab === 'costing') return;
    flushRef.current?.();
  }, [activeTab]);

  useEffect(() => {
    if (isOpen) return;
    flushRef.current?.();
  }, [isOpen]);

  const { resetCosting: resetFigures } = costingHook;
  const resetCosting = useCallback(() => {
    setCosting(null);
    setLoadFailed(false);
    setCostingOpenedThisOpening(false);
    resetFigures();
  }, [resetFigures]);

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
    resetCosting,
    // True once this job's stored pricing has arrived. Until then the tab shows a plain
    // message rather than a sheet of zeros that a keystroke would make real.
    costingLoaded: costing !== null,
    costingLoadFailed: loadFailed,
    retryLoadCosting: loadCosting,
    // True whenever the Costing tab is showing right now, or was shown earlier this
    // opening — see the derivation above.
    costingOpened,
    fetchCurrentTotal
  };
}
