const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { createJobCardFolders, deleteJobCardFolders } = require('../utils/folderCreation');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateJobcardListQuery, validateJobcardEnums, validateItemTreatments, validateItemMaterials, JOBCARD_STATUSES } = require('../middleware/validation');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  getAssigneesForJobcards,
  subcontractQueries,
  qaFormQueries,
  qaLevelQueries,
  historyQueries,
  userQueries,
  recordHistory
} = require('../db/database');
const { formatJobcard, buildChanges, createRelatedRecords, initQaForms, initQaFormsFromLevel } = require('./jobcard-helpers');
const { generateAndIncrementJobNumber } = require('../db/helpers');

const router = express.Router();

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

    res.json(jobcards.map(jc => formatJobcard(jc, [], assigneeMap[jc.id] || [], [], req.user.role)));
  } catch (err) {
    logger.error({ err }, 'Get jobcards error');
    res.status(500).json({ error: 'Failed to get job cards' });
  }
});

// Get overdue job cards
router.get('/overdue', authenticate, (req, res) => {
  try {
    const jobcards = jobcardQueries.getOverdue.all();
    res.json(jobcards.map(jc => formatJobcard(jc, [], [], [], req.user.role)));
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
    const subcontracts = subcontractQueries.getByJobcard.all(req.params.id);

    res.json(formatJobcard(jobcard, items, assignees, subcontracts, req.user.role));
  } catch (err) {
    logger.error({ err }, 'Get jobcard error');
    res.status(500).json({ error: 'Failed to get job card' });
  }
});

// Get job card history
router.get('/:id/history', authenticate, (req, res) => {
  try {
    const history = historyQueries.getByEntity.all('jobcard', req.params.id);

    res.json(history.map(h => ({
      id: h.id,
      action: h.action,
      userId: h.user_id,
      userName: h.user_name,
      changes: h.changes ? JSON.parse(h.changes) : null,
      snapshot: h.snapshot ? JSON.parse(h.snapshot) : null,
      createdAt: h.created_at
    })));
  } catch (err) {
    logger.error({ err }, 'Get jobcard history error');
    res.status(500).json({ error: 'Failed to get job card history' });
  }
});

