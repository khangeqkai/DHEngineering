const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { deleteJobCardFolders } = require('../utils/folderCreation');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateJobcardListQuery, JOBCARD_STATUSES } = require('../middleware/validation');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  getAssigneesForJobcards,
  historyQueries,
  recordHistory
} = require('../db/database');
const { formatJobcard, sanitizeHistoryForRole } = require('./jobcard-helpers');
const jobcardMutationsRoutes = require('./jobcard-mutations');

const router = express.Router();

router.use('/', jobcardMutationsRoutes);

// Get all job cards
router.get('/', authenticate, validateJobcardListQuery, (req, res) => {
  try {
    const { status, contactId, archived, assigneeId } = req.query;

    let jobcards;
    if (archived === 'true') {
      jobcards = jobcardQueries.getArchived.all();
    } else if (assigneeId === 'UNASSIGNED') {
      jobcards = status
        ? jobcardQueries.getUnassignedByStatus.all(status)
        : jobcardQueries.getUnassigned.all();
    } else if (assigneeId) {
      jobcards = status
        ? jobcardQueries.getByAssigneeAndStatus.all(assigneeId, status)
        : jobcardQueries.getByAssignee.all(assigneeId);
    } else if (status) {
      jobcards = jobcardQueries.getByStatus.all(status);
    } else if (contactId) {
      jobcards = jobcardQueries.getByContact.all(contactId);
    } else {
      jobcards = jobcardQueries.getAll.all();
    }

    const assigneeMap = getAssigneesForJobcards(jobcards.map(jc => jc.id));

    res.json(jobcards.map(jc => formatJobcard(jc, [], assigneeMap[jc.id] || [], req.user.role)));
  } catch (err) {
    logger.error({ err }, 'Get jobcards error');
    res.status(500).json({ error: 'Failed to get job cards' });
  }
});

// Get overdue job cards
router.get('/overdue', authenticate, (req, res) => {
  try {
    const jobcards = jobcardQueries.getOverdue.all();
    res.json(jobcards.map(jc => formatJobcard(jc, [], [], req.user.role)));
  } catch (err) {
    logger.error({ err }, 'Get overdue jobcards error');
    res.status(500).json({ error: 'Failed to get overdue job cards' });
  }
});

// Get single job card with all related data
router.get('/:id', authenticate, (req, res) => {
  try {
    const jobcard = jobcardQueries.getById.get(req.params.id);
    if (!jobcard) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const items = jobItemQueries.getByJobcard.all(req.params.id);
    const assignees = jobAssigneeQueries.getByJobcard.all(req.params.id);

    res.json(formatJobcard(jobcard, items, assignees, req.user.role));
  } catch (err) {
    logger.error({ err }, 'Get jobcard error');
    res.status(500).json({ error: 'Failed to get job card' });
  }
});

// Get job card history
router.get('/:id/history', authenticate, (req, res) => {
  try {
    const history = historyQueries.getByEntity.all('jobcard', req.params.id);

    res.json(history.map(h => sanitizeHistoryForRole({
      id: h.id,
      action: h.action,
      userId: h.user_id,
      userName: h.user_name,
      changes: h.changes ? JSON.parse(h.changes) : null,
      snapshot: h.snapshot ? JSON.parse(h.snapshot) : null,
      createdAt: h.created_at
    }, req.user.role)));
  } catch (err) {
    logger.error({ err }, 'Get jobcard history error');
    res.status(500).json({ error: 'Failed to get job card history' });
  }
});

