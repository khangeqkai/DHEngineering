const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { deleteJobCardFolders } = require('../utils/folderCreation');
const { authenticate, requireManagement, requireAdmin, isManagement } = require('../middleware/auth');
const { validateJobcardListQuery, JOBCARD_STATUSES } = require('../middleware/validation');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  timeEntryQueries,
  getAssigneesForJobcards,
  historyQueries,
  recordHistory
} = require('../db/database');
const { formatJobcard, sanitizeHistoryForRole, computeAttachmentWarnings } = require('./jobcard-helpers');
const jobcardMutationsRoutes = require('./jobcard-mutations');
const jobcardPrintoutRoutes = require('./jobcard-printout');

const router = express.Router();

router.use('/', jobcardMutationsRoutes);
router.use('/', jobcardPrintoutRoutes);

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

// Per-page "missing files" check for the job list. Takes the ids of just the
// rows currently on screen and checks only those, so the cost never grows with
// the total job count. Returns the full set of ids that were checked (so the
// list can tell "checked, clean" apart from "not checked yet") plus the detail
// for the ones that have a declared-but-not-attached gap. Registered before
// '/:id' so the literal path isn't swallowed by it.
router.post('/attachment-warnings', authenticate, (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    // De-dupe and keep only well-formed string ids.
    const ids = [...new Set(rawIds.filter(id => typeof id === 'string' && id))];

    const flagged = [];
    for (const id of ids) {
      const jc = jobcardQueries.getById.get(id);
      // Missing or archived (invoiced) jobs are reported as checked-clean — the
      // list shows no marker on them, matching the previous behaviour.
      if (!jc || jc.archived === 1) continue;

      const items = jobItemQueries.getByJobcard.all(id);
      const w = computeAttachmentWarnings(id, items, jc.qa_level_id);
      if (w.hasAny) {
        flagged.push({ jobcardId: id, items: w.items, missingQaForms: w.missingQaForms });
      }
    }

    res.json({ checked: ids, flagged });
  } catch (err) {
    logger.error({ err }, 'Attachment-warnings check error');
    res.status(500).json({ error: 'Failed to check for missing files' });
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

    const response = formatJobcard(jobcard, items, assignees, req.user.role);
    response.attachmentWarnings = computeAttachmentWarnings(req.params.id, items, jobcard.qa_level_id);
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Get jobcard error');
    res.status(500).json({ error: 'Failed to get job card' });
  }
});

// Get job card history (admin only — the trail carries pricing changes)
router.get('/:id/history', authenticate, requireAdmin, (req, res) => {
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

    if (status === 'INVOICED' && !isManagement(req.user.role)) {
      return res.status(403).json({ error: 'Only management can mark a job card as invoiced' });
    }

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // A filed-away (archived) job is locked: refuse any status change before any
    // write. Re-opening goes through the management-only unarchive action, which
    // un-files the job and resets its status back to OPEN. We key off the
    // filed-away flag alone — invoicing always files a job away, and unarchive
    // clears both the flag and the INVOICED status, so once un-filed the job
    // changes status normally.
    if (existing.archived === 1) {
      return res.status(409).json({
        error: 'This job is invoiced and filed away. A manager must un-file it before its status can change.'
      });
    }

    const isInvoicingTransition = status === 'INVOICED' && existing.status !== 'INVOICED' && existing.archived === 0;

    // Soft close-out checkpoint: when invoicing (which also archives) and files
    // were declared but never attached, stop and report the gaps instead of
    // writing — unless the caller has already confirmed "invoice anyway".
    if (isInvoicingTransition && req.body.confirmMissingAttachments !== true) {
      const items = jobItemQueries.getByJobcard.all(id);
      const warnings = computeAttachmentWarnings(id, items, existing.qa_level_id);
      if (warnings.hasAny) {
        return res.status(409).json({ error: 'MISSING_ATTACHMENTS', attachmentWarnings: warnings });
      }
    }

    const changes = { status: { from: existing.status, to: status } };

    jobcardQueries.updateStatus.run(status, req.user.userId, id);

    if (isInvoicingTransition) {
      const invoicedDate = new Date().toISOString();
      jobcardQueries.archive.run(invoicedDate, req.user.userId, id);
      changes.archived = { from: false, to: true };
      changes.invoicedDate = { from: null, to: invoicedDate };
      // Invoicing just files the job away — no costing snapshot needed. The job owns its
      // own overtime rules and rate, so its costing always recomputes to the billed
      // number; a later settings change can't move it.
    }

    recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, changes, null);

    const updated = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const response = formatJobcard(updated, items, [], req.user.role);
    response.attachmentWarnings = computeAttachmentWarnings(id, items, updated.qa_level_id);
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Update status error');
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Unarchive job card
router.post('/:id/unarchive', authenticate, requireManagement, (req, res) => {
  try {
    const { id } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    if (existing.archived !== 1) {
      return res.status(400).json({ error: 'Job card is not archived' });
    }

    // Un-filing also resets the status back to OPEN so the job returns as a
    // normal working job, never a back-in-the-list-but-still-INVOICED limbo.
    jobcardQueries.unarchive.run(req.user.userId, id);
    recordHistory('jobcard', id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
      archived: { from: true, to: false },
      invoicedDate: { from: existing.invoiced_date, to: null },
      status: { from: existing.status, to: 'OPEN' }
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

    // Soft delete checkpoint: deleting a job is permanent and its number is never
    // reused, so we never delete on the first request — we bounce back a 409 asking
    // the admin to confirm. When the job has recorded work (anyone clocked in right
    // now, or any logged time — both cascade away on delete) we attach who/what so
    // the confirm can spell out what's being erased; otherwise workWarning is null
    // and the client shows a plain "are you sure". Resending with confirmDelete:true
    // bypasses this single gate. Mirrors the missing-attachments checkpoint.
    if (req.body.confirmDelete !== true) {
      const entries = timeEntryQueries.getByJobcard.all(id);
      let workWarning = null;
      if (entries.length > 0) {
        const activeWorkers = [...new Set(
          entries.filter(e => !e.end_time).map(e => e.user_name).filter(Boolean)
        )];
        const pastWorkers = [...new Set(
          entries.filter(e => e.end_time).map(e => e.user_name).filter(Boolean)
        )];
        const hrs = timeEntryQueries.getHoursByJobcard.get(id);
        const loggedHours = Math.round((hrs?.labour_hours || 0) * 10) / 10;
        workWarning = {
          hasActive: activeWorkers.length > 0,
          activeWorkers,
          loggedHours,
          pastWorkers
        };
      }
      return res.status(409).json({ error: 'CONFIRM_DELETE', workWarning });
    }

    // Record deletion with snapshot
    recordHistory('jobcard', id, 'delete', req.user.userId, req.user.name || req.user.username, {
      jobNumber: { from: existing.job_number, to: null },
      status: { from: existing.status, to: null }
    });

    jobcardQueries.delete.run(id);

    // Delete job card folder (Company/JobNumber/) but keep the company folder
    deleteJobCardFolders(existing.contact_id || null, existing.company_name, existing.job_number);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete jobcard error');
    res.status(500).json({ error: 'Failed to delete job card' });
  }
});

module.exports = router;
