import { useState, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { isJobClosedError } from '../../utils/jobLock';
import { toastJobWriteFailure } from './jobWriteFailure';
import { findUnmatchedMentions, buildNameLookup, resolveMentions, displayNameOf } from './mentionNames';
import { useAuth } from '../../context/AuthContext';
import { joinList } from '../../utils/joinList';
import { useFieldErrors, showSaveRefusal } from '../../hooks/useFieldErrors';
import { MAX_MENTIONS, TOO_MANY_MENTIONS_MESSAGE, MENTION_INACTIVE } from '../../../../server/src/shared/mentions';

// One shared empty list, so an absent staff prop is the same array on every render.
const NO_STAFF = [];

// Takes one options object: { jobcardId, showConfirm, onChange, onJobClosed, isWindowUp,
// jobNumber, staff, onPosted, reloadStaff }.
//
// onChange(jobId, latestNote) fires whenever the comment thread gains or loses a
// comment, handing over the job's newest remaining comment (or null when the last one
// is gone), so a list showing that comment can patch the one row instead of re-fetching
// every job. The newest comment comes straight from the server's reply to the post or
// delete, so nothing is re-read for it; it names its job and still fires if the window
// has closed meanwhile. The thread itself is re-read only while the window is still up.
//
// onJobClosed (optional) fires instead of the ordinary failure toast when a post
// or delete is refused because the job was archived from another PC
// while this screen still had it open (JobCardModal.jsx) — it shows the shared
// sentence and reloads the job so the screen catches up.
//
// isWindowUp says whether the job window is still open. Failing to load the thread is
// told only while it is (nobody is reading it after close); a comment the person posted
// or deleted that failed is always told, because it was their own write.
//
// jobNumber names the job in those failure messages, since one can arrive after the
// window has closed and another job is on screen.
//
// staff is everyone who could be mentioned (the job window's active staff list). Who a
// comment mentions is worked out from the finished text at send time, so a name typed by
// hand counts just like one picked from the @ list.
//
// onPosted(jobId) fires after a comment is saved (never after a delete), even if the
// window has closed meanwhile: posting answers every question that was waiting on this
// person for this job, so the "Questions for you" row can go at once.
//
// reloadStaff() re-reads the staff list and resolves to the fresh one (null on failure).
// An @word that names nobody in the cached list is first checked against a fresh list (once
// per word for this window); if it still names nobody, the writer is asked before it is
// sent, since nobody would be asked. So is a name two people share when no one was picked.
//
// Chat-style: once the checks pass, the sent text leaves the box at once and comes back
// (in front of anything typed meanwhile) only if the save fails.
// A send or delete moves through ONE stage: 'idle' -> 'checking' -> 'sending' -> 'idle' for a
// post, 'idle' -> 'deleting' -> 'idle' for a delete. Everything below is read from it:
// `checking` (stage 'checking') is true while the checks run, when the box is read-only so
// the text checked is the text sent. The checks are cancellable: after every wait in them
// (a fresh staff list, the "send anyway?" question) the send carries on only if the job
// window is still up and the box still holds exactly the checked text; otherwise it stops
// quietly and posts nothing, which is what makes closing the job during the checks really
// lose the unposted comment, as the close question says.
// `sending` (any stage but 'idle') gates Send, Enter and delete; it is let go before the
// thread is re-read. `loading` means only that the thread is being read.
// `posting` (stage 'sending') is true from the moment the sent text leaves the box until the
// save has answered (and, if it failed, the draft is back in the box): the one window where a
// comment exists nowhere on screen, so closing or refreshing must treat it as work still on
// its way.
// `whenPosted()` is a stable function returning a promise that resolves once no post is in
// that window (at once if none). It never rejects, and on a failure it resolves only after
// the draft has been put back, so the box holds the text again by then.
// `willAsk` is the live "who will be asked" line for the draft ('' when it mentions nobody).
export function useJobNotes({ jobcardId, showConfirm, onChange, onJobClosed, isWindowUp, jobNumber, staff = NO_STAFF, onPosted, reloadStaff }) {
  const [notes, setNotes] = useState([]);
  const { user } = useAuth();
  const [newNote, setNewNoteRaw] = useState('');
  // What the box holds right now, for putting a draft back after a failed send.
  const newNoteRef = useRef('');
  // The people picked into the current draft with the @ list: [{ userId, name }]. Used
  // only to settle two staff who share one name: the one picked is meant. A pick means
  // nothing once the box is empty, so every route to an empty box (typing, deleting,
  // sending) clears them here, in the one setter the panel uses.
  const [pickedMentions, setPickedMentions] = useState([]);
  const setNewNote = useCallback((value) => {
    newNoteRef.current = value;
    setNewNoteRaw(value);
    if (value.trim() === '') setPickedMentions(prev => (prev.length === 0 ? prev : []));
  }, []);
  // @words already checked against a fresh staff list for this window.
  const checkedWordsRef = useRef(new Set());
  const [loading, setLoading] = useState(false);
  // The one stage of a send or delete: 'idle' | 'checking' | 'sending' | 'deleting'. The ref
  // is the re-entry guard (state is stale inside one tick); the state is what the panel shows.
  const [stage, setStageState] = useState('idle');
  const stageRef = useRef('idle');
  // The promise whenPosted hands out while a post is in the 'sending' stage, and what settles it.
  const postRef = useRef(null);
  const setStage = useCallback((next) => {
    const was = stageRef.current;
    if (was === next) return;
    stageRef.current = next;
    setStageState(next);
    if (next === 'sending') {
      let resolve;
      const promise = new Promise(res => { resolve = res; });
      postRef.current = { promise, resolve };
    } else if (was === 'sending' && postRef.current) {
      const current = postRef.current;
      postRef.current = null;
      current.resolve();
    }
  }, []);
  const checking = stage === 'checking';
  const sending = stage !== 'idle';
  const posting = stage === 'sending';
  const whenPosted = useCallback(() => (postRef.current ? postRef.current.promise : Promise.resolve()), []);
  const [loadError, setLoadError] = useState(false);
  // True once this window's first read of the thread has come back.
  const [notesLoaded, setNotesLoaded] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!jobcardId) return;
    setLoading(true);
    try {
      const result = await api.getJobNotes(jobcardId);
      setNotes(result || []);
      setLoadError(false);
      setNotesLoaded(true);
      return result || [];
    } catch (err) {
      // Surface the failure instead of looking like an empty list. Pressing the
      // bubble re-reads, so a stable id keeps repeat failures from stacking.
      setLoadError(true);
      if (isWindowUp()) toast.error(err.message || 'Couldn\'t load the comments. Try again in a moment.', { id: 'job-notes-load-failed' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [jobcardId, isWindowUp]);

  // A refused comment marks the comment box when the refusal names it.
  const { setFieldErrors, clearAll, errorFor, fieldProps, errorProps } = useFieldErrors(() => newNote);

  const addPickedMention = useCallback((person) => {
    setPickedMentions(prev => (prev.some(p => p.userId === person.userId) ? prev : [...prev, person]));
  }, []);

  // Every name on the staff list, the writer's included, so an @name is read whole even when
  // it is the writer's ("@Sam Jones" never shrinks to "@Sam"), and an @word is "unknown" only
  // if it fits nobody at all. The writer is then left out of who is asked (resolveMentions,
  // the same rule as the @ list): a self-mention is dropped quietly, never asked about, and a
  // name shared with the writer is not unclear.
  const writerId = user?.id ?? null;
  const nameLookup = useMemo(() => buildNameLookup(staff), [staff]);
  const willAsk = useMemo(() => {
    if (!newNote.includes('@')) return '';
    const { people, unclear } = resolveMentions(newNote, nameLookup, pickedMentions, writerId);
    return joinList([
      ...people.map(p => displayNameOf(p)),
      ...unclear.map(n => `${n} (which one?)`)
    ]);
  }, [newNote, nameLookup, pickedMentions, writerId]);

  const addNote = useCallback(async () => {
    if (!newNote.trim() || stageRef.current !== 'idle') return;
    setStage('checking');
    // The text that was checked and is sent; the box is read-only until it is cleared.
    const draft = newNote;
    const picks = pickedMentions;
    // The checks may carry on only while the window is up and the box still holds the draft.
    const stillValid = () => isWindowUp() && newNoteRef.current === draft;
    let cleared = false;
    let sent = false;
    let reread = false;
    try {
      const text = draft.trim();
      let lookup = nameLookup;
      let unmatched = findUnmatchedMentions(text, lookup.names);
      const unchecked = unmatched.filter(w => !checkedWordsRef.current.has(w.toLowerCase()));
      if (unchecked.length > 0 && reloadStaff) {
        // The cached list may be empty or stale; look again before blaming the spelling.
        const fresh = await reloadStaff();
        if (!stillValid()) return;
        if (fresh) {
          lookup = buildNameLookup(fresh);
          unmatched = findUnmatchedMentions(text, lookup.names);
          unchecked.forEach(w => checkedWordsRef.current.add(w.toLowerCase()));
        }
      }
      // Whoever's @name is in the finished text is mentioned, picked from the list or
      // typed by hand. A name several people share goes to the one picked from the list.
      const { people, unclear } = resolveMentions(text, lookup, picks, writerId);
      // Too many people is refused before any question is asked: marks the comment box
      // instead of a pop-up, and nothing is sent.
      if (people.length > MAX_MENTIONS) {
        setFieldErrors({ commentText: TOO_MANY_MENTIONS_MESSAGE }, { commentText: draft });
        return;
      }
      if (unmatched.length > 0 || unclear.length > 0) {
        const sentences = [];
        if (unclear.length > 0) {
          sentences.push(`There is more than one person called ${joinList(unclear.map(n => `“${n}”`), 'or')} — pick the one you mean from the @ list.`);
        }
        if (unmatched.length > 0) {
          sentences.push(`Nobody here is called ${joinList(unmatched.map(w => `“${w}”`), 'or')}, so nobody will be asked.`);
        }
        const send = await showConfirm({
          title: unclear.length === 0 ? 'Nobody by that name' : unmatched.length === 0 ? 'Which person?' : 'Check who you are asking',
          message: `${sentences.join(' ')} ${unclear.length === 0 ? 'Send anyway?' : 'Send without asking them?'}`,
          confirmLabel: unclear.length === 0 ? 'Send anyway' : 'Send without asking them',
          cancelLabel: 'Keep editing'
        });
        if (!send || !stillValid()) return;
      } else if (!stillValid()) {
        return;
      }
      const mentionUserIds = people.map(p => p.id);
      // Checks done: the sent text leaves the box now, as in a chat. It comes back only if
      // the save fails.
      cleared = true;
      setStage('sending');
      setNewNote('');
      const added = await api.addJobNote(jobcardId, text, mentionUserIds);
      sent = true;
      // A successful send ends this draft: a mark left from an earlier refusal must not come
      // back if that refused text is ever typed again.
      clearAll();
      onPosted?.(jobcardId);
      // The new comment is the newest by definition.
      onChange?.(jobcardId, { text: added.text, userName: added.userName, createdAt: added.createdAt });
      reread = true;
    } catch (err) {
      // What the box holds after the failure, so a mark on it is raised against that text.
      let boxText = draft;
      if (cleared && !sent) {
        // Not sent: the draft goes back, in front of anything typed since, with its picks.
        const typed = newNoteRef.current;
        boxText = typed.trim() === '' ? draft : `${draft}\n${typed}`;
        setNewNote(boxText);
        picks.forEach(addPickedMention);
      }
      // Both refusals are told even after the window has gone (the closed-job handler
      // decides for itself whether there is still a window to reload).
      if (isJobClosedError(err)) onJobClosed?.();
      else {
        // A person archived meanwhile is why it was refused; drop them off the @ list.
        if (err.data?.code === MENTION_INACTIVE) reloadStaff?.();
        // A refusal about the comment text marks the comment box (while the window is
        // still up to show it); anything else, or a closed window, is a pop-up that
        // names the job.
        const showToast = (msg) => toastJobWriteFailure({ jobNumber, jobCardId: jobcardId }, msg, 'job-note-add-failed');
        if (isWindowUp()) {
          showSaveRefusal(err, {
            boxFor: { text: 'commentText' },
            setFieldErrors: marks => setFieldErrors(marks, { commentText: boxText }),
            fallback: 'Couldn\'t add the comment. Check the connection and try again.',
            showToast
          });
        } else {
          showToast(err.message || 'Couldn\'t add the comment. Check the connection and try again.');
        }
      }
    } finally {
      // The one place the stage is let go (and whenPosted settled), draft already back on failure.
      setStage('idle');
    }
    // After the save is done and the stage is idle, so the next send is not held up by the read.
    if (reread && isWindowUp()) await loadNotes();
  }, [jobcardId, newNote, setStage, writerId, pickedMentions, nameLookup, reloadStaff, showConfirm, loadNotes, onChange, onPosted, onJobClosed, isWindowUp, jobNumber, setFieldErrors, clearAll, setNewNote, addPickedMention]);

  const deleteNote = useCallback(async (noteId) => {
    const busyToast = () => toast.error('Still sending a comment — try deleting again in a moment.', { id: 'job-note-delete-busy' });
    // Refused before asking anything: no point asking "Delete?" when it cannot be done now.
    if (stageRef.current !== 'idle') {
      busyToast();
      return;
    }
    // Deleting a comment is permanent, so confirm first (naming the author when
    // we can) — a single misclick shouldn't erase someone's note with no warning.
    const note = notes.find(n => n.id === noteId);
    const who = note?.userName ? `${note.userName}'s` : 'this';
    const message = `Delete ${who} comment? This can't be undone.`;
    const confirmed = await showConfirm({
      title: 'Delete comment',
      message,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;
    // A send cannot normally start under the question, but never delete over one.
    if (stageRef.current !== 'idle') {
      busyToast();
      return;
    }

    setStage('deleting');
    let reread = false;
    try {
      const result = await api.deleteJobNote(jobcardId, noteId);
      onChange?.(jobcardId, result?.latestNote ?? null);
      reread = true;
    } catch (err) {
      // Told even after the window has gone, as for adding a comment.
      if (isJobClosedError(err)) onJobClosed?.();
      else toastJobWriteFailure({ jobNumber, jobCardId: jobcardId }, err.message || 'Couldn\'t delete the comment. Check the connection and try again.', 'job-note-delete-failed');
    } finally {
      setStage('idle');
    }
    if (reread && isWindowUp()) await loadNotes();
  }, [jobcardId, loadNotes, setStage, notes, showConfirm, onChange, onJobClosed, isWindowUp, jobNumber]);

  return {
    notes,
    newNote,
    setNewNote,
    addPickedMention,
    checking,
    willAsk,
    commentError: errorFor('commentText'),
    commentFieldProps: fieldProps('commentText'),
    commentErrorProps: errorProps('commentText'),
    loading,
    sending,
    posting,
    whenPosted,
    loadError,
    notesLoaded,
    loadNotes,
    addNote,
    deleteNote
  };
}