// Create job card
router.post('/', authenticate, requireAdmin, ...validateJobcardEnums, async (req, res) => {
  try {
    const data = req.body;

    // Non-admin users cannot set contact fields
    if (req.user.role !== 'admin') {
      delete data.contactId;
      delete data.contactName;
      delete data.companyName;
      delete data.contactPhone;
      delete data.contactEmail;
    }

    // Validate required fields before consuming a job number
    if (!data.customerProperty || data.customerProperty === 'NONE') {
      return res.status(400).json({ error: 'Customer Property is required' });
    }
    if (!data.drawingsType || data.drawingsType === 'NONE') {
      return res.status(400).json({ error: 'Drawings type is required' });
    }

    const treatmentError = validateItemTreatments(data.items);
    if (treatmentError) {
      return res.status(400).json({ error: treatmentError });
    }

    const materialError = validateItemMaterials(data.items);
    if (materialError) {
      return res.status(400).json({ error: materialError });
    }

    // Atomically generate job number and increment counter
    const { jobNumber, error: jobNumError } = generateAndIncrementJobNumber();
    if (jobNumError) {
      return res.status(400).json({ error: jobNumError });
    }

    // Check for duplicate (safety check against manual DB edits)
    const existing = jobcardQueries.getByJobNumber.get(jobNumber);
    if (existing) {
      return res.status(409).json({ error: `Job number ${jobNumber} already exists. Please update the starting number in Settings.` });
    }

    const id = `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;
    const status = data.status || 'OPEN';

    // Resolve QA level: prefer qaLevelId, fall back to qualityLevel name match
    let qaLevelId = data.qaLevelId || null;
    let qualityLevelName = data.qualityLevel || null;

    if (qaLevelId) {
      const level = qaLevelQueries.getById.get(qaLevelId);
      if (!level) {
        return res.status(400).json({ error: 'Invalid QA level selected' });
      }
      qualityLevelName = level.name.toUpperCase();
    } else if (qualityLevelName) {
      // Legacy: match by name
      const level = qaLevelQueries.getByNameLower.get(qualityLevelName.toLowerCase());
      if (level) {
        qaLevelId = level.id;
      }
    }

    jobcardQueries.create.run(
      id,
      jobNumber,
      'JOB_CARD',
      status,
      data.contactId || null,
      data.contactName || null,
      data.companyName || null,
      data.contactPhone || null,
      data.contactEmail || null,
      qualityLevelName,
      data.jobType || null,
      data.priority || 'NONE',
      data.poNumber || null,
      data.quoteReference || null,
      data.drawingsType || null,
      data.customerProperty || null,
      data.description || null,
      data.dueDate || null,
      data.isRepeatJob ? 1 : 0,
      data.repeatJobReference || null,
      data.notes || null,
      data.photos ? JSON.stringify(data.photos) : null,
      req.user.userId,
      req.user.userId,
      qaLevelId
    );

    createRelatedRecords(id, data);

    // Initialize QA forms from level templates
    if (qaLevelId) {
      // Fetch items from DB (already created by createRelatedRecords above)
      const createdItems = jobItemQueries.getByJobcard.all(id);
      // Aggregate treatments from all items for PDF fill
      const allTreatments = [...new Set(createdItems.flatMap(i => (i.treatment || '').split(',').filter(v => v && v !== 'NONE')))];
      const allTreatmentOther = createdItems.map(i => i.treatment_other).filter(Boolean).join(', ');
      await initQaFormsFromLevel(id, qaLevelId, {
        jobNumber: jobNumber,
        status: status,
        companyName: data.companyName || null,
        contactName: data.contactName || null,
        description: data.description || null,
        jobType: data.jobType || null,
        priority: data.priority || 'NONE',
        dueDate: data.dueDate || null,
        qualityLevel: qualityLevelName,
        poNumber: data.poNumber || null,
        quoteReference: data.quoteReference || null,
        drawingsType: data.drawingsType || null,
        customerProperty: data.customerProperty || null,
        treatmentRequired: allTreatments.join(',') || null,
        treatmentOther: allTreatmentOther || null,
        repeatJob: data.isRepeatJob ? 'Yes' : 'No',
        repeatJobReference: data.repeatJobReference || null,
        notes: data.notes || null,
        items: createdItems.map(i => ({ itemNumber: i.item_number, qty: i.qty, description: i.description, material: i.material, treatment: i.treatment, treatmentOther: i.treatment_other }))
      });
    }

    const jobcard = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const assignees = jobAssigneeQueries.getByJobcard.all(id);
    const subcontracts = subcontractQueries.getByJobcard.all(id);

    // Create job card folders on disk (fire-and-forget)
    const folderCompany = jobcard.company_name || data.companyName;
    if (folderCompany) {
      createJobCardFolders(folderCompany, jobNumber);
    }

    recordHistory('jobcard', id, 'create', req.user.userId, req.user.name || req.user.username, {
      jobNumber: { from: null, to: jobNumber },
      status: { from: null, to: status },
      jobType: { from: null, to: data.jobType || null },
      priority: { from: null, to: data.priority || 'NONE' },
      qualityLevel: { from: null, to: qualityLevelName || null }
    });

    res.status(201).json(formatJobcard(jobcard, items, assignees, subcontracts, req.user.role));
  } catch (err) {
    logger.error({ err }, 'Create jobcard error');
    res.status(500).json({ error: 'Failed to create job card' });
  }
});

// Update job card
router.put('/:id', authenticate, ...validateJobcardEnums, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    // Non-admin users can only update photos (for Photos tab)
    if (req.user.role !== 'admin') {
      const allowedFields = ['photos'];
      const submittedFields = Object.keys(data).filter(k => data[k] !== undefined);
      const disallowed = submittedFields.filter(f => !allowedFields.includes(f));
      if (disallowed.length > 0) {
        return res.status(403).json({ error: 'Employees can only update photos' });
      }
    }

    // Non-admin users cannot set contact fields
    if (req.user.role !== 'admin') {
      delete data.contactId;
      delete data.contactName;
      delete data.companyName;
      delete data.contactPhone;
      delete data.contactEmail;
    }

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Non-admin users cannot change status
    if (data.status !== undefined && data.status !== existing.status && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can change job card status' });
    }

    if (data.items !== undefined) {
      const treatmentError = validateItemTreatments(data.items);
      if (treatmentError) {
        return res.status(400).json({ error: treatmentError });
      }
      const materialError = validateItemMaterials(data.items);
      if (materialError) {
        return res.status(400).json({ error: materialError });
      }
    }

    const changes = buildChanges(existing, data);

    jobcardQueries.update.run(
      existing.card_type,
      data.status !== undefined ? data.status : existing.status,
      data.contactId !== undefined ? data.contactId : existing.contact_id,
      data.contactName !== undefined ? data.contactName : existing.contact_name,
      data.companyName !== undefined ? data.companyName : existing.company_name,
      data.contactPhone !== undefined ? data.contactPhone : existing.contact_phone,
      data.contactEmail !== undefined ? data.contactEmail : existing.contact_email,
      data.qualityLevel !== undefined ? data.qualityLevel : existing.quality_level,
      data.jobType !== undefined ? data.jobType : existing.job_type,
      data.priority !== undefined ? data.priority : existing.priority,
      data.poNumber !== undefined ? data.poNumber : existing.po_number,
      data.quoteReference !== undefined ? data.quoteReference : existing.quote_reference,
      data.drawingsType !== undefined ? data.drawingsType : existing.drawings_type,
      data.customerProperty !== undefined ? data.customerProperty : existing.customer_property,
      data.description !== undefined ? data.description : existing.description,
      data.dueDate !== undefined ? data.dueDate : existing.due_date,
      data.isRepeatJob !== undefined ? (data.isRepeatJob ? 1 : 0) : existing.is_repeat_job,
      data.repeatJobReference !== undefined ? data.repeatJobReference : existing.repeat_job_reference,
      data.notes !== undefined ? data.notes : existing.notes,
      data.photos !== undefined ? JSON.stringify(data.photos) : existing.photos,
      req.user.userId,
      data.qaLevelId !== undefined ? data.qaLevelId : existing.qa_level_id,
      id
    );

    // Track photos changes
    if (data.photos !== undefined) {
      const newPhotos = JSON.stringify(data.photos);
      const oldPhotos = existing.photos || '[]';
      if (newPhotos !== oldPhotos) {
        const oldCount = existing.photos ? JSON.parse(existing.photos).length : 0;
        const newCount = data.photos.length;
        changes['photos'] = { from: `${oldCount} photos`, to: `${newCount} photos` };
      }
    }

    // Capture existing items/assignees for change tracking
    const existingItems = data.items !== undefined ? jobItemQueries.getByJobcard.all(id) : [];
    const existingAssignees = data.assigneeIds !== undefined ? jobAssigneeQueries.getByJobcard.all(id) : [];

    // Update line items if provided
    if (data.items !== undefined) {
      jobItemQueries.deleteByJobcard.run(id);
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemId = item.id || `item:${Date.now()}:${uuidv4().slice(0, 8)}`;
        jobItemQueries.create.run(itemId, id, i + 1, item.qty || null, item.description, item.material || null, item.treatment || null, item.treatmentOther || null);
      }
    }

    // Track items changes — per-item granularity
    if (data.items !== undefined) {
      const itemSummary = (qty, description, material, treatment) => `${qty || ''}x ${description}${material ? ' (' + material + ')' : ''}${treatment ? ' [' + treatment + ']' : ''}`;
      const oldMap = new Map(existingItems.map(i => [i.item_number, itemSummary(i.qty, i.description, i.material, i.treatment)]));
      const newMap = new Map(data.items.map((i, idx) => [i.itemNumber || idx + 1, itemSummary(i.qty, i.description, i.material, i.treatment)]));
      for (const [num, desc] of newMap) {
        if (!oldMap.has(num)) {
          changes[`item #${num} added`] = { from: null, to: desc };
        } else if (oldMap.get(num) !== desc) {
          changes[`item #${num}`] = { from: oldMap.get(num), to: desc };
        }
      }
      for (const [num, desc] of oldMap) {
        if (!newMap.has(num)) {
          changes[`item #${num} removed`] = { from: desc, to: null };
        }
      }
    }

    // Update assignees if provided
    if (data.assigneeIds !== undefined) {
      jobAssigneeQueries.deleteByJobcard.run(id);
      for (const userId of data.assigneeIds) {
        const assigneeId = `assignee:${Date.now()}:${uuidv4().slice(0, 8)}`;
        try {
          jobAssigneeQueries.create.run(assigneeId, id, userId);
        } catch (e) {
          // Ignore duplicate
        }
      }
    }

    // Track assignees changes
    if (data.assigneeIds !== undefined) {
      const oldIds = existingAssignees.map(a => a.user_id).sort().join(',');
      const newIds = [...data.assigneeIds].sort().join(',');
      if (oldIds !== newIds) {
        const oldNames = existingAssignees.map(a => a.user_name).join(', ') || 'none';
        const newNames = data.assigneeIds.map(userId => {
          const user = userQueries.getById.get(userId);
          return user ? (user.name || user.username) : userId;
        }).join(', ') || 'none';
        changes['assignees'] = { from: oldNames, to: newNames };
      }
    }

    // Handle QA level changes - create/remove QA forms and copy templates
    const newQaLevelId = data.qaLevelId !== undefined ? data.qaLevelId : existing.qa_level_id;
    if (data.qaLevelId !== undefined && (data.qaLevelId || null) !== (existing.qa_level_id || null)) {
      // Validate new QA level exists before deleting old forms
      if (newQaLevelId) {
        const newLevel = qaLevelQueries.getById.get(newQaLevelId);
        if (!newLevel) {
          return res.status(400).json({ error: 'Invalid QA level selected' });
        }
      }

      // Remove old QA forms
      qaFormQueries.deleteByJobcard.run(id);

      // Initialize new QA forms from level templates
      if (newQaLevelId) {
        const current = jobcardQueries.getById.get(id);
        const currentItems = jobItemQueries.getByJobcard.all(id);
        const allTreatments = [...new Set(currentItems.flatMap(i => (i.treatment || '').split(',').filter(v => v && v !== 'NONE')))];
        const allTreatmentOther = currentItems.map(i => i.treatment_other).filter(Boolean).join(', ');
        await initQaFormsFromLevel(id, newQaLevelId, {
          jobNumber: current.job_number,
          status: current.status,
          companyName: current.company_name || data.companyName || null,
          contactName: current.contact_name || data.contactName || null,
          description: current.description || data.description || null,
          jobType: current.job_type || data.jobType || null,
          priority: current.priority || data.priority || 'NONE',
          dueDate: current.due_date || data.dueDate || null,
          qualityLevel: data.qualityLevel || existing.quality_level,
          poNumber: current.po_number || data.poNumber || null,
          quoteReference: current.quote_reference || data.quoteReference || null,
          drawingsType: current.drawings_type || data.drawingsType || null,
          customerProperty: current.customer_property || data.customerProperty || null,
          treatmentRequired: allTreatments.join(',') || null,
          treatmentOther: allTreatmentOther || null,
          repeatJob: (data.isRepeatJob !== undefined ? data.isRepeatJob : current.is_repeat_job === 1) ? 'Yes' : 'No',
          repeatJobReference: current.repeat_job_reference || data.repeatJobReference || null,
          notes: current.notes || data.notes || null,
          items: currentItems.map(i => ({ itemNumber: i.item_number, qty: i.qty, description: i.description, material: i.material, treatment: i.treatment, treatmentOther: i.treatment_other }))
        });
      }
    }

    // Record changes in history
    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, changes, null);
    }

    const updated = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const assignees = jobAssigneeQueries.getByJobcard.all(id);
    const subcontracts = subcontractQueries.getByJobcard.all(id);

    res.json(formatJobcard(updated, items, assignees, subcontracts, req.user.role));
  } catch (err) {
    logger.error({ err }, 'Update jobcard error');
    res.status(500).json({ error: 'Failed to update job card' });
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

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const changes = { status: { from: existing.status, to: status } };

    jobcardQueries.updateStatus.run(status, req.user.userId, id);
    recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, changes, null);

    const updated = jobcardQueries.getById.get(id);
    res.json(formatJobcard(updated, [], [], [], req.user.role));
  } catch (err) {
    logger.error({ err }, 'Update status error');
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Archive job card (mark as invoiced)
router.post('/:id/archive', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { invoicedDate } = req.body;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    jobcardQueries.archive.run(invoicedDate || new Date().toISOString(), req.user.userId, id);
    recordHistory('jobcard', id, 'archive', req.user.userId, req.user.name || req.user.username, {
      archived: { from: false, to: true },
      invoicedDate: { from: null, to: invoicedDate || new Date().toISOString() }
    }, { jobNumber: existing.job_number });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Archive error');
    res.status(500).json({ error: 'Failed to archive job card' });
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

// Sync endpoints for offline support
router.post('/sync/create', authenticate, requireAdmin, (req, res) => {
  req.body._id = req.body._id || `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;
  return router.handle(req, res);
});

router.post('/sync/update', authenticate, (req, res) => {
  try {
    const data = req.body;
    const existing = jobcardQueries.getById.get(data._id);

    if (!existing) {
      return res.redirect(307, '/api/jobcards');
    }


    req.params = { id: data._id };
    return router.handle(req, res);
  } catch (err) {
    logger.error({ err }, 'Sync update error');
    res.status(500).json({ error: 'Failed to sync update' });
  }
});

module.exports = router;
