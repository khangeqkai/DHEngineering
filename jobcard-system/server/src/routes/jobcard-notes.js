const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { body } = require('express-validator');
const { requiredString, handleValidationErrors } = require('../middleware/validation');
const { db, jobcardQueries, jobNoteQueries, recordHistory, actorName } = require('../db/database');
const { findOr404 } = require('../utils/findOr404');

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

    // A job deleted from another PC while this one still had it open.
    if (!findOr404(res, jobcardQueries.getById.get(id), 'Job card not found')) return;

    const noteId = `note:${uuidv4()}`;

    db.transaction(() => {
      jobNoteQueries.create.run(
        noteId,
        id,
        req.user.userId,
        actorName(req),
        text.trim()
      );

      recordHistory('jobcard', id, 'add_note', req.user.userId, actorName(req), {
        note: { from: null, to: text.trim() }
      }, null);
    })();

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

// Mark a job's comments as read up to a moment (the person's own read mark).
// Deliberately NOT recorded in the activity trail: reading is not an edit of the job and
// every time the comments window opened would add an entry. Clamped to the newest comment
// actually on the job and only ever moves forward, so a stale or invented value is harmless.
router.put('/:id/notes/read', authenticate, [
  body('seenUpTo').isString().matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
    .withMessage('seenUpTo must be a UTC ISO timestamp'),
  handleValidationErrors
], (req, res) => {
  try {
    const { id } = req.params;
    if (!findOr404(res, jobcardQueries.getById.get(id), 'Job card not found')) return;

    const params = { userId: req.user.userId, jobcardId: id };
    const newest = jobNoteQueries.newestCreatedAt.get(id).newest;
    if (newest) {
      const seenUpTo = req.body.seenUpTo < newest ? req.body.seenUpTo : newest;
      jobNoteQueries.markRead.run({ ...params, seenUpTo });
    }
    res.json({ commentsSeenUpTo: jobNoteQueries.getSeenUpTo.get(params).seen_up_to });
  } catch (err) {
    logger.error({ err }, 'Mark job notes read error');
    res.status(500).json({ error: 'Failed to mark comments as read' });
  }
});

// Delete a note (admin or manager)
router.delete('/:id/notes/:noteId', authenticate, requireManagement, (req, res) => {
  try {
    const { id, noteId } = req.params;

    const existing = findOr404(res, jobNoteQueries.getById.get(noteId), 'Note not found');
    if (!existing) return;

    if (existing.jobcard_id !== id) {
      return res.status(403).json({ error: 'Note does not belong to this job card' });
    }

    db.transaction(() => {
      recordHistory('jobcard', id, 'delete_note', req.user.userId, actorName(req), {
        note: { from: existing.text, to: null },
        'note author': { from: existing.user_name, to: null }
      }, null);

      jobNoteQueries.delete.run(noteId);
    })();

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete job note error');
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
