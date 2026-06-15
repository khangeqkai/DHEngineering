import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export function useJobNotes(jobcardId, showConfirm) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!jobcardId) return;
    setLoading(true);
    try {
      const result = await api.getJobNotes(jobcardId);
      setNotes(result || []);
      setLoadError(false);
    } catch (err) {
      // Surface the failure instead of looking like an empty list
      setLoadError(true);
      toast.error(err.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [jobcardId]);

  const addNote = useCallback(async () => {
    if (!newNote.trim()) return;
    setLoading(true);
    try {
      await api.addJobNote(jobcardId, newNote.trim());
      setNewNote('');
      await loadNotes();
    } catch (err) {
      toast.error(err.message || 'Failed to add note');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, newNote, loadNotes]);

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
      await api.deleteJobNote(jobcardId, noteId);
      await loadNotes();
    } catch (err) {
      toast.error(err.message || 'Failed to delete note');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, loadNotes, notes, showConfirm]);

  const resetNotes = useCallback(() => {
    setNotes([]);
    setNewNote('');
    setLoadError(false);
  }, []);

  return {
    notes,
    newNote,
    setNewNote,
    loading,
    loadError,
    loadNotes,
    addNote,
    deleteNote,
    resetNotes
  };
}
