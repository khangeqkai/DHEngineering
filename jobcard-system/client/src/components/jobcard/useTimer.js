import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useFinishQuestion } from '../../context/FinishQuestionContext';
import { discardToastIcon, infoToastIcon } from '../common/toastIcons';
import { describeItemPosition } from './workMatch.mjs';
import { joinMachineCodes, splitMachineCodes } from '../../../../server/src/shared/machineList';
import { CRITICAL_INSPECTION_REFUSED } from '../../../../server/src/shared/qualityLevels';
import {
  RUN_NOT_YOURS, RUN_STILL_RUNNING, RUN_ALREADY_FILLED_IN, FINISH_UNCONFIRMED, RUN_STOPPED_ITSELF
} from '../../../../server/src/shared/runRefusals';
import { isJobClosedError } from '../../utils/jobLock';

const emptyEntryForm = () => ({
  qty: '',
  scrapBinQty: '',
  scrapRecycleQty: '',
  machineNumbers: [],
  description: '',
  // Critical-job inspection checklist (null = unanswered until the worker taps Yes/No)
  firstOffInspection: null,
  inProcessValidation: null,
  measuringEquipmentVerification: null,
  equipmentChecks: null,
  equipmentChecksComments: ''
});

// The stop form's starting boxes: whatever the run already stores. A run just stopped
// stores nothing yet, so it starts blank; a run the office filled in by hand while its
// worker still owed the form starts from what they typed, so saving never wipes it.
const entryFormFromEntry = (entry) => {
  const answer = (v) => (v === true || v === false ? v : null);
  const count = (v) => (Number(v) > 0 ? String(parseInt(v, 10)) : '');
  return {
    qty: count(entry?.qty),
    scrapBinQty: count(entry?.scrapBinQty),
    scrapRecycleQty: count(entry?.scrapRecycleQty),
    machineNumbers: splitMachineCodes(entry?.machineNumber),
    description: entry?.description || '',
    firstOffInspection: answer(entry?.firstOffInspection),
    inProcessValidation: answer(entry?.inProcessValidation),
    measuringEquipmentVerification: answer(entry?.measuringEquipmentVerification),
    equipmentChecks: answer(entry?.equipmentChecks),
    equipmentChecksComments: entry?.equipmentChecksComments || ''
  };
};

