import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { infoToastIcon } from '../components/common/toastIcons';
import { useAuth } from './AuthContext';
import { subscribeOpenMentionsMarker, getOpenMentionsMarker, setOpenMentionsMarker } from './openMentionsMarker';
import { FinishQuestionContext } from './FinishQuestionContext';
import FinishQuestionDialog from '../components/common/FinishQuestionDialog';
import AttentionDialog, { MentionsSection, ATTENTION_MODAL_ID } from '../components/common/AttentionDialog';
import { subscribeModalStack, anyModalOpenExcept, PINNED_LAYERS } from '../components/common/modalStack';
import { useMentionAttention } from '../hooks/useMentionAttention';
import { decideAttention } from './attentionDue';
import { MentionsContext } from './MentionsContext';
import JobCardModal from '../components/jobcard/JobCardModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const anyOtherWindowOpen = () => anyModalOpenExcept(ATTENTION_MODAL_ID);
// A read of the open mentions failed: forget the marker, so the next poll's marker reads as
// a change and the list is read again — even when nothing changed on the server.
const forgetMentionsMarker = () => setOpenMentionsMarker(null);

// Composes the worker's clock question and their @mention questions into one blocking
// "Needs your attention" window (AttentionDialog) with two sections. Mounted inside the
// signed-in shell.
// This file owns the clock side: a clock they left running was stopped by the server and
// needs the time they really finished. While the server lists one or more such clocks it
// shows the first one's question over everything; answering is the only way out (besides
// signing out). It also owns the stop forms still owed (the check for them at sign-in,
// after an answer and after a form; a stop form still owed is blocking and is offered again
// after each answer and each saved form) and the job screens it hands those forms to. A
// failed read is silent (no question) and is never retried in a loop — it is asked again at
// sign-in and when a screen notices a clock has gone (refresh below).
// The mentions side (the list, the job opened from a row, the re-read after it closes)
// lives in hooks/useMentionAttention.js; whether the rows are already up is kept here. This file passes
// both sides to decideAttention (attentionDue.js), which holds the rules for what shows
// and when: the rows wait until no other window is open, are hidden while a job is open
// from a row or a stop form is up, are greyed out while a clock or an owed-form check is
// pending, and once up stay up over a window that opens later. A reply posted on any job
// window drops that job's row at once, because the server answers every open mention on
// that job; job screens reach that through MentionsContext (mentionsAnsweredOnJob).
export function FinishQuestionProvider({ children }) {
  const { user, logout, getUnsavedWorkLabel } = useAuth();
  const openMentionsSignature = useSyncExternalStore(subscribeOpenMentionsMarker, getOpenMentionsMarker);
  const { dialogState, showConfirm, handleCancel, handleConfirm } = useConfirmDialog();
  const userId = user?.id;
  const [flagged, setFlagged] = useState([]);
  // The job screen shown for the stop form after an answer of "I'm done with it".
  // Open/closed is separate from which job, as on the search page, so closing doesn't
  // clear the job in the same breath (the job screen saves on the way out).
  // `external` is true when the form was handed to a job screen that was already open (that
  // screen shows it, so this provider renders no modal of its own for it).
  const [stopJob, setStopJob] = useState({ id: null, entry: null, open: false, external: false });
  const stopJobRef = useRef(stopJob);
  stopJobRef.current = stopJob;
  const {
    mentions, rereadingMentions,
    mentionJob, openMentionJob, closeMentionJob, dropMentionJob
  } = useMentionAttention(userId, openMentionsSignature, forgetMentionsMarker);
  // Whether any window other than the attention window itself is open right now.
  const otherWindowOpen = useSyncExternalStore(subscribeModalStack, anyOtherWindowOpen);
  // Whether the question rows were up in the last frame (they then stay up over windows
  // that open later). State, not a ref: decideAttention reads it during render, so it must
  // be right on the very render a window opens, not only after a commit has written it.
  const [mentionsHeld, setMentionsHeld] = useState(false);
  // True while a check that may end by opening a stop form is in flight.
  const [checkingOwed, setCheckingOwed] = useState(false);
  // Open job screens, by job, each able to show a stop form for an entry (showStopForm),
  // to say which stop-form entries it shows now (shownStopEntryIds) and to reload its
  // clock and work after an answer changed them (reload).
  const jobScreensRef = useRef(new Map());
  // Pages behind that list jobs, each reloading when a job is changed on this provider's own screen.
  const jobChangedRef = useRef(new Set());
  // Pages behind that show a per-job unread mark, each told when the provider's own screen
  // read a job's comments, so they patch that one row instead of reloading the whole list.
  const commentsReadRef = useRef(new Set());
  const requestIdRef = useRef(0);
  // Numbers each stop-form offer, so a newer offer supersedes an older one's reply.
  const unfilledRequestIdRef = useRef(0);
  // Numbers each owed-stop-form check (an offer, or the wait before one); only the newest
  // check's end clears the "checking" flag.
  const owedCheckTokenRef = useRef(0);
  const userIdRef = useRef(userId);

  // Marks a check for owed stop forms as in flight and returns its token. A newer check
  // supersedes an older one: ending an older token never clears a newer check's flag.
  const beginOwedCheck = useCallback(() => {
    const token = ++owedCheckTokenRef.current;
    setCheckingOwed(true);
    return token;
  }, []);
  const endOwedCheck = useCallback((token) => {
    if (token === owedCheckTokenRef.current) setCheckingOwed(false);
  }, []);

  // Reads the signed-in person's flagged clocks, shows them, and returns the list
  // (null when the read failed). A reply overtaken by a newer read is not shown.
  const readFlagged = useCallback(async () => {
    const id = ++requestIdRef.current;
    try {
      const result = await api.getUnconfirmedFinish();
      const list = Array.isArray(result) ? result : [];
      if (id === requestIdRef.current) setFlagged(list);
      return list;
    } catch {
      return null;
    }
  }, []);

  // The same read for the screens that only ask "is anything flagged?": [] when it failed.
  const refresh = useCallback(async () => (await readFlagged()) || [], [readFlagged]);

  // Shows the stop form for an entry: on the job's own screen when one is already open,
  // otherwise on a job screen of this provider's own.
  const openStopForm = useCallback((entry) => {
    const screen = jobScreensRef.current.get(entry.jobcardId);
    if (screen) {
      screen.showStopForm(entry);
      setStopJob({ id: null, entry, open: true, external: true });
    } else {
      setStopJob({ id: entry.jobcardId, entry, open: true, external: false });
    }
  }, []);

  // Offers the first stop form this worker still owes (a finished run of their own whose
  // form was never filled in — they signed out, or it followed the question) that is not
  // already on screen. Called only when no question is pending
  // and no stop form is open. It cannot loop: a row drops out of the server's list when
  // the worker's own save of the form clears its "form owed" mark, so a saved form is
  // not offered again. A reply for a user who has since signed out or
  // switched is dropped, and a newer check supersedes an older one. Failures are silent.
  const offerUnfilledStopForm = useCallback(async () => {
    const id = ++unfilledRequestIdRef.current;
    const token = beginOwedCheck();
    const askedFor = userIdRef.current;
    try {
      const forms = await api.getUnfilledStopForms();
      if (id !== unfilledRequestIdRef.current || askedFor !== userIdRef.current) return;
      if (!Array.isArray(forms) || forms.length === 0) return;
      // Skip a run whose stop form is on screen right now (an ordinary stop just pressed,
      // or one already offered): offering it again would stack a second form on it.
      const shown = new Set();
      jobScreensRef.current.forEach(screen => screen.shownStopEntryIds?.().forEach(shownId => shown.add(shownId)));
      const own = stopJobRef.current;
      if (own.open && own.entry?.id != null) shown.add(own.entry.id);
      const next = forms.find(form => !shown.has(form.id));
      if (next) openStopForm(next);
    } catch {
      // Silent: it is checked again after the next answer or form
    } finally {
      endOwedCheck(token);
    }
  }, [openStopForm, beginOwedCheck, endOwedCheck]);

  useEffect(() => {
    userIdRef.current = userId;
    if (!userId) {
      unfilledRequestIdRef.current++;
      owedCheckTokenRef.current++;
      setCheckingOwed(false);
      setFlagged([]);
      return;
    }
    // At sign-in: with no question pending, offer any stop form still owed.
    let stale = false;
    (async () => {
      const token = beginOwedCheck();
      const list = await refresh();
      if (stale || list.length > 0) {
        endOwedCheck(token);
        return;
      }
      offerUnfilledStopForm();
    })();
    return () => { stale = true; };
  }, [userId, refresh, offerUnfilledStopForm, beginOwedCheck, endOwedCheck]);

  const notifyJobChanged = useCallback(() => {
    jobChangedRef.current.forEach(callback => callback());
  }, []);

  // The question changes a job's clock and work from outside that job's screen (the answer
  // rewrites the old block, "still working" starts a new clock, a question that fell away
  // means someone else changed it). This is the one place that says so: the job's screen,
  // if it is open, reloads its clock and work, and the page behind reloads its list.
  const announceJobChanged = useCallback((jobcardId) => {
    jobScreensRef.current.get(jobcardId)?.reload();
    notifyJobChanged();
  }, [notifyJobChanged]);

  // The answer is saved (and, for "still working", the new clock has been asked for). A
  // worker who is done now fills in the usual stop form for that clock, on its own job's
  // screen; one who is still working goes on to any other form they owe.
  const handleAnswered = useCallback(async (entry, item) => {
    // The answered question goes at once, even if the re-read below fails.
    setFlagged(prev => prev.filter(f => f.id !== item.id));
    if (entry) openStopForm(entry);
    announceJobChanged(item.jobcardId);
    if (entry) {
      await refresh();
      return;
    }
    const token = beginOwedCheck();
    try {
      const list = await refresh();
      if (list.length === 0) offerUnfilledStopForm();
    } finally {
      endOwedCheck(token);
    }
  }, [refresh, offerUnfilledStopForm, openStopForm, announceJobChanged, beginOwedCheck, endOwedCheck]);

  // The answer was refused for a reason the dialog has no box for. The dialog has no other
  // way out, so the server's own list of what this worker owes decides whether there is
  // still something to answer: a clock no longer on it (deleted with its job, removed, or
  // handed to someone else from another screen) takes its question away. A clock the
  // server says is not there at all (404) counts as gone even when the list can't be read.
  // Resolves true when the question went; false leaves it up for the dialog's own message.
  const recheckQuestion = useCallback(async (item, err) => {
    const list = await readFlagged();
    const gone = err?.status === 404 || (!!list && !list.some(f => f.id === item.id));
    if (!gone) return false;
    setFlagged(prev => prev.filter(f => f.id !== item.id));
    toast(err?.status === 404
      ? 'That clock no longer needs an answer — it was removed from another screen.'
      : 'That clock no longer needs an answer — it was changed from another screen.',
    { id: 'finish-question-gone', icon: infoToastIcon });
    announceJobChanged(item.jobcardId);
    if (list && !list.some(f => f.id !== item.id)) offerUnfilledStopForm();
    return true;
  }, [readFlagged, announceJobChanged, offerUnfilledStopForm]);

  // Closing a saved form leads on to the next one owed, one after another.
  const closeStopJob = useCallback(() => {
    setStopJob(prev => ({ ...prev, open: false }));
    offerUnfilledStopForm();
  }, [offerUnfilledStopForm]);

  // A job screen that was open when the form was handed to it reports the form saved (or
  // closed as unfillable): same as closing the provider's own screen.
  // The provider's own screen closes the same way once its form is done, and the page
  // behind reloads.
  const stopFormDone = useCallback(() => {
    const current = stopJobRef.current;
    if (current.external) {
      closeStopJob();
    } else if (current.open) {
      closeStopJob();
      notifyJobChanged();
    }
  }, [closeStopJob, notifyJobChanged]);

  // An open job screen offers itself ({ showStopForm, shownStopEntryIds, reload }) for its job's stop form and
  // for the reload after an answer; returns the way to withdraw.
  // If it goes while it holds the form, nothing may keep the next question held back.
  const registerJobScreen = useCallback((jobcardId, screen) => {
    jobScreensRef.current.set(jobcardId, screen);
    return () => {
      if (jobScreensRef.current.get(jobcardId) === screen) jobScreensRef.current.delete(jobcardId);
      setStopJob(prev => (prev.external && prev.open && prev.entry?.jobcardId === jobcardId
        ? { ...prev, open: false }
        : prev));
    };
  }, []);

  // A page behind subscribes to hear that the stop form (or anything else) changed a job on
  // this provider's own screen; returns the way to unsubscribe.
  const subscribeJobChanged = useCallback((callback) => {
    jobChangedRef.current.add(callback);
    return () => { jobChangedRef.current.delete(callback); };
  }, []);

  // The provider's own screen read a job's comments: tell the pages showing unread marks
  // the job and its new unread count, which is all they need to patch one row.
  const notifyCommentsRead = useCallback((jobId, unreadNotes) => {
    commentsReadRef.current.forEach(callback => callback(jobId, unreadNotes));
  }, []);

  const subscribeCommentsRead = useCallback((callback) => {
    commentsReadRef.current.add(callback);
    return () => { commentsReadRef.current.delete(callback); };
  }, []);

  // Once the provider's own screen has finished closing, drop its job so it stops running
  // (polling, timers). Runs after the screen's own close-time effects in the same commit,
  // and the screen's saves were already finished before it asked to close.
  useEffect(() => {
    if (stopJob.open || !stopJob.id) return;
    setStopJob(prev => (prev.open ? prev : { id: null, entry: null, open: false, external: false }));
  }, [stopJob]);

  // Signing out from the attention window can happen over a job screen with work that only
  // saves on Create (a new job being typed), so it asks first when something is unsaved.
  const signOutFromAttention = useCallback(async () => {
    const label = getUnsavedWorkLabel();
    if (label) {
      const ok = await showConfirm({
        title: 'Sign out?',
        message: `You have an unsaved ${label}. Signing out now will lose it.`,
        confirmLabel: 'Sign out',
        cancelLabel: 'Stay signed in',
        confirmVariant: 'danger'
      });
      if (!ok) return;
    }
    logout();
  }, [getUnsavedWorkLabel, showConfirm, logout]);

  const value = useMemo(
    () => ({ refresh, registerJobScreen, stopFormDone, subscribeJobChanged, subscribeCommentsRead }),
    [refresh, registerJobScreen, stopFormDone, subscribeJobChanged, subscribeCommentsRead]
  );
  // A comment posted on a job from any job window answers the person's open questions on
  // it, so dropMentionJob removes its row at once instead of waiting for the next read.
  const mentionsValue = useMemo(() => ({ mentionsAnsweredOnJob: dropMentionJob }), [dropMentionJob]);

  const due = decideAttention({
    flagged,
    stopJobOpen: stopJob.open,
    mentionJobOpen: mentionJob.open,
    checkingOwed,
    rereadingMentions,
    otherWindowOpen,
    mentions,
    mentionsHeld
  });
  const first = due.clock;
  // Once the questions are up they stay up; the flag follows what is shown. Adjusted during
  // render, so React re-renders at once with the new value, before anything is drawn.
  const mentionsUp = due.mentionRows.length > 0;
  if (mentionsHeld !== mentionsUp) setMentionsHeld(mentionsUp);
  // The wait reason is in the key so focus is placed again when the rows become pressable.
  const contentKey = `${first ? first.id : ''}|${due.mentionRows.map(row => row.jobcardId).join(',')}|${due.mentionsWaitReason || ''}`;

  return (
    <FinishQuestionContext.Provider value={value}>
      <MentionsContext.Provider value={mentionsValue}>
      {children}
      {/* Held back while the stop form is up, so a second question never stacks on it. */}
      {due.showing && (
        <AttentionDialog contentKey={contentKey} onSignOut={signOutFromAttention}>
          {first && (
            <FinishQuestionDialog
              key={first.id}
              item={first}
              onAnswered={handleAnswered}
              onRecheck={recheckQuestion}
            />
          )}
          {mentionsUp && (
            <MentionsSection mentions={due.mentionRows} waitReason={due.mentionsWaitReason} onOpen={openMentionJob} />
          )}
        </AttentionDialog>
      )}
      {stopJob.id && (
        <JobCardModal
          // A window shows its stop entry only once, on mount, so each stop form gets a fresh window.
          key={`${stopJob.id}:${stopJob.entry?.id ?? ''}`}
          isOpen={stopJob.open}
          onClose={closeStopJob}
          jobCardId={stopJob.id}
          initialStopEntry={stopJob.entry}
          onSuccess={notifyJobChanged}
          onTimerChange={notifyJobChanged}
          onNotesChange={notifyJobChanged}
          onCommentsRead={notifyCommentsRead}
          ownsStopForm
        />
      )}
      {mentionJob.id && (
        <JobCardModal
          key={`${mentionJob.id}:${mentionJob.seq}`}
          isOpen={mentionJob.open}
          onClose={closeMentionJob}
          jobCardId={mentionJob.id}
          initialCommentNoteId={mentionJob.noteId}
          onSuccess={notifyJobChanged}
          onTimerChange={notifyJobChanged}
          onNotesChange={notifyJobChanged}
          onCommentsRead={notifyCommentsRead}
        />
      )}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        pinnedLayer={PINNED_LAYERS.signOutConfirm}
      />
      </MentionsContext.Provider>
    </FinishQuestionContext.Provider>
  );
}
