import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { scrollFieldIntoView } from '../../hooks/useFieldErrors';
import { isJobClosedError } from '../../utils/jobLock';
import { toastJobWriteFailure } from './jobWriteFailure';
import { TEXT_FIELDS } from './useCostingDrafts';

// The save half of the pricing sheet: the save queue, save-now, flush, leave guard and
// refresh. See useCostingDrafts.js for the draft-text/commit-per-box half and
// useCosting.js for how the two are composed — every guard here exists because it once
// billed the wrong number, see docs/notes/time-and-costing.md.
//
// An invoiced job's pricing cannot be saved until it is unarchived (the sheet is locked) —
// see the note on runSave below for why there is no question in front of a save.
//
// costingForm/drafts are the CURRENT values from useCostingDrafts.js, passed in fresh
// every render; setCostingForm/setDrafts/clearAllFieldErrors, commitAllBoxes and
// discardCostingDrafts are that half's own setters/functions, crossing
// over so this half can adopt a save reply, load the initial figures, and commit/discard
// open boxes on the way out.
//
// onJobClosed is the job screen's shared closed-job handler (JobCardModal.jsx): a save
// refused because the job was invoiced and closed from another PC calls it — one
// message, and a reload that locks the sheet — instead of the ordinary failure toast.
export function useCostingSave(jobCardId, {
  loadedCosting,
  jobNumber,
  updateCosting,
  onJobClosed,
  costingForm,
  drafts,
  setCostingForm,
  setDrafts,
  clearAllFieldErrors,
  commitAllBoxes,
  foldDraftsNow,
  discardCostingDrafts
}) {
  // Named in a failure message: the unmount backstop's save can fail after the window has
  // gone and another job is on screen, so the message has to say which job it was.
  const jobNumberRef = useRef(jobNumber);
  jobNumberRef.current = jobNumber;
  const [savingCosting, setSavingCosting] = useState(false);
  // True when the pricing screen has hand edits that haven't been saved yet. Used to
  // warn/save before invoicing so unsaved edits aren't lost when the job is filed away.
  const [costingDirty, setCostingDirty] = useState(false);
  // What the status line beside the grand total shows, in place of the old Save button:
  // 'idle' | 'pending' (edited, save due) | 'saving' | 'saved' | 'error'. A box sitting
  // red overrides all of these on the way out — see costingSaveState in useCosting.js.
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
  // The last figures loaded from (or stored by) the server — also what a save compares
  // against to send only the figures this screen changed. Moved on by every successful
  // save reply, including one whose figures aren't adopted into the boxes (see runSave). While it's still null it
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
  // True from the moment the person's unsaved figures were thrown away (dropUnsavedCosting)
  // until the next hand edit or load. A ref rather than state because the drop and the
  // window closing happen in the same tick: the unmount flush then runs the LAST RENDER's
  // flushCosting/runSave, whose closures still see the old form, the old dirty flag and
  // the old drafts, and would send exactly what was discarded. Both check this first, so a
  // stale closure finds nothing to send whatever it last rendered.
  const droppedRef = useRef(false);

  // Fill the form from the costing loaded for this job. That load happens once per
  // opening — the save no longer re-reads. loadedCosting already IS the form shape —
  // mapCostingResponseToForm (mappers.js) maps the server reply straight into it, so
  // there is no separate mapping step here any more.
  useEffect(() => {
    if (loadedCosting) {
      loadedRef.current = loadedCosting;
      openingRef.current = loadedCosting;
      droppedRef.current = false;
      setCostingDirty(false);
      setSaveState('idle');
      setCostingForm(loadedCosting);
      setDrafts({});
      clearAllFieldErrors();
    }
    // clearAllFieldErrors is stable (useCallback with no deps in useFieldErrors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedCosting]);

  // Every hand edit marks the screen as owing a save and restarts the save timer.
  const markEdited = useCallback(() => {
    editSeq.current += 1;
    droppedRef.current = false;
    setCostingDirty(true);
    setSaveState('pending');
    setAutoSavePaused(false);
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

  // The window unmounting is the one exit with no render after it, so nothing here can
  // wait for the next render the way commitBox's requested save does. Backstop for a close
  // that never went through the close guard (useJobCardCloseGuard.js saves pricing first
  // and waits): fold every valid open draft into the newest committed figures synchronously
  // (foldDraftsNow — the same judgeBox rule as commitBox; a red box is not sent) and hand
  // that form straight to the ordinary save queue, with the same changed-fields diff,
  // ordering behind a save in flight, and dropped/not-loaded guards. No timer, no retry.
  // A save already carrying these exact figures is left to finish rather than sent twice.
  // Anything waiting on a requested save is settled with this outcome, never left hanging.
  // Two cases send nothing: nobody is signed in (sign-out clears the pass before removing
  // the window, so a send would only be refused; if figures were owed the person is told
  // they weren't saved, otherwise it is silent), and a
  // save that already failed with nothing newly committed (a write is never re-sent
  // automatically; the figures stay on screen, unsaved, as the failure left them).
  const flushOnUnmount = () => {
    const waiting = pendingImmediate.current;
    pendingImmediate.current = null;
    const settle = (ok) => waiting?.settle(ok);
    if (droppedRef.current || !jobCardId) { settle(true); return; }

    const { form, changed } = foldDraftsNow();
    if (autoSavePaused && !changed) { settle(false); return; }
    // A box committed just now is an edit like any other: a save already in flight no
    // longer covers everything.
    if (changed) editSeq.current += 1;
    const owes = loadedRef.current
      ? Object.keys(changedFigures(form, loadedRef.current)).length > 0
      : (changed || !!waiting);
    if (!owes) { settle(true); return; }
    if (!api.token) { toastSignedOutUnsaved(jobCardId, jobNumberRef.current); settle(false); return; }
    if (!changed && inFlight.current && inFlightSeq.current === editSeq.current) {
      inFlight.current.then(settle, () => settle(false));
      return;
    }
    saveNowRef.current({ form }).then(settle, () => settle(false));
  };
  const flushOnUnmountRef = useRef(flushOnUnmount);
  flushOnUnmountRef.current = flushOnUnmount;
  useEffect(() => () => { flushOnUnmountRef.current(); }, []);

  // Throw away every figure this screen holds that the server never stored: open drafts
  // and their red marks, and committed figures still waiting to be sent — the sheet goes
  // back to the last figures the server handed back. Used when a save is refused because
  // the job was closed elsewhere, and when the person answers "discard" to a close
  // question naming pricing whose save failed (not one still in flight, which may yet store) (useJobCardCloseGuard.js), so the
  // save-on-close backstop doesn't send what they chose to lose.
  const dropUnsavedCosting = useCallback(() => {
    droppedRef.current = true;
    discardCostingDrafts();
    if (loadedRef.current) setCostingForm(loadedRef.current);
    setCostingDirty(false);
    setSaveState('idle');
    setAutoSavePaused(false);
  }, [discardCostingDrafts, setCostingForm]);

  // Send the current figures. Returns true when they're safely stored and false when the
  // save failed. Callers that gate an irreversible step on the save (invoicing files the
  // job away) rely on the false case to abort instead of proceeding with unsaved numbers.
  //
  // There is no "change an invoiced job?" question. An invoiced job is closed: the
  // server (closedJobGuard) refuses a save until it is unarchived, and the sheet is
  // locked on screen meanwhile, so a save only ever runs on an open job and goes
  // straight through, like the rest of the sheet. Every figure is recorded in the
  // activity trail with its old and new value.
  //
  // `options.form` sends exactly that form instead of the one this render closed over —
  // the unmount flush passes the figures it worked out from refs, since a closure from the
  // last render can't know what was typed or committed after it.
  const runSave = useCallback(async ({ form: explicitForm } = {}) => {
    if (!jobCardId) return true; // nothing to save (new card) — not a failure
    // The figures were thrown away (see droppedRef); this may be a stale closure still
    // holding them.
    if (droppedRef.current) return true;

    // The job's stored pricing never arrived (the load failed, or hasn't finished). The
    // boxes are showing an empty sheet, so sending it would write zeros over the job's
    // real rate, materials, subcontractor figures and notes. Refuse instead.
    if (!loadedRef.current) {
      setSaveState('error');
      setAutoSavePaused(true);
      toastNotLoaded(jobCardId);
      return false;
    }

    const form = explicitForm ?? costingForm;
    const seq = editSeq.current;
    // What this save covers, for flushCosting to compare against — see there.
    inFlightSeq.current = seq;
    setSavingCosting(true);
    setSaveState('saving');
    try {
      // Only the figures this screen changed since the server last handed its figures
      // back. Sending the whole sheet let a second admin's out-of-date copy of a figure
      // they never touched overwrite the first admin's saved one. The server keeps its
      // stored value for anything left out and works every total out itself.
      const costingData = changedFigures(form, loadedRef.current);

      if (!updateCosting) {
        throw new Error('updateCosting operation not provided');
      }
      const stored = await updateCosting(costingData);
      // Whatever happens to the boxes below, the comparison base moves to what the server
      // now holds — on EVERY successful reply, adopted or not. Otherwise
      // a figure changed while this save was in flight and then put back to its old
      // value (materials $100 → $200, left; another box edited meanwhile; materials back
      // to $100) would be judged unchanged against the stale base and never sent,
      // leaving the server on $200.
      if (stored) {
        loadedRef.current = stored;
      }
      // Only call it saved when nothing was typed while the request was in flight —
      // otherwise those later keystrokes would look stored without ever having been sent.
      // Left dirty, they go out with the next box left, Enter, or flush.
      if (editSeq.current === seq) {
        // Adopt what the server actually stored. It folds in any time logged since the
        // screen loaded, so its totals can be higher than the ones worked out here —
        // without this the grand total on screen quietly drifts from the billed one.
        // Safe to replace every box — nothing was typed anywhere while this save was in
        // flight (a box someone started typing in during the wait would still carry a
        // draft, which display already overlays on top of whatever this puts in below).
        if (stored) {
          setCostingForm(prev => {
            // stored is already the form shape (mapCostingResponseToForm) — copy it so
            // the notes patch below doesn't mutate the object held in loadedRef.
            const next = { ...stored };
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
      // The job was invoiced and closed elsewhere: these figures can never be stored,
      // so they're dropped (the sheet goes back to what the server holds, and closing
      // won't ask about them) and the screen reloads into its locked state.
      if (isJobClosedError(err)) {
        dropUnsavedCosting();
        onJobClosed?.();
        return false;
      }
      setSaveState('error');
      setAutoSavePaused(true);
      toastSaveFailed(err, jobCardId, jobNumberRef.current);
      return false;
    } finally {
      inFlightSeq.current = null;
      setSavingCosting(false);
    }
  }, [jobCardId, costingForm, updateCosting, drafts, onJobClosed, dropUnsavedCosting]);

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
    // Checked before the boxes are committed: a stale closure's commitAllBoxes would
    // still see drafts the person discarded and commit them as fresh edits (see droppedRef).
    if (droppedRef.current) return { ok: true };
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
      title: 'Costing not saved',
      message: "This costing figure isn't saved — fix it or discard it?",
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

  // How many refreshes have been asked for altogether, captured at call time. A reply is
  // dropped when a later refresh was started after this one (two quick timer actions
  // could otherwise land in either order, with the older reply overwriting the newer
  // one's figures).
  const refreshSeq = useRef(0);
  const refreshCosting = useCallback(async () => {
    if (!jobCardId) return;
    const seq = ++refreshSeq.current;
    try {
      const costingRes = await api.getCosting(jobCardId);
      if (refreshSeq.current !== seq) return;
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
      if (refreshSeq.current !== seq) return;
      toastRefreshFailed(err, jobCardId);
    }
  }, [jobCardId]);

  // The manual money lines (materials, subcontractor, special labour) have no
  // "reset to auto" link the way the tier hours/multipliers do — this is what the
  // pricing screen's per-field "put it back" control compares against. It is captured
  // ONCE, from openingRef, when the job's pricing is first opened, and never moves again
  // as the screen saves itself: comparing against the last save instead would make the
  // control vanish about a second after it appeared, since this sheet saves on every
  // edit. So for as long as the job stays open it keeps offering the figure the job was
  // opened with, even once later autosaves have moved the actually-stored value past it.
  const openedAt = openingRef.current ? { ...openingRef.current } : null;

  return {
    saveState,
    costingDirty,
    landedCount,
    openedAt,
    markEdited,
    requestImmediateSave,
    flushCosting,
    guardLeaveCosting,
    dropUnsavedCosting,
    handleSaveCosting,
    refreshCosting
  };
}

// What a save sends for each figure the server accepts, read off a committed form (or
// off the figures the server last handed back — the same shape). An override box
// travels as its override: the hand-typed figure, or null to follow the logged/company
// figure.
function savedFigures(form) {
  return {
    labourRate: form.labourRate,
    labourHoursOverride: form.labourHoursOverridden ? form.labourHours : null,
    labourOt1Override: form.labourOt1Overridden ? form.labourOt1Hours : null,
    labourOt2Override: form.labourOt2Overridden ? form.labourOt2Hours : null,
    labourHolidayOverride: form.labourHolidayOverridden ? form.labourHolidayHours : null,
    labourOt1MultiplierOverride: form.labourOt1MultiplierOverridden ? form.labourOt1Multiplier : null,
    labourOt2MultiplierOverride: form.labourOt2MultiplierOverridden ? form.labourOt2Multiplier : null,
    labourSpecialHours: form.labourSpecialHours,
    labourSpecialRate: form.labourSpecialRate,
    labourSpecialDescription: form.labourSpecialDescription,
    materialsCost: form.materialsCost,
    materialsProfitPercent: form.materialsProfitPercent,
    materialsDescription: form.materialsDescription,
    subcontractorCost: form.subcontractorCost,
    subcontractorProfitPercent: form.subcontractorProfitPercent,
    subcontractorDescription: form.subcontractorDescription
  };
}

// The figures on screen that differ from the ones the server last stored. Notes are
// compared as the server stores them (trimmed, blank as empty) — the boxes keep the
// untrimmed text on purpose, and that alone isn't a change worth sending.
function changedFigures(form, stored) {
  const now = savedFigures(form);
  const was = savedFigures(stored);
  const same = (field, a, b) => (TEXT_FIELDS.has(field)
    ? (a || '').trim() === (b || '').trim()
    : a === b);
  const changed = {};
  for (const field of Object.keys(now)) {
    if (!same(field, now[field], was[field])) changed[field] = now[field];
  }
  return changed;
}

// Split out so runSave (already long) reads as a list of steps rather than a wall of
// toast wording.
function toastSignedOutUnsaved(jobCardId, jobNumber) {
  toastJobWriteFailure({ jobNumber, jobCardId }, 'The latest costing change was not saved because you were signed out. Open the job and check its costing.', 'costing-signed-out');
}
function toastNotLoaded(jobCardId) {
  toast.error("This job's costing hasn't loaded — reopen the costing screen before making changes.", { id: `costing-not-loaded-${jobCardId}` });
}
function toastSaveFailed(err, jobCardId, jobNumber) {
  const message = err.message ? `Costing not saved — ${err.message}` : 'Couldn\'t save the costing. Check the connection and try again.';
  toastJobWriteFailure({ jobNumber, jobCardId }, message, 'save-costing-failed');
}
function toastRefreshFailed(err, jobCardId) {
  toast.error(err.message || 'Couldn\'t refresh the costing hours. Check the connection and try again.', { id: `refresh-costing-failed-${jobCardId}` });
}
