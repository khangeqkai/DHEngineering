import { useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { scrollFieldIntoView } from '../../hooks/useFieldErrors';
import { describeAtRisk, describeSafe, describeSafeAsSecondLine } from './closeReasons';

// Everything the job screen does about work that would be lost if the screen went away.
// Pulled out of JobCardModal.jsx because it grew to cover four separate ways a job card
// can disappear — closing it, refreshing the page, the inactivity sign-out, and simply
// not being able to see the signal — and each one needs the same answer to "is there
// anything here worth keeping?".
//
// isDirty is the narrow answer: edits to the job's own fields, parts and people that are
// waiting on a Save. It drives the amber ring and the footer button's wording, and it is
// passed in rather than worked out here.
//
// hasUnsavedWork is the wider answer, and the one every question below is asked about. It
// adds a comment typed into the Comments tab but never posted, and the details form of a
// run that was just stopped (the run itself is recorded, but the machine, quantities and
// checks about to go on it are not). Those two are deliberately kept out of isDirty:
// neither is waiting on a Save, and the stop form is already a panel in its own right, so
// framing the whole window amber for it would dilute a signal that means something else.
//
// Pricing (costingDirty) is deliberately left out of hasUnsavedWork too, and for a
// different reason: closing the job saves it first and waits for the answer
// (useJobCardCloseGuard.js), so the close question only has to mention pricing when that
// save failed or hasn't answered yet — the caller says so with pricingUnsaved. But a page refresh and
// the inactivity sign-out don't run that save — they just make the screen disappear — so
// the two effects below that guard against those need a wider question still:
// hasWorkToLose, which folds costingDirty in alongside hasUnsavedWork.
export function useUnsavedGuard({ isOpen, isDirty, saving = false, hasUnpostedNote, stopFormOpen, costingDirty = false, costingUnsettled = false, showConfirm, onClose, isEdit = false, closeReasons = { safe: [], atRisk: [] }, revealDetails }) {
  const { registerUnsavedWork } = useAuth();
  const hasUnsavedWork = isDirty || hasUnpostedNote || stopFormOpen;
  // A page refresh and the inactivity sign-out both skip the close question and its
  // own pricing flush (see useJobCardCosting.js), so they need to know about a box
  // still being typed in or sitting red too — not just a committed figure waiting on
  // a save (costingDirty) — or a draft or an invalid figure would vanish in silence.
  const hasWorkToLose = hasUnsavedWork || costingDirty || costingUnsettled;

  // Escape and the header X both close through this (it is wired as BottomSheet's
  // onClose), so the "are you sure" question lives in one place rather than at each
  // dismissal path. A save already in flight is not raced by a close — it isn't
  // cancelled, it just keeps running and its own toast/onSuccess still land once it
  // resolves, same as if the screen had stayed open.
  //
  // pricingUnsaved: the close guard tried to save the pricing sheet just now and it
  // failed ('failed') — the typed figures would go with the window, so they are named as
  // work at risk — or hadn't answered in time ('pending'). A pending save is still on its
  // way and may yet store, so it is never called lost: it gets its own "still saving"
  // question, like a job save in flight, and closing leaves it running.
  const handleRequestClose = useCallback(async ({ pricingUnsaved = false } = {}) => {
    const pricingPending = pricingUnsaved === 'pending';
    const pricingFailed = pricingUnsaved === 'failed';
    // Pressing Save and then Escape within the same second used to be met with "close and
    // lose them?", which was simply untrue: the work is on its way and almost always
    // lands. (The screen still reads as unsaved during that second, because the mark only
    // moves once the reply is back.) Answering "discard" then closed the card and a
    // "Job card updated" message arrived a moment later with nothing on screen. Say what
    // is actually happening instead, and name the one real risk — a save that fails after
    // the card is gone takes the work with it.
    if (saving) {
      const carryOn = await showConfirm({
        title: 'Still saving',
        message: 'This job card is still being saved. Close it anyway? If the save fails there will be nothing left on screen to try again from.'
          + (pricingPending ? ' Your pricing is still being saved too and may still go through.' : ''),
        confirmLabel: 'Close anyway',
        cancelLabel: 'Wait',
        confirmVariant: 'warning'
      });
      if (!carryOn) return;
      onClose();
      return;
    }
    // Asked before anything else is weighed, and answered on its own: "Close anyway"
    // only settles the pricing, and any other unsaved work still gets its own question.
    if (pricingPending) {
      const carryOn = await showConfirm({
        title: 'Still saving',
        message: 'Your pricing is still being saved and may still go through — close anyway?',
        confirmLabel: 'Close anyway',
        cancelLabel: 'Wait',
        confirmVariant: 'warning'
      });
      if (!carryOn) return;
    }
    if (!hasUnsavedWork && !pricingFailed) {
      onClose();
      return;
    }

    // A brand-new job keeps the Save button and the plain original question — the
    // required-box/failed-write split below only means something once a job
    // exists for a field, a row or a worker to have been sent to.
    if (!isEdit) {
      const ok = await showConfirm({
        title: 'Unsaved changes',
        message: "This job card has changes that haven't been saved yet. Close it and lose them?",
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        confirmVariant: 'danger'
      });
      if (!ok) return;
      onClose();
      return;
    }

    // hasUnpostedNote and stopFormOpen are folded in here (rather than inside
    // closeReasons.js, which only ever sees isDirty's own ingredients) so they
    // can be named for what they are — "an unposted comment" / "the timer entry
    // form" — instead of a shared, vaguer "changes".
    const atRisk = [...closeReasons.atRisk];
    if (hasUnpostedNote) atRisk.push({ text: 'your unposted comment', verb: "hasn't been posted" });
    if (stopFormOpen) atRisk.push({ text: 'the open timer entry form', verb: "hasn't been saved" });
    if (pricingFailed) atRisk.push({ text: 'your pricing', verb: "hasn't been saved" });
    const { safe } = closeReasons;

    // Real risk beats "nothing to lose": if anything could actually be lost by
    // closing, that is what the question leads with, and an empty required box
    // (if there's also one of those) is folded in as a second line rather than
    // its own dialog.
    if (atRisk.length > 0) {
      const message = describeAtRisk(atRisk) + describeSafeAsSecondLine(safe);
      const ok = await showConfirm({
        title: 'Unsaved changes',
        message,
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        confirmVariant: 'danger'
      });
      if (!ok) return;
      onClose();
      return;
    }

    // Only empty required boxes are outstanding: nothing is actually at risk, so
    // this doesn't talk about losing anything — it offers to go fix the box
    // instead. safe.length is guaranteed > 0 here: hasUnsavedWork is true and
    // nothing above explained it, so closeReasons.js's own fallback (a field
    // still mid-flight) would already have landed in atRisk if this job's dirt
    // came from anywhere else.
    const { title, message } = describeSafe(safe);
    const ok = await showConfirm({
      title,
      message,
      confirmLabel: 'Close anyway',
      cancelLabel: 'Fix it',
      confirmVariant: 'warning'
    });
    if (ok) {
      onClose();
      return;
    }
    // Every box this can name — the job description and the parts list — lives on the
    // Details tab, so an admin who hit Escape from Costing or Activity would be sent
    // back to a box that isn't on screen and scrollFieldIntoView would find nothing.
    // Switch there first, then let that render land before reaching for the element.
    revealDetails?.(); // the caller switches to the Details tab; see the comment above
    requestAnimationFrame(() => scrollFieldIntoView(safe[0].key));
  }, [saving, hasUnsavedWork, isEdit, closeReasons, hasUnpostedNote, stopFormOpen, showConfirm, onClose, revealDetails]);

  // A browser refresh (Ctrl+R) and closing the tab never reach handleRequestClose — they
  // were throwing a half-filled card away in silence, which is the same hole that was
  // closed for Escape. The browser only ever shows its own fixed wording here, and only
  // once the page has been interacted with, so this cannot carry the message above; it
  // just makes the refresh stop and ask.
  useEffect(() => {
    if (!isOpen || !hasWorkToLose) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      // Older browsers need returnValue set as well as the default prevented.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isOpen, hasWorkToLose]);

  // The last way work disappears without being asked about: the inactivity sign-out. It
  // already waits a moment for last-moment work to land (useTimer.js uses that to put a
  // half-stopped run back on the clock), but its countdown said nothing about what was
  // behind it. Registering here lets the countdown name the job card, so six minutes away
  // from the machine doesn't end in a silently emptied form. Only while there is
  // something to lose — a card sitting open with nothing typed into it isn't worth a
  // warning. Admins are exempt from the inactivity timer; managers and employees are not.
  useEffect(() => {
    if (!isOpen || !hasWorkToLose) return undefined;
    return registerUnsavedWork('job card');
  }, [isOpen, hasWorkToLose, registerUnsavedWork]);

  return { hasUnsavedWork, handleRequestClose };
}
