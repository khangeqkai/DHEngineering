const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  qaFormQueries,
  historyQueries,
  userQueries,
  recordHistory
} = require('../db/database');

const router = express.Router();

// Helper to format jobcard response
function formatJobcard(row, items = [], assignees = [], subcontracts = [], userRole = 'user') {
  const isAdmin = userRole === 'admin';
  return {
    _id: row.id,
    id: row.id,
    jobNumber: row.job_number,
    cardType: row.card_type,
    status: row.status,
    contactId: isAdmin ? row.contact_id : null,
    // Contact info from job card (override values)
    contactName: isAdmin ? row.contact_name : null,
    companyName: isAdmin ? row.company_name : null,
    contactPhone: isAdmin ? row.contact_phone : null,
    contactEmail: isAdmin ? row.contact_email : null,
    // Contact info from linked contact (for display)
    storedContactName: isAdmin ? row.stored_contact_name : null,
    storedCompanyName: isAdmin ? row.stored_company_name : null,
    qualityLevel: row.quality_level,
    jobType: row.job_type,
    priority: row.priority,
    poNumber: row.po_number,
    quoteReference: row.quote_reference,
    drawingsType: row.drawings_type,
    customerProperty: row.customer_property,
    description: row.description,
    dueDate: row.due_date,
    isRepeatJob: row.is_repeat_job === 1,
    repeatJobReference: row.repeat_job_reference,
    treatmentRequired: row.treatment_required,
    treatmentOther: row.treatment_other,
    notes: row.notes,
    photos: row.photos ? JSON.parse(row.photos) : [],
    invoicedDate: row.invoiced_date,
    archived: row.archived === 1,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Related data
    items: items.map(item => ({
      id: item.id,
      itemNumber: item.item_number,
      qty: item.qty,
      description: item.description
    })),
    assignees: assignees.map(a => ({
      id: a.id,
      userId: a.user_id,
      userName: a.user_name,
      username: a.username
    })),
    subcontracts: subcontracts.map(s => ({
      id: s.id,
      supplierId: s.supplier_id,
      supplierName: s.supplier_name,
      dateSent: s.date_sent,
      dateExpected: s.date_expected,
      dateReceived: s.date_received,
      status: s.status,
      notes: s.notes
    }))
  };
}