// onJobClosed (optional) is the job screen's shared closed-job handler: a start, or a
// stop-form save/resume on this job, refused because the job was invoiced and closed
// from another PC calls it instead of the ordinary failure toast.
export function useTimer(jobcardId, { onExternalStop, lineItems, onJobClosed } = {}) {
  const { registerBeforeLogout, user } = useAuth();
  const currentUserId = user?.id;
  // The signed-in shell's "when did you finish?" question (null outside the shell). Held
  // in a ref so the poll and the start paths below don't re-create on its changes.
  const finishQuestion = useFinishQuestion();
  const refreshFinishQuestionRef = useRef(finishQuestion?.refresh);
  refreshFinishQuestionRef.current = finishQuestion?.refresh;
  // Says "this screen is stopping its own clock" around the worker's own stop, so the
  // header indicator does not re-read the flagged clocks for it (the poll below already
  // knows, through selfStoppedRef).
  const noteOwnStopRef = useRef(finishQuestion?.noteOwnStop);
  noteOwnStopRef.current = finishQuestion?.noteOwnStop;
  const clearOwnStopRef = useRef(finishQuestion?.clearOwnStop);
  clearOwnStopRef.current = finishQuestion?.clearOwnStop;
  const stopFormDoneRef = useRef(finishQuestion?.stopFormDone);
  stopFormDoneRef.current = finishQuestion?.stopFormDone;
  // Read the live parts list from a ref, not the argument closed over below — the
  // toasts and prompts below only need it at the moment they fire, and a ref keeps
  // this hook from re-creating its callbacks every time a keystroke changes a row.
  const lineItemsRef = useRef(lineItems);
  lineItemsRef.current = lineItems;
  // Named the part in a message the user is currently looking at: their real
  // position in this job's own list when it's on this job, else the best label
  // available (see workMatch.mjs) — never a stored item_number, which is only a
  // sort order and may not match what's shown on screen any more.
  const labelForRunningItem = useCallback((entryJobcardId, itemId, itemNumber) => {
    if (entryJobcardId !== jobcardId) return itemNumber;
    return describeItemPosition(lineItemsRef.current, { itemId, itemNumber });
  }, [jobcardId]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [stoppedEntry, setStoppedEntry] = useState(null);
  const [stoppedEntryJobCard, setStoppedEntryJobCard] = useState(null);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [pendingStartItem, setPendingStartItem] = useState(null);
  const intervalRef = useRef(null);
  const selfStoppedRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const onExternalStopRef = useRef(onExternalStop);
  onExternalStopRef.current = onExternalStop;
  const onJobClosedRef = useRef(onJobClosed);
  onJobClosedRef.current = onJobClosed;
  // True (and handled) when err is the closed-job refusal for a write on THIS job.
  const handledAsJobClosed = useCallback((err, writeJobcardId = jobcardId) => {
    if (writeJobcardId !== jobcardId || !isJobClosedError(err) || !onJobClosedRef.current) return false;
    onJobClosedRef.current();
    return true;
  }, [jobcardId]);

  // True (and handled) when a start was refused because the worker has a clock the
  // server stopped by itself that they have not yet answered for. The shell's question
  // is refreshed so it appears now rather than at the next sign-in.
  const handledAsFinishUnconfirmed = useCallback((err) => {
    if (err?.data?.code !== FINISH_UNCONFIRMED) return false;
    toast.error(err.message, { id: 'finish-unconfirmed' });
    refreshFinishQuestionRef.current?.();
    return true;
  }, []);

  const loadActiveTimer = useCallback(async () => {
    try {
      const timer = await api.getActiveTimer();
      if (timer && timer.jobcardId === jobcardId) {
        setActiveTimer(timer);
      } else {
        setActiveTimer(null);
      }
    } catch (err) {
      // Silently fail - timer just won't show
    }
  }, [jobcardId]);

  // Calculate elapsed time
  useEffect(() => {
    if (activeTimer) {
      const updateElapsed = () => {
        const start = new Date(activeTimer.startTime).getTime();
        const now = Date.now();
        // Clamped at 0: a clock skewed ahead of the server's own would otherwise
        // read as a negative elapsed time for the first few ticks after starting.
        setElapsed(Math.max(0, Math.floor((now - start) / 1000)));
      };
      updateElapsed();
      intervalRef.current = setInterval(updateElapsed, 1000);
      return () => clearInterval(intervalRef.current);
    } else {
      setElapsed(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [activeTimer]);

  // Load on mount
  useEffect(() => {
    if (jobcardId) {
      loadActiveTimer();
    }
  }, [jobcardId, loadActiveTimer]);

  // Poll for external stops (e.g. a manager, or the worker on another PC, stopped it)
  useEffect(() => {
    if (!activeTimer || !jobcardId) return;

    // A freshly-adopted timer is ours from this moment on. Clear any leftover
    // "I stopped it myself" latch from a previous timer — otherwise the first
    // time an admin stops this new timer, the poll below would silently swallow
    // the "stopped by an admin" alert and leave a phantom running timer on screen.
    selfStoppedRef.current = false;

    const poll = setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      // Guard against overlapping checks: a slow check (>5s) would otherwise let
      // the next tick start a second check, and the two race on selfStoppedRef —
      // producing a false "stopped by an admin" message when the user stopped it.
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const current = await api.getActiveTimer();
        if (!current || current.id !== activeTimer.id) {
          if (!selfStoppedRef.current) {
            // The server may have stopped it itself (a forgotten clock) — then the
            // shell's question explains what happened, so the toast is skipped.
            let flagged = [];
            try {
              flagged = (await refreshFinishQuestionRef.current?.()) || [];
            } catch {
              // Treated as nothing flagged
            }
            if (flagged.length === 0) {
              toast('Your timer was stopped from another screen', { icon: infoToastIcon });
            }
            if (onExternalStopRef.current) onExternalStopRef.current();
          }
          selfStoppedRef.current = false;
          setActiveTimer(null);
          setElapsed(0);
        }
      } catch {
        // Ignore poll errors — network hiccups should not surface to user
      } finally {
        pollInFlightRef.current = false;
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [activeTimer, jobcardId]);

  // The part is identified to the server by its permanent id (itemId) — never
  // its item_number, which is only a sort order and may not match what's shown
  // on screen. displayNumber is the row's position on screen, purely for the
  // toasts and prompts below; it is never sent anywhere.
  // Resolves true when a timer was actually started (for the caller's own itemId, or
  // for the worker named by workerId), and false on every failure or cancel path —
  // including the "stop & start" prompt when the person declines it, or accepts it but
  // the old run needs its fill-in form first (the new timer only starts once that form
  // is submitted, not here). Never throws — every failure is reported with its own
  // toast, same as before; this only adds a return value on top.
  const startTimerWithConflictCheck = useCallback(async (itemId, displayNumber, showConfirm, workerId, workerName) => {
    if (!itemId) {
      toast.error('Pick a part to start the timer');
      return false;
    }
    // An admin can start a timer FOR another worker. When they do, the running
    // timer belongs to that person (it shows on the worker's own screen and in
    // this job's Progress list), so we must NOT adopt it as the admin's own
    // active timer here.
    const isOnBehalf = !!workerId && workerId !== currentUserId;
    setLoading(true);
    try {
      const result = await api.startTimer(jobcardId, itemId, workerId);
      if (isOnBehalf) {
        toast.success(`Timer started for ${workerName || 'that worker'} on part ${displayNumber}`);
      } else {
        setActiveTimer({
          id: result.id,
          jobcardId: result.jobcardId,
          itemId: result.itemId,
          itemNumber: result.itemNumber,
          startTime: result.startTime
        });
        toast.success(`Timer started on part ${displayNumber}`);
      }
      return true;
    } catch (err) {
      // Checked first: it is a 409 too, and would otherwise read as a timer conflict.
      if (handledAsJobClosed(err)) return false;
      if (handledAsFinishUnconfirmed(err)) return false;
      // On-behalf: the chosen worker already has a timer running elsewhere. This
      // is their conflict, not the admin's, so just report it — the admin's own
      // stop-and-switch flow below only makes sense for the admin's own timer.
      // That worker's other timer isn't necessarily on a job we have loaded, so
      // its part can only be named by its stored number when it's on this job.
      if (isOnBehalf) {
        if (err.status === 409 || err.message.includes('Timer running on another job')) {
          const t = err.data?.activeTimer;
          toast.error(t
            ? `That worker already has a timer running on ${t.jobNumber || 'another job'}, part ${labelForRunningItem(t.jobcardId, t.itemId, t.itemNumber)}`
            : 'That worker already has a timer running');
        } else {
          toast.error(err.message || 'Failed to start timer', { id: 'start-timer-failed' });
        }
        return false;
      }
      // Check for 409 conflict (timer running on another job/item)
      if (err.message.includes('Timer running on another job')) {
        try {
          const currentTimer = await api.getActiveTimer();
          if (currentTimer && showConfirm) {
            const onSameJob = currentTimer.jobcardId === jobcardId;
            const message = onSameJob
              ? `Stop timer on part ${labelForRunningItem(currentTimer.jobcardId, currentTimer.itemId, currentTimer.itemNumber)} and start on part ${displayNumber}?`
              : `Stop timer on ${currentTimer.jobNumber || 'another job'} and start here?`;
            const shouldSwitch = await showConfirm({
              title: 'Timer Running',
              message,
              confirmLabel: 'Stop & Start',
              cancelLabel: 'Cancel',
              confirmVariant: 'primary'
            });
            if (shouldSwitch) {
              selfStoppedRef.current = true;
              noteOwnStopRef.current?.();
              const entry = await api.stopTimer(currentTimer.jobcardId, currentTimer.id);
              setActiveTimer(null);
              // If the old run was under 15s it's discarded — don't ask about it, just
              // start the new timer straight away.
              if (entry?.discarded) {
                const result = await api.startTimer(jobcardId, itemId);
                setActiveTimer({
                  id: result.id,
                  jobcardId: result.jobcardId,
                  itemId: result.itemId,
                  itemNumber: result.itemNumber,
                  startTime: result.startTime
                });
                toast.success(`Timer started on part ${displayNumber}`);
                return true;
              }
              setStoppedEntry(entry);
              if (!onSameJob) {
                setStoppedEntryJobCard({
                  id: currentTimer.jobcardId,
                  jobNumber: currentTimer.jobNumber
                });
              }
              setEntryForm(entryFormFromEntry(entry));
              setShowEntryForm(true);
              setPendingStartItem({ itemId, displayNumber });
              // Not started yet — it only starts once the fill-in form for the old
              // run is submitted (see submitEntryForm's pendingStartItem branch).
              return false;
            }
            // Declined the switch.
            return false;
          }
        } catch (innerErr) {
          clearOwnStopRef.current?.();
          if (handledAsFinishUnconfirmed(innerErr)) return false;
          toast.error(innerErr.message || 'Failed to switch timer', { id: 'switch-timer-failed' });
          return false;
        }
        return false;
      } else {
        toast.error(err.message || 'Failed to start timer', { id: 'start-timer-failed' });
        return false;
      }
    } finally {
      setLoading(false);
    }
  }, [jobcardId, currentUserId, labelForRunningItem, handledAsJobClosed, handledAsFinishUnconfirmed]);

  const stopTimer = useCallback(async () => {
    if (!activeTimer) return;
    setLoading(true);
    try {
      selfStoppedRef.current = true;
      noteOwnStopRef.current?.();
      const entry = await api.stopTimer(jobcardId, activeTimer.id);
      setActiveTimer(null);
      // A run under 15s is discarded server-side — no block, no form, just a heads-up.
      if (entry?.discarded) {
        toast('Timer discarded — under 15 seconds', { icon: discardToastIcon });
        return entry;
      }
      setStoppedEntry(entry);
      setEntryForm(entryFormFromEntry(entry));
      setShowEntryForm(true);
      toast.success('Timer stopped', { id: 'timer-stopped' });
      return entry;
    } catch (err) {
      selfStoppedRef.current = false;
      // Not our stop after all (refused, or the server had cut it first): the question must still be asked.
      clearOwnStopRef.current?.();
      if (err?.data?.code === RUN_STOPPED_ITSELF) {
        // The server had already stopped this clock by itself: show the worker's question
        // rather than an error, and let the work list reload.
        setActiveTimer(null);
        refreshFinishQuestionRef.current?.();
        if (onExternalStopRef.current) onExternalStopRef.current();
      } else {
        toast.error(err.message || 'Failed to stop timer', { id: 'stop-timer-failed' });
      }
    } finally {
      setLoading(false);
    }
  }, [jobcardId, activeTimer]);

  // Stop a specific running entry (from the per-item Progress list) and open the
  // fill-in form so the good pieces / scrap / description get recorded — the same
  // form a worker gets when stopping their own timer. Used by an admin, who may be
  // stopping someone else's run (e.g. one they set up for a worker); when the entry
  // isn't the admin's own we must NOT adopt it as the admin's active timer.
  const stopEntryWithForm = useCallback(async (entry) => {
    if (!entry?.id) return;
    setLoading(true);
    const isOwnActive = !!activeTimer && activeTimer.id === entry.id;
    try {
      const entryJobcardId = entry.jobcardId || jobcardId;
      // Stopping our own running timer here behaves like the normal stop — clear it
      // and stop the background poller crying "stopped by an admin".
      if (isOwnActive) {
        selfStoppedRef.current = true;
        noteOwnStopRef.current?.();
      }
      const result = await api.stopTimer(entryJobcardId, entry.id);
      if (isOwnActive) setActiveTimer(null);
      // A run under 15s is discarded server-side — no block, no form, just a heads-up.
      if (result?.discarded) {
        toast('Timer discarded — under 15 seconds', { icon: discardToastIcon });
        return result;
      }
      setStoppedEntry(result);
      setStoppedEntryJobCard(entryJobcardId !== jobcardId
        ? { id: entryJobcardId, jobNumber: entry.jobNumber }
        : null);
      setEntryForm(entryFormFromEntry(result));
      setShowEntryForm(true);
      toast.success('Timer stopped', { id: 'timer-stopped' });
      return result;
    } catch (err) {
      if (isOwnActive) {
        selfStoppedRef.current = false;
        clearOwnStopRef.current?.();
      }
      if (err?.data?.code === RUN_STOPPED_ITSELF) {
        if (isOwnActive) {
          // Already stopped by the server on its own: the worker's question explains it.
          setActiveTimer(null);
          refreshFinishQuestionRef.current?.();
        } else {
          // Someone else's clock: the refusal carries the sentence to show.
          toast(err.message, { id: 'run-stopped-itself', icon: infoToastIcon });
        }
        if (onExternalStopRef.current) onExternalStopRef.current();
      } else {
        toast.error(err.message || 'Failed to stop timer', { id: 'stop-timer-failed' });
      }
    } finally {
      setLoading(false);
    }
  }, [jobcardId, activeTimer]);

  // Close the stop form for good when its save or resume was refused in a way no retry
  // can fix — the run can no longer be filled in from this form: the job was invoiced
  // and closed, the block was deleted, it was handed to another worker, or it is running
  // again. The server marks each of those with a code (shared/runRefusals.js) rather
  // than this guessing from the wording. The form offers only Save and Resume (no
  // Escape), so leaving it open would cover the job screen with two buttons that can
  // never work. Any other failure keeps it open. Resolves true when it closed the form.
  // (A Save refused as already filled in is not a failure — submitEntryForm carries on
  // as saved, so a queued Stop & Start still starts.)
  const closeFormIfRunUnfillable = useCallback(async (err, entry) => {
    const entryJobcardId = entry.jobcardId || jobcardId;
    const code = err?.data?.code;
    const jobClosed = isJobClosedError(err);
    if (jobClosed) {
      if (!handledAsJobClosed(err, entryJobcardId)) {
        toast.error('That work block can no longer be changed — its job was invoiced from another screen.', { id: 'stopped-block-gone' });
      }
    } else if (err?.status === 404) {
      toast.error('That work block can no longer be changed — it was deleted from another screen.', { id: 'stopped-block-gone' });
    } else if (code === RUN_NOT_YOURS) {
      toast.error('That work block was handed to another worker from another screen, so it can no longer be filled in here.', { id: 'stopped-block-gone' });
    } else if (code === RUN_STILL_RUNNING) {
      // Already resumed — from another screen, or by a resume whose reply never came
      // back. When it is this person's own run on this job, pick the running timer back
      // up so the screen shows it, rather than leaving them with no timer at all.
      let current = null;
      try { current = await api.getActiveTimer(); } catch { /* shown as not ours below */ }
      if (current && current.id === entry.id && current.jobcardId === jobcardId) {
        setActiveTimer(current);
        toast('Your timer is already running again', { id: 'stopped-block-gone', icon: infoToastIcon });
      } else {
        toast('That work block is running again — it was resumed from another screen.', { id: 'stopped-block-gone', icon: infoToastIcon });
      }
    } else {
      return false;
    }
    setShowEntryForm(false);
    setStoppedEntry(null);
    setStoppedEntryJobCard(null);
    setEntryForm(emptyEntryForm());
    setPendingStartItem(null);
    return true;
  }, [jobcardId, handledAsJobClosed]);

  // The stop form on screen right now (kept current synchronously, so two hand-ins in one
  // tick see each other) and the one hand-in waiting behind it.
  const stoppedEntryRef = useRef(null);
  const heldEntryRef = useRef(null);

  // The ids of the stop-form entries this screen has right now: the one on screen (an
  // ordinary stop or a stop form the worker owes) and the one held behind it. The shell
  // reads it so it never offers a form that is already being filled in.
  const shownStopEntryIds = useCallback(() => [stoppedEntryRef.current?.id, heldEntryRef.current?.id]
    .filter(id => id != null), []);

  // Shows the stop form for a run that is already stopped and handed in from outside —
  // the clock the server stopped by itself, once its worker has said when they finished.
  // From here the form behaves exactly as after a normal stop: Save, and X / Resume.
  const showStopFormForEntry = useCallback((entry) => {
    if (!entry?.id) return;
    const shown = stoppedEntryRef.current;
    // Already showing this very run: nothing to do.
    if (shown?.id === entry.id) return;
    // Another stop form is being filled in: keep this one (one slot, a later hand-in
    // replaces it) and show it as soon as the current form has gone.
    if (shown) {
      heldEntryRef.current = entry;
      return;
    }
    heldEntryRef.current = null;
    const entryJobcardId = entry.jobcardId || jobcardId;
    // Marked on the entry itself, so it stays true exactly as long as this entry is the one
    // shown: closing the form without filling it in asks the server for nothing (the
    // worker's answer stands) and it is offered again at the next sign-in.
    stoppedEntryRef.current = { ...entry, fromQuestion: true };
    setStoppedEntry({ ...entry, fromQuestion: true });
    setStoppedEntryJobCard(entryJobcardId !== jobcardId
      ? { id: entryJobcardId, jobNumber: entry.jobNumber }
      : null);
    setEntryForm(entryFormFromEntry(entry));
    setShowEntryForm(true);
  }, [jobcardId]);

  const handleEntryFieldChange = useCallback((field, value) => {
    setEntryForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleEntryMachineToggle = useCallback((machineNumber) => {
    setEntryForm(prev => {
      const current = prev.machineNumbers || [];
      const next = current.includes(machineNumber)
        ? current.filter(m => m !== machineNumber)
        : [...current, machineNumber];
      return { ...prev, machineNumbers: next };
    });
  }, []);

  const submitEntryForm = useCallback(async (reloadEntries) => {
    if (!stoppedEntry) return;

    const hasDescription = entryForm.description && String(entryForm.description).trim() !== '';
    if (!hasDescription) return;

    const qty = String(entryForm.qty || '0').trim() || '0';
    const scrapBinQty = Math.max(0, parseInt(entryForm.scrapBinQty, 10) || 0);
    const scrapRecycleQty = Math.max(0, parseInt(entryForm.scrapRecycleQty, 10) || 0);
    const machines = joinMachineCodes(entryForm.machineNumbers);
    const description = (entryForm.description || '').trim();

    const entryJobcardId = stoppedEntry.jobcardId || jobcardId;

    setLoading(true);
    try {
      // Set when the server says the run's details were already saved — this same
      // Save retried after its reply was lost, or the run saved from another screen.
      // The run is filled in either way, so carry on exactly as a successful save:
      // close the form and start any queued Stop & Start timer.
      let alreadySaved = false;
      try {
        // Only the fields this form owns go out — never the rest of the stop-time copy
        // of the run (its part, worker, or anything a manager corrected while the form
        // was open). No start or finish goes either: the server keeps the stored times
        // for this form's writes (detailsConfirmed).
        await api.updateTimeEntry(entryJobcardId, stoppedEntry.id, {
          qty,
          scrapBinQty,
          scrapRecycleQty,
          machineNumber: machines,
          description,
          // Inspection answers ride along; the server stores whatever is sent, and on a
          // Critical job it requires all four answered before it will save.
          firstOffInspection: entryForm.firstOffInspection,
          inProcessValidation: entryForm.inProcessValidation,
          measuringEquipmentVerification: entryForm.measuringEquipmentVerification,
          equipmentChecks: entryForm.equipmentChecks,
          equipmentChecksComments: (entryForm.equipmentChecksComments || '').trim(),
          // Tells the server this is the worker's own stop-timer form being saved, so
          // it can clear the "still filling in the form" flag that blocks invoicing.
          // Only this form's own writes send it (this save, and the resumes below);
          // the server also keeps the run's stored times for them.
          detailsConfirmed: true
        });
      } catch (saveErr) {
        if (saveErr?.data?.code !== RUN_ALREADY_FILLED_IN) throw saveErr;
        alreadySaved = true;
      }

      setShowEntryForm(false);
      setStoppedEntry(null);
      setStoppedEntryJobCard(null);
      setEntryForm(emptyEntryForm());

      // Tells the caller whether this call actually started a fresh timer (the
      // "Stop & Start" switch, queued behind the old run's fill-in form) — always
      // this same user's own timer, so the caller can credit them exactly as a
      // direct Start would (useJobCardTimerActions.js's handleSubmitEntryForm).
      let startedNewTimer = false;

      if (pendingStartItem != null) {
        const { itemId: nextItemId, displayNumber: nextDisplayNumber } = pendingStartItem;
        setPendingStartItem(null);
        try {
          const result = await api.startTimer(jobcardId, nextItemId);
          setActiveTimer({
            id: result.id,
            jobcardId: result.jobcardId,
            itemId: result.itemId,
            itemNumber: result.itemNumber,
            startTime: result.startTime
          });
          toast.success(`Timer started on part ${nextDisplayNumber}`);
          startedNewTimer = true;
        } catch (startErr) {
          if (!handledAsFinishUnconfirmed(startErr)) {
            toast.error(startErr.message || 'Failed to start new timer', { id: 'start-new-timer-failed' });
          }
        }
      } else if (alreadySaved) {
        toast('That work block\'s details were already saved.', { id: 'stopped-block-gone', icon: infoToastIcon });
      } else {
        toast.success('Time entry updated');
      }

      if (reloadEntries) await reloadEntries();
      return { startedNewTimer };
    } catch (err) {
      if (await closeFormIfRunUnfillable(err, stoppedEntry)) return { startedNewTimer: false };
      // The job was made Critical after this form opened: hand the refusal back so
      // the form switches its checklist on and marks the unanswered checks, instead
      // of a pop-up that every retry would repeat.
      if (err?.data?.code === CRITICAL_INSPECTION_REFUSED) return { startedNewTimer: false, inspectionRefusal: err };
      toast.error(err.message || 'Failed to update time entry', { id: 'update-time-entry-failed' });
      return { startedNewTimer: false };
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry, entryForm, pendingStartItem, closeFormIfRunUnfillable, handledAsFinishUnconfirmed]);

  const cancelEntryForm = useCallback(async (reloadEntries) => {
    if (!stoppedEntry) return;
    // The form from the "when did you finish?" question is blocking: the only ways out
    // are saving it or signing out (the sign-out hook below leaves the run stopped).
    if (stoppedEntry.fromQuestion) return;
    const entryJobcardId = stoppedEntry.jobcardId || jobcardId;
    const isSameJob = entryJobcardId === jobcardId;
    setLoading(true);
    try {
      // A resume sends only the cleared finish (the server keeps the stored start) —
      // never the stop-time copy of the run's pieces, notes, answers or part, which
      // would undo a correction made while the form was open.
      await api.updateTimeEntry(entryJobcardId, stoppedEntry.id, {
        endTime: null,
        // Same as the submit path above: this resume is the worker's own stop-timer
        // form being answered (they chose to cancel and keep working).
        detailsConfirmed: true
      });
      // Re-adopt the resumed timer as our own only when it's actually ours. An admin
      // may be resuming a run that belongs to another worker (one they stopped from
      // the Progress list) — that timer reopens for the worker, but it must not become
      // the admin's active timer. Cross-job resume: the other job's timer stays
      // running and re-attaches when that modal opens.
      if (isSameJob && stoppedEntry.userId === currentUserId) {
        setActiveTimer({
          id: stoppedEntry.id,
          jobcardId,
          itemId: stoppedEntry.itemId,
          itemNumber: stoppedEntry.itemNumber,
          startTime: stoppedEntry.startTime
        });
      }
      setShowEntryForm(false);
      setStoppedEntry(null);
      setStoppedEntryJobCard(null);
      setEntryForm(emptyEntryForm());
      setPendingStartItem(null);
      if (reloadEntries) await reloadEntries();
      toast.success('Timer resumed');
    } catch (err) {
      if (await closeFormIfRunUnfillable(err, stoppedEntry)) return;
      toast.error(err.message || 'Failed to resume timer', { id: 'resume-timer-failed' });
    } finally {
      setLoading(false);
    }
  }, [jobcardId, stoppedEntry, currentUserId, closeFormIfRunUnfillable]);

  // Resume timer if user gets auto-logged out while filling StopTimerForm — but only
  // their own run. A manager may be holding another worker's block here (stopped from
  // a part's progress list); signing out must not restart that worker's timer behind
  // their back, so it stays stopped, waiting for its pieces.
  useEffect(() => { stoppedEntryRef.current = stoppedEntry; }, [stoppedEntry]);

  // The form from the question has gone away (saved, or closed as unfillable): tell the
  // shell once, so it stops holding the next question back.
  const hadQuestionFormRef = useRef(false);
  useEffect(() => {
    const hasQuestionForm = !!stoppedEntry?.fromQuestion;
    if (hadQuestionFormRef.current && !hasQuestionForm) stopFormDoneRef.current?.();
    hadQuestionFormRef.current = hasQuestionForm;
  }, [stoppedEntry]);

  // A form handed in while another was being filled in is shown once that one has gone
  // (declared after the effect above, so the shell hears about the old form first).
  useEffect(() => {
    if (stoppedEntry || !heldEntryRef.current) return;
    const held = heldEntryRef.current;
    heldEntryRef.current = null;
    showStopFormForEntry(held);
  }, [stoppedEntry, showStopFormForEntry]);

  const hasStoppedEntry = !!stoppedEntry;
  useEffect(() => {
    if (!showEntryForm || !hasStoppedEntry) return;
    return registerBeforeLogout(() => {
      const entry = stoppedEntryRef.current;
      if (!entry || entry.userId !== currentUserId || entry.fromQuestion) return;
      // Use entry.jobcardId (not jobcardId) so cross-job stops resume on the correct job.
      // Handed back so signing out waits for it: the session is cancelled server-side
      // now, and a resume that arrives after that is refused and the run stays stopped.
      // Like the form's own Resume: only the cleared finish, and the stored start is kept.
      return api.updateTimeEntry(entry.jobcardId || jobcardId, entry.id, {
        endTime: null,
        detailsConfirmed: true
      }).catch(() => {});
    });
  }, [showEntryForm, hasStoppedEntry, jobcardId, currentUserId, registerBeforeLogout]);

  const resetTimer = useCallback(() => {
    setActiveTimer(null);
    setElapsed(0);
    setShowEntryForm(false);
    setStoppedEntry(null);
    setStoppedEntryJobCard(null);
    setEntryForm(emptyEntryForm());
    setPendingStartItem(null);
    heldEntryRef.current = null;
    stoppedEntryRef.current = null;
    // A form wiped by this reset was not saved: it must not be reported to the shell as done.
    hadQuestionFormRef.current = false;
  }, []);

  return {
    activeTimer,
    elapsed,
    loading,
    showEntryForm,
    stoppedEntry,
    stoppedEntryJobCard,
    // True when the shown stop form is one the worker owes (from the question, or left
    // unfilled earlier): it has no close button and cannot be cancelled; the worker saves it or signs out.
    mustFillIn: !!stoppedEntry?.fromQuestion,
    entryForm,
    startTimerWithConflictCheck,
    stopTimer,
    stopEntryWithForm,
    showStopFormForEntry,
    shownStopEntryIds,
    handleEntryFieldChange,
    handleEntryMachineToggle,
    submitEntryForm,
    cancelEntryForm,
    loadActiveTimer,
    resetTimer
  };
}
