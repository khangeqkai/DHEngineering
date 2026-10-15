const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { requiredString, handleValidationErrors, validateMarkNotesRead, validateMentionUserIds, MENTION_IDS_GARBLED } = require('../middleware/validation');
const { db, jobcardQueries, jobNoteQueries, jobNoteMentionQueries, userQueries, getLatestNotesForJobcards, getUnreadNoteCountsForJobcards, recordHistory, actorName } = require('../db/database');
const { findOr404 } = require('../utils/findOr404');
const { isActiveRecord } = require('../shared/records');
const { MENTION_INACTIVE } = require('../shared/mentions');

const router = express.Router();

// The caller's own open @mentions, one row per job (oldest waiting first), on jobs that are
// not invoiced/archived. Defined before any '/:id' route so 'open-mentions' is never read as
// a job id; a GET is never stopped by closedJobGuard.
router.get('/open-mentions', authenticate, (req, res) => {
  try {
    const rows = jobNoteMentionQueries.openForUserByJob.all({ userId: req.user.userId });
    res.json(rows.map(r => ({
      jobcardId: r.jobcard_id,
      jobNumber: r.job_number,
      description: r.description,
      count: r.count,
      firstNoteId: r.first_note_id,
      oldestAt: r.oldest_at,
      firstText: r.first_text,
      firstByName: r.first_by_name
    })));
  } catch (err) {
    logger.error({ err }, 'Get open mentions error');
    res.status(500).json({ error: 'Failed to get mentions' });
  }
});

// Get notes for a job card
router.get('/:id/notes', authenticate, (req, res) => {
  try {
    const notes = jobNoteQueries.getByJobcard.all(req.params.id);
    // One extra read for the whole job, grouped here by comment.
    const mentionsByNote = {};
    for (const m of jobNoteMentionQueries.forJobcard.all(req.params.id)) {
      (mentionsByNote[m.note_id] ||= []).push({ userId: m.user_id, name: m.mentioned_name });
    }
    res.json(notes.map(n => ({
      mentions: mentionsByNote[n.id] || [],
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
  validateMentionUserIds,
  handleValidationErrors
], (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    // A job deleted from another PC while this one still had it open.
    if (!findOr404(res, jobcardQueries.getById.get(id), 'Job card not found')) return;

    // Who is being mentioned: no repeats, never the writer (mentioning yourself is ignored
    // without a word), and each must be an existing active person. An id that names nobody
    // is a garbled request, not an archived person, and is refused as such.
    const mentioned = [];
    const wanted = [...new Set(req.body.mentionUserIds || [])].filter(uid => uid !== req.user.userId);
    for (const uid of wanted) {
      const person = userQueries.getById.get(uid);
      if (!person) {
        return res.status(400).json({ error: MENTION_IDS_GARBLED, fields: [{ field: 'text', message: MENTION_IDS_GARBLED }] });
      }
      if (!isActiveRecord(person)) {
        const message = `${person.name || person.username} can no longer be mentioned — their account is archived.`;
        return res.status(400).json({ error: message, code: MENTION_INACTIVE, fields: [{ field: 'text', message }] });
      }
      mentioned.push({ userId: person.id, name: person.name || person.username });
    }

    const noteId = `note:${uuidv4()}`;

    const note = db.transaction(() => {
      jobNoteQueries.create.run(
        noteId,
        id,
        req.user.userId,
        actorName(req),
        text.trim()
      );
      const saved = jobNoteQueries.getById.get(noteId);
      const createdAt = saved.created_at;

      // Writing here answers every mention of the writer that was still open on this job.
      jobNoteMentionQueries.answerOpenForUserOnJob.run(createdAt, id, req.user.userId);
      for (const m of mentioned) {
        jobNoteMentionQueries.create.run(`mention:${uuidv4()}`, noteId, id, m.userId, m.name, createdAt);
      }

      const changes = { note: { from: null, to: text.trim() } };
      if (mentioned.length > 0) changes.mentioned = { from: null, to: mentioned.map(m => m.name).join(', ') };
      recordHistory('jobcard', id, 'add_note', req.user.userId, actorName(req), changes, null);
      return saved;
    })();

    res.status(201).json({
      id: note.id,
      jobcardId: note.jobcard_id,
      userId: note.user_id,
      userName: note.user_name,
      text: note.text,
      createdAt: note.created_at,
      mentions: mentioned
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
router.put('/:id/notes/read', authenticate, validateMarkNotesRead, (req, res) => {
  try {
    const { id } = req.params;
    if (!findOr404(res, jobcardQueries.getById.get(id), 'Job card not found')) return;

    const params = { userId: req.user.userId, jobcardId: id };
    // The newest comment's moment, from the same pick the job list and the thread use.
    const newest = getLatestNotesForJobcards([id])[id]?.created_at;
    if (newest) {
      const seenUpTo = req.body.seenUpTo < newest ? req.body.seenUpTo : newest;
      jobNoteQueries.markRead.run({ ...params, seenUpTo });
    }
    // The list row's unread count comes from the same counting as the list itself, so
    // the row never shows a number the list wouldn't.
    res.json({
      commentsSeenUpTo: jobNoteQueries.getSeenUpTo.get(params).seen_up_to,
      unreadNotes: getUnreadNoteCountsForJobcards([id], req.user.userId)[id] || 0
    });
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

    // The job's newest remaining comment, so the job list can patch its row without
    // re-reading the whole thread.
    const latest = getLatestNotesForJobcards([id])[id];
    res.json({
      success: true,
      latestNote: latest ? { text: latest.text, userName: latest.user_name, createdAt: latest.created_at } : null
    });
  } catch (err) {
    logger.error({ err }, 'Delete job note error');
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