// Get all job cards
router.get('/', authenticate, (req, res) => {
  try {
    const { status, contactId, archived } = req.query;

    let jobcards;
    if (archived === 'true') {
      jobcards = jobcardQueries.getArchived.all();
    } else if (status) {
      jobcards = jobcardQueries.getByStatus.all(status);
    } else if (contactId) {
      jobcards = jobcardQueries.getByContact.all(contactId);
    } else {
      jobcards = jobcardQueries.getAll.all();
    }

    res.json(jobcards.map(jc => formatJobcard(jc, [], [], [], req.user.role)));
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

    // Get related data
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
router.post('/', authenticate, (req, res) => {
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

    // Job number from user input (required)
    const jobNumber = data.jobNumber;
    if (!jobNumber || !jobNumber.trim()) {
      return res.status(400).json({ error: 'Job number is required' });
    }

    // Check for duplicate job number
    const existing = jobcardQueries.getByJobNumber.get(jobNumber.trim());
    if (existing) {
      return res.status(400).json({ error: 'Job number already exists' });
    }

    const id = `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;

    // Status from request or default to OPEN
    const status = data.status || 'OPEN';

    jobcardQueries.create.run(
      id,
      jobNumber.trim(),
      'JOB_CARD', // card_type always JOB_CARD now
      status,
      data.contactId || null,
      data.contactName || null,
      data.companyName || null,
      data.contactPhone || null,
      data.contactEmail || null,
      data.qualityLevel || 'STANDARD',
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
      data.treatmentRequired || null,
      data.treatmentOther || null,
      data.notes || null,
      data.photos ? JSON.stringify(data.photos) : null,
      req.user.userId,
      req.user.userId
    );

    // Add line items
    if (data.items && Array.isArray(data.items)) {
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemId = `item:${Date.now()}:${uuidv4().slice(0, 8)}`;
        jobItemQueries.create.run(
          itemId,
          id,
          i + 1,
          item.qty || null,
          item.description
        );
      }
    }

    // Add assignees
    if (data.assigneeIds && Array.isArray(data.assigneeIds)) {
      for (const userId of data.assigneeIds) {
        const assigneeId = `assignee:${Date.now()}:${uuidv4().slice(0, 8)}`;
        try {
          jobAssigneeQueries.create.run(assigneeId, id, userId);
        } catch (e) {
          // Ignore duplicate
        }
      }
    }

    // Add subcontracts
    if (data.subcontracts && Array.isArray(data.subcontracts)) {
      for (const sub of data.subcontracts) {
        const subId = `subcontract:${Date.now()}:${uuidv4().slice(0, 8)}`;
        subcontractQueries.create.run(
          subId,
          id,
          sub.supplierId,
          sub.dateSent || null,
          sub.dateExpected || null,
          sub.notes || null,
          'PENDING'
        );
      }
    }

    // Initialize QA forms for critical customers
    if (data.qualityLevel === 'CRITICAL') {
      const qaForms = [
        { code: 'DHE-F39', name: 'Critical Parts Inspection & Test Plan' },
        { code: 'DHE-F15', name: 'Inwards Goods Inspection Sticker' },
        { code: 'DHE-F09', name: 'Inspection Report' },
        { code: 'DHE-F43', name: 'Hazard, Incident, Non-Conformance & Customer Complaint' }
      ];
      for (const form of qaForms) {
        const formId = `qaform:${Date.now()}:${uuidv4().slice(0, 8)}`;
        qaFormQueries.create.run(formId, id, form.code, form.name, 'PENDING');
      }
    }

    const jobcard = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const assignees = jobAssigneeQueries.getByJobcard.all(id);
    const subcontracts = subcontractQueries.getByJobcard.all(id);

    // Record creation in history
    recordHistory('jobcard', id, 'create', req.user.userId, req.user.name, null, {
      jobNumber,
      status
    });

    res.status(201).json(formatJobcard(jobcard, items, assignees, subcontracts, req.user.role));
  } catch (err) {
    logger.error({ err }, 'Create jobcard error');
    res.status(500).json({ error: 'Failed to create job card' });
  }
});

// Update job card
router.put('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

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

    // Track changes
    const changes = {};
    const fieldsToTrack = [
      ['status', 'status'],
      ['quality_level', 'qualityLevel'],
      ['job_type', 'jobType'],
      ['priority', 'priority'],
      ['due_date', 'dueDate'],
      ['contact_id', 'contactId'],
      ['contact_name', 'contactName'],
      ['company_name', 'companyName'],
      ['contact_phone', 'contactPhone'],
      ['contact_email', 'contactEmail'],
      ['po_number', 'poNumber'],
      ['quote_reference', 'quoteReference'],
      ['drawings_type', 'drawingsType'],
      ['customer_property', 'customerProperty'],
      ['description', 'description'],
      ['is_repeat_job', 'isRepeatJob'],
      ['repeat_job_reference', 'repeatJobReference'],
      ['treatment_required', 'treatmentRequired'],
      ['treatment_other', 'treatmentOther'],
      ['notes', 'notes'],
    ];

    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    for (const [dbField, reqField] of fieldsToTrack) {
      if (data[reqField] === undefined) continue;
      // Normalize boolean to integer for DB comparison (is_repeat_job stores 0/1)
      const value = dbField === 'is_repeat_job' ? (data[reqField] ? 1 : 0) : data[reqField];
      if (normalizeEmpty(value) !== normalizeEmpty(existing[dbField])) {
        changes[reqField] = { from: existing[dbField], to: value };
      }
    }

    jobcardQueries.update.run(
      existing.card_type, // card_type is immutable
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
      data.treatmentRequired !== undefined ? data.treatmentRequired : existing.treatment_required,
      data.treatmentOther !== undefined ? data.treatmentOther : existing.treatment_other,
      data.notes !== undefined ? data.notes : existing.notes,
      data.photos !== undefined ? JSON.stringify(data.photos) : existing.photos,
      req.user.userId,
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
        jobItemQueries.create.run(
          itemId,
          id,
          i + 1,
          item.qty || null,
          item.description
        );
      }
    }

    // Track items changes
    if (data.items !== undefined) {
      const oldDescs = existingItems.map(i => `${i.qty || ''}x ${i.description}`).join(', ');
      const newDescs = data.items.map(i => `${i.qty || ''}x ${i.description}`).join(', ');
      if (oldDescs !== newDescs) {
        changes['items'] = { from: oldDescs || 'none', to: newDescs || 'none' };
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

    // Record changes in history
    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update', req.user.userId, req.user.name, changes, null);
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
router.patch('/:id/status', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const changes = { status: { from: existing.status, to: status } };

    jobcardQueries.updateStatus.run(status, req.user.userId, id);
    recordHistory('jobcard', id, 'update', req.user.userId, req.user.name, changes, null);

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

    // Check for outstanding QA forms if critical quality level
    if (existing.quality_level === 'CRITICAL') {
      const outstanding = qaFormQueries.getOutstandingForCritical.all(id);
      if (outstanding.length > 0) {
        return res.status(400).json({
          error: 'Cannot archive: Outstanding QA forms for critical QA job',
          outstandingForms: outstanding.map(f => f.form_code)
        });
      }
    }

    jobcardQueries.archive.run(invoicedDate || new Date().toISOString(), req.user.userId, id);
    recordHistory('jobcard', id, 'archive', req.user.userId, req.user.name, {
      status: { from: existing.status, to: 'INVOICED' },
      invoicedDate: { from: null, to: invoicedDate || new Date().toISOString() }
    }, { jobNumber: existing.job_number });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Archive error');
    res.status(500).json({ error: 'Failed to archive job card' });
  }
});

// Delete job card
router.delete('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Record deletion with snapshot
    recordHistory('jobcard', id, 'delete', req.user.userId, req.user.name, null, {
      jobNumber: existing.job_number
    });

    jobcardQueries.delete.run(id);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete jobcard error');
    res.status(500).json({ error: 'Failed to delete job card' });
  }
});

// Sync endpoints for offline support
router.post('/sync/create', authenticate, (req, res) => {
  // Simplified - delegate to main create
  req.body._id = req.body._id || `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;
  return router.handle(req, res);
});

router.post('/sync/update', authenticate, (req, res) => {
  try {
    const data = req.body;
    const existing = jobcardQueries.getById.get(data._id);

    if (!existing) {
      // Create if doesn't exist
      return res.redirect(307, '/api/jobcards');
    }

    // Update
    req.params = { id: data._id };
    return router.handle(req, res);
  } catch (err) {
    logger.error({ err }, 'Sync update error');
    res.status(500).json({ error: 'Failed to sync update' });
  }
});

module.exports = router;