// Self-assign current user to a job card (idempotent)
router.post('/:id/assignees/self', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const before = jobAssigneeQueries.getByJobcard.all(id);
    const alreadyAssigned = before.some(a => a.user_id === userId);

    if (alreadyAssigned) {
      return res.status(200).json({
        assignees: before.map(a => ({ id: a.id, userId: a.user_id, userName: a.user_name, username: a.username }))
      });
    }

    const assigneeId = `assignee:${uuidv4()}`;
    let inserted = true;
    try {
      jobAssigneeQueries.create.run(assigneeId, id, userId);
    } catch (e) {
      if (e && e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        inserted = false;
      } else {
        throw e;
      }
    }

    const after = jobAssigneeQueries.getByJobcard.all(id);

    if (!inserted) {
      return res.status(200).json({
        assignees: after.map(a => ({ id: a.id, userId: a.user_id, userName: a.user_name, username: a.username }))
      });
    }

    const fromNames = before.map(a => a.user_name).join(', ') || 'none';
    const toNames = after.map(a => a.user_name).join(', ') || 'none';

    recordHistory('jobcard', id, 'self_assign', userId, req.user.name || req.user.username, {
      assignees: { from: fromNames, to: toNames }
    });

    res.status(201).json({
      assignees: after.map(a => ({ id: a.id, userId: a.user_id, userName: a.user_name, username: a.username }))
    });
  } catch (err) {
    logger.error({ err }, 'Self-assign error');
    res.status(500).json({ error: 'Failed to self-assign' });
  }
});

// Self-unassign current user from a job card (idempotent)
router.delete('/:id/assignees/self', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const before = jobAssigneeQueries.getByJobcard.all(id);
    const wasAssigned = before.some(a => a.user_id === userId);

    if (!wasAssigned) {
      return res.status(200).json({
        assignees: before.map(a => ({ id: a.id, userId: a.user_id, userName: a.user_name, username: a.username }))
      });
    }

    jobAssigneeQueries.deleteByJobcardAndUser.run(id, userId);

    const after = jobAssigneeQueries.getByJobcard.all(id);
    const fromNames = before.map(a => a.user_name).join(', ') || 'none';
    const toNames = after.map(a => a.user_name).join(', ') || 'none';

    recordHistory('jobcard', id, 'self_unassign', userId, req.user.name || req.user.username, {
      assignees: { from: fromNames, to: toNames }
    });

    res.status(200).json({
      assignees: after.map(a => ({ id: a.id, userId: a.user_id, userName: a.user_name, username: a.username }))
    });
  } catch (err) {
    logger.error({ err }, 'Self-unassign error');
    res.status(500).json({ error: 'Failed to self-unassign' });
  }
});

// Update job card status only
router.patch('/:id/status', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !JOBCARD_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    if (status === 'INVOICED' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can mark a job card as invoiced' });
    }

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const changes = { status: { from: existing.status, to: status } };

    jobcardQueries.updateStatus.run(status, req.user.userId, id);

    if (status === 'INVOICED' && existing.status !== 'INVOICED' && existing.archived === 0) {
      const invoicedDate = new Date().toISOString();
      jobcardQueries.archive.run(invoicedDate, req.user.userId, id);
      changes.archived = { from: false, to: true };
      changes.invoicedDate = { from: null, to: invoicedDate };
    }

    recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, changes, null);

    const updated = jobcardQueries.getById.get(id);
    res.json(formatJobcard(updated, [], [], req.user.role));
  } catch (err) {
    logger.error({ err }, 'Update status error');
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Unarchive job card
router.post('/:id/unarchive', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    if (existing.archived !== 1) {
      return res.status(400).json({ error: 'Job card is not archived' });
    }

    jobcardQueries.unarchive.run(req.user.userId, id);
    recordHistory('jobcard', id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
      archived: { from: true, to: false },
      invoicedDate: { from: existing.invoiced_date, to: null }
    }, { jobNumber: existing.job_number });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Unarchive error');
    res.status(500).json({ error: 'Failed to unarchive job card' });
  }
});

// Delete job card
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Record deletion with snapshot
    recordHistory('jobcard', id, 'delete', req.user.userId, req.user.name || req.user.username, {
      jobNumber: { from: existing.job_number, to: null },
      status: { from: existing.status, to: null }
    });

    jobcardQueries.delete.run(id);

    // Delete job card folder (Company/JobNumber/) but keep the company folder
    deleteJobCardFolders(existing.company_name, existing.job_number);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete jobcard error');
    res.status(500).json({ error: 'Failed to delete job card' });
  }
});

module.exports = router;
