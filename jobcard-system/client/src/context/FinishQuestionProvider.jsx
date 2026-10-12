import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { infoToastIcon } from '../components/common/toastIcons';
import { useAuth } from './AuthContext';
import { FinishQuestionContext } from './FinishQuestionContext';
import FinishQuestionDialog from '../components/common/FinishQuestionDialog';
import JobCardModal from '../components/jobcard/JobCardModal';

// The question a worker must answer before doing anything else: a clock they left
// running was stopped by the server, and it needs the time they really finished.
// Mounted inside the signed-in shell. While the server lists one or more such clocks
// it shows the first one's question over everything; answering is the only way out.
// A failed read is silent (no question) and is never retried in a loop — it is asked
// again at sign-in and when a screen notices a clock has gone (refresh below). A stop
// form still owed is blocking and is offered again after each answer and each saved form.
export function FinishQuestionProvider({ children }) {
  const { user } = useAuth();
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
  // Open job screens, by job, each able to show a stop form for an entry (showStopForm),
  // to say which stop-form entries it shows now (shownStopEntryIds) and to reload its
  // clock and work after an answer changed them (reload).
  const jobScreensRef = useRef(new Map());
  // Pages behind that list jobs, each reloading when a job is changed on this provider's own screen.
  const jobChangedRef = useRef(new Set());
  const requestIdRef = useRef(0);
  const unfilledRequestIdRef = useRef(0);
  const userIdRef = useRef(userId);

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
    }
  }, [openStopForm]);

  useEffect(() => {
    userIdRef.current = userId;
    if (!userId) {
      unfilledRequestIdRef.current++;
      setFlagged([]);
      return;
    }
    // At sign-in: with no question pending, offer any stop form still owed.
    let stale = false;
    (async () => {
      const list = await refresh();
      if (stale || list.length > 0) return;
      offerUnfilledStopForm();
    })();
    return () => { stale = true; };
  }, [userId, refresh, offerUnfilledStopForm]);

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
    const list = await refresh();
    if (!entry && list.length === 0) offerUnfilledStopForm();
  }, [refresh, offerUnfilledStopForm, openStopForm, announceJobChanged]);

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

  // Once the provider's own screen has finished closing, drop its job so it stops running
  // (polling, timers). Runs after the screen's own close-time effects in the same commit,
  // and the screen's saves were already finished before it asked to close.
  useEffect(() => {
    if (stopJob.open || !stopJob.id) return;
    setStopJob(prev => (prev.open ? prev : { id: null, entry: null, open: false, external: false }));
  }, [stopJob]);

  const value = useMemo(
    () => ({ refresh, registerJobScreen, stopFormDone, subscribeJobChanged }),
    [refresh, registerJobScreen, stopFormDone, subscribeJobChanged]
  );
  const first = flagged[0] || null;

  return (
    <FinishQuestionContext.Provider value={value}>
      {children}
      {/* Held back while the stop form is up, so a second question never stacks on it. */}
      {first && !stopJob.open && (
        <FinishQuestionDialog
          key={first.id}
          item={first}
          onAnswered={handleAnswered}
          onRecheck={recheckQuestion}
        />
      )}
      {stopJob.id && (
        <JobCardModal
          isOpen={stopJob.open}
          onClose={closeStopJob}
          jobCardId={stopJob.id}
          initialStopEntry={stopJob.entry}
          onSuccess={notifyJobChanged}
          onTimerChange={notifyJobChanged}
          onNotesChange={notifyJobChanged}
          ownsStopForm
        />
      )}
    </FinishQuestionContext.Provider>
  );
}
