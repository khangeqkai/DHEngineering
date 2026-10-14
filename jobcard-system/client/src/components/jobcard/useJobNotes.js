import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { isJobClosedError } from '../../utils/jobLock';
import { toastJobWriteFailure } from './jobWriteFailure';

// onChange(jobId, latestNote) fires whenever the comment thread gains or loses a
// comment, handing over the job's newest remaining comment (or null when the last one
// is gone), so a list showing that comment can patch the one row instead of re-fetching
// every job. The newest comment comes straight from the server's reply to the post or
// delete, so nothing is re-read for it; it names its job and still fires if the window
// has closed meanwhile. The thread itself is re-read only while the window is still up.
//
// onJobClosed (optional) fires instead of the ordinary failure toast when a post
// or delete is refused because the job was invoiced and archived from another PC
// while this screen still had it open (JobCardModal.jsx) — it shows the shared
// sentence and reloads the job so the screen catches up.
//
// isWindowUp says whether the job window is still open. Failing to load the thread is
// told only while it is (nobody is reading it after close); a comment the person posted
// or deleted that failed is always told, because it was their own write.
//
// jobNumber names the job in those failure messages, since one can arrive after the
// window has closed and another job is on screen.
export function useJobNotes(jobcardId, showConfirm, onChange, onJobClosed, isWindowUp, jobNumber) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
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
      if (isWindowUp()) toast.error(err.message || 'Failed to load comments', { id: 'job-notes-load-failed' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [jobcardId, isWindowUp]);

  const addNote = useCallback(async () => {
    if (!newNote.trim()) return;
    setLoading(true);
    try {
      const added = await api.addJobNote(jobcardId, newNote.trim());
      setNewNote('');
      // The new comment is the newest by definition.
      onChange?.(jobcardId, { text: added.text, userName: added.userName, createdAt: added.createdAt });
      if (isWindowUp()) await loadNotes();
    } catch (err) {
      // Both refusals are told even after the window has gone (the closed-job handler
      // decides for itself whether there is still a window to reload).
      if (isJobClosedError(err)) onJobClosed?.();
      else toastJobWriteFailure({ jobNumber, jobCardId: jobcardId }, err.message || 'Failed to add note', 'job-note-add-failed');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, newNote, loadNotes, onChange, onJobClosed, isWindowUp, jobNumber]);

  const deleteNote = useCallback(async (noteId) => {
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

    setLoading(true);
    try {
      const result = await api.deleteJobNote(jobcardId, noteId);
      onChange?.(jobcardId, result?.latestNote ?? null);
      if (isWindowUp()) await loadNotes();
    } catch (err) {
      // Told even after the window has gone, as for adding a comment.
      if (isJobClosedError(err)) onJobClosed?.();
      else toastJobWriteFailure({ jobNumber, jobCardId: jobcardId }, err.message || 'Failed to delete note', 'job-note-delete-failed');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, loadNotes, notes, showConfirm, onChange, onJobClosed, isWindowUp, jobNumber]);

  return {
    notes,
    newNote,
    setNewNote,
    loading,
    loadError,
    notesLoaded,
    loadNotes,
    addNote,
    deleteNote
  };
}
