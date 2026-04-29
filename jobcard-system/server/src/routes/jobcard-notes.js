const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requiredString, handleValidationErrors } = require('../middleware/validation');
const { jobNoteQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Get notes for a job card
router.get('/:id/notes', authenticate, (req, res) => {
  try {
    const notes = jobNoteQueries.getByJobcard.all(req.params.id);
    res.json(notes.map(n => ({
      id: n.id,
      jobcardId: n.jobcard_id,
      userId: n.user_id,
      userName: n.user_name,
      text: n.text,
      createdAt: n.created_at
    })));
  } catch (err) {
    logger.error({ err }, 'Get job notes error');
    res.status(500).json({ error: 'Failed to get notes' });
  }
});

// Add a note
router.post('/:id/notes', authenticate, [
  requiredString('text', 'Note text'),
  handleValidationErrors
], (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const noteId = `note:${uuidv4()}`;

    jobNoteQueries.create.run(
      noteId,
      id,
      req.user.userId,
      req.user.name || req.user.username,
      text.trim()
    );

    recordHistory('jobcard', id, 'add_note', req.user.userId, req.user.name || req.user.username, {
      note: { from: null, to: text.trim() }
    }, null);

    const note = jobNoteQueries.getById.get(noteId);
    res.status(201).json({
      id: note.id,
      jobcardId: note.jobcard_id,
      userId: note.user_id,
      userName: note.user_name,
      text: note.text,
      createdAt: note.created_at
    });
  } catch (err) {
    logger.error({ err }, 'Add job note error');
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Delete a note (admin only)
router.delete('/:id/notes/:noteId', authenticate, requireAdmin, (req, res) => {
  try {
    const { id, noteId } = req.params;

    const existing = jobNoteQueries.getById.get(noteId);
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }

    recordHistory('jobcard', id, 'delete_note', req.user.userId, req.user.name || req.user.username, {
      note: { from: existing.text, to: null },
      'note author': { from: existing.user_name, to: null }
    }, null);

    jobNoteQueries.delete.run(noteId);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete job note error');
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
