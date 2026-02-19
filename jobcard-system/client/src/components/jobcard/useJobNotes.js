import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';

export function useJobNotes(jobcardId) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!jobcardId) return;
    try {
      const result = await api.getJobNotes(jobcardId);
      setNotes(result || []);
    } catch (err) {
      // Silently fail
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
    setLoading(true);
    try {
      await api.deleteJobNote(jobcardId, noteId);
      await loadNotes();
    } catch (err) {
      toast.error(err.message || 'Failed to delete note');
    } finally {
      setLoading(false);
    }
  }, [jobcardId, loadNotes]);

  const resetNotes = useCallback(() => {
    setNotes([]);
    setNewNote('');
  }, []);

  return {
    notes,
    newNote,
    setNewNote,
    loading,
    loadNotes,
    addNote,
    deleteNote,
    resetNotes
  };
}
