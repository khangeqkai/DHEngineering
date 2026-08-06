import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { mapCostingResponseToData } from './mappers';
import { useCosting } from './useCosting';

// Everything the job screen needs to run its pricing tab, in one place: fetching the
// job's stored pricing (lazily, and only for an admin), the "change an invoiced job?"
// question, and the two moments that save straight away rather than waiting out the
// pricing screen's own countdown — leaving the tab, and closing the job.
//
// Wraps useCosting, which owns the figures themselves, and hands back its whole API
// plus the load state the pricing tab needs.
export function useJobCardCosting({
  isOpen, isEdit, isAdmin, jobCardId, activeTab, isInvoiced, showConfirm
}) {
  const [costing, setCosting] = useState(null);
  // Set when the pricing couldn't be fetched. The screen shows a plain message and a
  // Try again button instead of an empty sheet — an empty sheet reads as "everything
  // costs nothing", and the screen saves itself, so one keystroke on it would write
  // those zeros over the job's real figures.
  const [loadFailed, setLoadFailed] = useState(false);

  const loadCosting = useCallback(async () => {
    if (!isEdit || !jobCardId || !isAdmin) return;
    try {
      const costingRes = await api.getCosting(jobCardId);
      if (costingRes) {
        setCosting(mapCostingResponseToData(costingRes));
        setLoadFailed(false);
      }
    } catch {
      setLoadFailed(true);
    }
  }, [isEdit, jobCardId, isAdmin]);

  // Load only when the Costing tab is actually opened, and only once per opening
  // (costing stays non-null until the job is closed). Computing it walks every logged
  // minute to split the time into rate tiers, so it's kept off the common open-a-job
  // path and off timer events unless someone has looked at the pricing.
  useEffect(() => {
    if (isOpen && isEdit && isAdmin && activeTab === 'costing' && costing === null) {
      loadCosting();
    }
  }, [isOpen, isEdit, isAdmin, activeTab, costing, loadCosting]);

  // Editing an invoiced job's pricing isn't blocked — it just asks first, then saves and
  // recalculates from the job's own captured rules. Asked once per opening (the pricing
  // screen saves itself, so there's no Save button to hang the question on).
  const confirmInvoicedEdit = useCallback(() => showConfirm({
    title: 'Change an invoiced job?',
    message: 'This job has been invoiced. Changing its pricing will update the final total. Are you sure you want to continue?',
    confirmLabel: 'Yes, change it',
    cancelLabel: 'Cancel',
    confirmVariant: 'danger'
  }), [showConfirm]);

  const costingHook = useCosting(jobCardId, {
    costing,
    isInvoiced,
    confirmInvoicedEdit,
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
    // The job screen is gone by now, so no dialog can be shown. If the pricing belongs
    // to an invoiced job and the user hasn't yet agreed to change it, say plainly that
    // it wasn't kept rather than filing the change away behind their back.
    flushRef.current?.({ withoutPrompt: true }).then(outcome => {
      if (outcome === 'needs-confirm') {
        toast('Pricing changes were not saved — this job has been invoiced.', { icon: '⚠️' });
      }
    });
  }, [isOpen]);

  const { resetCosting: resetFigures } = costingHook;
  const resetCosting = useCallback(() => {
    setCosting(null);
    setLoadFailed(false);
    resetFigures();
  }, [resetFigures]);

  return {
    ...costingHook,
    resetCosting,
    // True once this job's stored pricing has arrived. Until then the tab shows a plain
    // message rather than a sheet of zeros that a keystroke would make real.
    costingLoaded: costing !== null,
    costingLoadFailed: loadFailed,
    retryLoadCosting: loadCosting
  };
}
