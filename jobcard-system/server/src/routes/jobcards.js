const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  timeEntryQueries,
  jobCostingQueries,
  documentQueries,
  qaFormQueries,
  historyQueries,
  recordHistory,
  generateJobNumber
} = require('../db/database');

const router = express.Router();

// Helper to format jobcard response
function formatJobcard(row, items = [], assignees = [], subcontracts = []) {
  return {
    _id: row.id,
    id: row.id,
    jobNumber: row.job_number,
    cardType: row.card_type,
    status: row.status,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerIsCritical: row.customer_is_critical === 1,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
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
    const { status, customerId, archived } = req.query;

    let jobcards;
    if (archived === 'true') {
      jobcards = jobcardQueries.getArchived.all();
    } else if (status) {
      jobcards = jobcardQueries.getByStatus.all(status);
    } else if (customerId) {
      jobcards = jobcardQueries.getByCustomer.all(customerId);
    } else {
      jobcards = jobcardQueries.getAll.all();
    }

    res.json(jobcards.map(jc => formatJobcard(jc)));
  } catch (err) {
    console.error('Get jobcards error:', err);
    res.status(500).json({ error: 'Failed to get job cards' });
  }
});

// Get overdue job cards
router.get('/overdue', authenticate, (req, res) => {
  try {
    const jobcards = jobcardQueries.getOverdue.all();
    res.json(jobcards.map(jc => formatJobcard(jc)));
  } catch (err) {
    console.error('Get overdue jobcards error:', err);
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

    res.json(formatJobcard(jobcard, items, assignees, subcontracts));
  } catch (err) {
    console.error('Get jobcard error:', err);
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
    console.error('Get jobcard history error:', err);
    res.status(500).json({ error: 'Failed to get job card history' });
  }
});

// Get job card time entries
router.get('/:id/time-entries', authenticate, (req, res) => {
  try {
    const entries = timeEntryQueries.getByJobcard.all(req.params.id);
    res.json(entries.map(e => ({
      id: e.id,
      userId: e.user_id,
      userName: e.user_name,
      itemNumber: e.item_number,
      machineNumber: e.machine_number,
      qty: e.qty,
      description: e.description,
      startTime: e.start_time,
      endTime: e.end_time,
      equipmentChecksDone: e.equipment_checks_done === 1,
      measuringVerificationDone: e.measuring_verification_done === 1,
      firstOffInspection: e.first_off_inspection,
      firstOffInspectionNotes: e.first_off_inspection_notes,
      inProcessValidation: e.in_process_validation,
      inProcessValidationNotes: e.in_process_validation_notes,
      scrapAllGood: e.scrap_all_good === 1,
      scrapRecycleInhouseQty: e.scrap_recycle_inhouse_qty,
      scrapRecycleBinQty: e.scrap_recycle_bin_qty,
      createdAt: e.created_at
    })));
  } catch (err) {
    console.error('Get time entries error:', err);
    res.status(500).json({ error: 'Failed to get time entries' });
  }
});

// Get job card costing (admin only)
router.get('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const costing = jobCostingQueries.getByJobcard.get(req.params.id);
    if (!costing) {
      return res.json(null);
    }
    res.json({
      id: costing.id,
      jobcardId: costing.jobcard_id,
      labourHours: costing.labour_hours,
      labourRate: costing.labour_rate,
      labourTotal: costing.labour_total,
      labourSpecialHours: costing.labour_special_hours,
      labourSpecialRate: costing.labour_special_rate,
      labourSpecialTotal: costing.labour_special_total,
      materialsCost: costing.materials_cost,
      materialsProfitPercent: costing.materials_profit_percent,
      materialsTotal: costing.materials_total,
      subcontractorCost: costing.subcontractor_cost,
      subcontractorProfitPercent: costing.subcontractor_profit_percent,
      subcontractorTotal: costing.subcontractor_total,
      grandTotal: costing.grand_total
    });
  } catch (err) {
    console.error('Get costing error:', err);
    res.status(500).json({ error: 'Failed to get costing' });
  }
});

// Get job card documents
router.get('/:id/documents', authenticate, (req, res) => {
  try {
    const docs = documentQueries.getByJobcard.all(req.params.id);
    res.json(docs.map(d => ({
      id: d.id,
      filename: d.filename,
      fileType: d.file_type,
      fileSize: d.file_size,
      uploadedBy: d.uploaded_by,
      uploadedAt: d.uploaded_at
    })));
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Get job card QA forms
router.get('/:id/qa-forms', authenticate, (req, res) => {
  try {
    const forms = qaFormQueries.getByJobcard.all(req.params.id);
    res.json(forms.map(f => ({
      id: f.id,
      formCode: f.form_code,
      formName: f.form_name,
      status: f.status,
      printedAt: f.printed_at,
      scannedAt: f.scanned_at,
      notes: f.notes
    })));
  } catch (err) {
    console.error('Get QA forms error:', err);
    res.status(500).json({ error: 'Failed to get QA forms' });
  }
});

// Create job card
router.post('/', authenticate, (req, res) => {
  try {
    const data = req.body;

    // Generate job number
    const isQuote = data.cardType === 'QUOTE';
    const jobNumber = generateJobNumber(isQuote);
    const id = `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;

    // Determine initial status
    const status = isQuote ? 'QUOTE' : 'OPEN';

    jobcardQueries.create.run(
      id,
      jobNumber,
      data.cardType || 'JOB_CARD',
      status,
      data.customerId || null,
      data.contactName || null,
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
      cardType: data.cardType,
      status
    });

    res.status(201).json(formatJobcard(jobcard, items, assignees, subcontracts));
  } catch (err) {
    console.error('Create jobcard error:', err);
    res.status(500).json({ error: 'Failed to create job card' });
  }
});

// Update job card
router.put('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Track changes
    const changes = {};
    const fieldsToTrack = [
      ['card_type', 'cardType'],
      ['status', 'status'],
      ['quality_level', 'qualityLevel'],
      ['job_type', 'jobType'],
      ['priority', 'priority'],
      ['due_date', 'dueDate']
    ];

    for (const [dbField, reqField] of fieldsToTrack) {
      if (data[reqField] !== undefined && data[reqField] !== existing[dbField]) {
        changes[dbField] = { from: existing[dbField], to: data[reqField] };
      }
    }

    jobcardQueries.update.run(
      data.cardType !== undefined ? data.cardType : existing.card_type,
      data.status !== undefined ? data.status : existing.status,
      data.customerId !== undefined ? data.customerId : existing.customer_id,
      data.contactName !== undefined ? data.contactName : existing.contact_name,
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

    // Record changes in history
    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update', req.user.userId, req.user.name, changes, null);
    }

    const updated = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const assignees = jobAssigneeQueries.getByJobcard.all(id);
    const subcontracts = subcontractQueries.getByJobcard.all(id);

    res.json(formatJobcard(updated, items, assignees, subcontracts));
  } catch (err) {
    console.error('Update jobcard error:', err);
    res.status(500).json({ error: 'Failed to update job card' });
  }
});

// Update job card status only
router.patch('/:id/status', authenticate, (req, res) => {
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
    res.json(formatJobcard(updated));
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Convert quote to job card
router.post('/:id/convert-to-jobcard', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    if (existing.card_type !== 'QUOTE') {
      return res.status(400).json({ error: 'Only quotes can be converted to job cards' });
    }

    // Generate new job number for job card
    const newJobNumber = generateJobNumber(false);

    // Update the card
    const changes = {
      card_type: { from: 'QUOTE', to: 'JOB_CARD' },
      status: { from: existing.status, to: 'OPEN' },
      job_number: { from: existing.job_number, to: newJobNumber }
    };

    const stmt = require('../db/database').db.prepare(`
      UPDATE jobcards SET card_type = 'JOB_CARD', status = 'OPEN', job_number = ?, quote_reference = ?, updated_by = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(newJobNumber, existing.job_number, req.user.userId, id);

    recordHistory('jobcard', id, 'convert', req.user.userId, req.user.name, changes, null);

    const updated = jobcardQueries.getById.get(id);
    res.json(formatJobcard(updated));
  } catch (err) {
    console.error('Convert to jobcard error:', err);
    res.status(500).json({ error: 'Failed to convert quote to job card' });
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

    // Check for outstanding QA forms if critical customer
    if (existing.customer_is_critical) {
      const outstanding = qaFormQueries.getOutstandingForCritical.all(id);
      if (outstanding.length > 0) {
        return res.status(400).json({
          error: 'Cannot archive: Outstanding QA forms for critical customer',
          outstandingForms: outstanding.map(f => f.form_code)
        });
      }
    }

    jobcardQueries.archive.run(invoicedDate || new Date().toISOString(), req.user.userId, id);
    recordHistory('jobcard', id, 'archive', req.user.userId, req.user.name, { invoicedDate }, null);

    res.json({ success: true });
  } catch (err) {
    console.error('Archive error:', err);
    res.status(500).json({ error: 'Failed to archive job card' });
  }
});

// Add time entry
router.post('/:id/time-entries', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const entryId = `timeentry:${Date.now()}:${uuidv4().slice(0, 8)}`;

    timeEntryQueries.create.run(
      entryId,
      id,
      req.user.userId,
      data.itemNumber || null,
      data.machineNumber || null,
      data.qty || null,
      data.description || null,
      data.startTime,
      data.endTime || null,
      data.equipmentChecksDone ? 1 : 0,
      data.measuringVerificationDone ? 1 : 0,
      data.firstOffInspection || null,
      data.firstOffInspectionNotes || null,
      data.inProcessValidation || null,
      data.inProcessValidationNotes || null,
      data.scrapAllGood !== false ? 1 : 0,
      data.scrapRecycleInhouseQty || 0,
      data.scrapRecycleBinQty || 0
    );

    recordHistory('jobcard', id, 'add_time_entry', req.user.userId, req.user.name, {
      timeEntryId: entryId,
      startTime: data.startTime,
      machineNumber: data.machineNumber,
      description: data.description
    }, null);

    const entry = timeEntryQueries.getById.get(entryId);
    res.status(201).json(entry);
  } catch (err) {
    console.error('Add time entry error:', err);
    res.status(500).json({ error: 'Failed to add time entry' });
  }
});

// Update time entry
router.put('/:id/time-entries/:entryId', authenticate, (req, res) => {
  try {
    const { id, entryId } = req.params;
    const data = req.body;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    timeEntryQueries.update.run(
      data.itemNumber || null,
      data.machineNumber || null,
      data.qty || null,
      data.description || null,
      data.startTime,
      data.endTime || null,
      data.equipmentChecksDone ? 1 : 0,
      data.measuringVerificationDone ? 1 : 0,
      data.firstOffInspection || null,
      data.firstOffInspectionNotes || null,
      data.inProcessValidation || null,
      data.inProcessValidationNotes || null,
      data.scrapAllGood !== false ? 1 : 0,
      data.scrapRecycleInhouseQty || 0,
      data.scrapRecycleBinQty || 0,
      entryId
    );

    recordHistory('jobcard', id, 'update_time_entry', req.user.userId, req.user.name, {
      timeEntryId: entryId,
      machineNumber: data.machineNumber,
      description: data.description
    }, null);

    const entry = timeEntryQueries.getById.get(entryId);
    res.json(entry);
  } catch (err) {
    console.error('Update time entry error:', err);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Delete time entry
router.delete('/:id/time-entries/:entryId', authenticate, (req, res) => {
  try {
    const { id, entryId } = req.params;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    recordHistory('jobcard', id, 'delete_time_entry', req.user.userId, req.user.name, {
      timeEntryId: entryId,
      startTime: existing.start_time,
      description: existing.description
    }, null);

    timeEntryQueries.delete.run(entryId);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete time entry error:', err);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// Get subcontracts
router.get('/:id/subcontracts', authenticate, (req, res) => {
  try {
    const subcontracts = subcontractQueries.getByJobcard.all(req.params.id);
    res.json(subcontracts.map(s => ({
      id: s.id,
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      date_sent: s.date_sent,
      date_expected: s.date_expected,
      date_received: s.date_received,
      status: s.status,
      notes: s.notes
    })));
  } catch (err) {
    console.error('Get subcontracts error:', err);
    res.status(500).json({ error: 'Failed to get subcontracts' });
  }
});

// Add subcontract
router.post('/:id/subcontracts', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const subId = `subcontract:${Date.now()}:${uuidv4().slice(0, 8)}`;

    subcontractQueries.create.run(
      subId,
      id,
      data.supplier_id,
      data.date_sent || null,
      data.date_expected || null,
      data.notes || null,
      data.status || 'PENDING'
    );

    recordHistory('jobcard', id, 'add_subcontract', req.user.userId, req.user.name, {
      subcontractId: subId,
      supplierId: data.supplier_id,
      status: data.status || 'PENDING'
    }, null);

    const sub = subcontractQueries.getById.get(subId);
    res.status(201).json(sub);
  } catch (err) {
    console.error('Add subcontract error:', err);
    res.status(500).json({ error: 'Failed to add subcontract' });
  }
});

// Update subcontract
router.put('/:id/subcontracts/:subId', authenticate, (req, res) => {
  try {
    const { id, subId } = req.params;
    const data = req.body;

    const existing = subcontractQueries.getById.get(subId);
    if (!existing) {
      return res.status(404).json({ error: 'Subcontract not found' });
    }

    subcontractQueries.update.run(
      data.supplier_id || existing.supplier_id,
      data.date_sent !== undefined ? data.date_sent : existing.date_sent,
      data.date_expected !== undefined ? data.date_expected : existing.date_expected,
      data.date_received !== undefined ? data.date_received : existing.date_received,
      data.notes !== undefined ? data.notes : existing.notes,
      data.status || existing.status,
      subId
    );

    recordHistory('jobcard', id, 'update_subcontract', req.user.userId, req.user.name, {
      subcontractId: subId,
      status: data.status,
      dateReceived: data.date_received
    }, null);

    const sub = subcontractQueries.getById.get(subId);
    res.json(sub);
  } catch (err) {
    console.error('Update subcontract error:', err);
    res.status(500).json({ error: 'Failed to update subcontract' });
  }
});

// Delete subcontract
router.delete('/:id/subcontracts/:subId', authenticate, (req, res) => {
  try {
    const { id, subId } = req.params;

    const existing = subcontractQueries.getById.get(subId);
    if (!existing) {
      return res.status(404).json({ error: 'Subcontract not found' });
    }

    recordHistory('jobcard', id, 'delete_subcontract', req.user.userId, req.user.name, {
      subcontractId: subId,
      supplierId: existing.supplier_id
    }, null);

    subcontractQueries.delete.run(subId);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete subcontract error:', err);
    res.status(500).json({ error: 'Failed to delete subcontract' });
  }
});

// Update costing (admin only)
router.put('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const costingId = data.id || `costing:${Date.now()}:${uuidv4().slice(0, 8)}`;

    // Calculate totals
    const labourTotal = (data.labourHours || 0) * (data.labourRate || 0);
    const labourSpecialTotal = (data.labourSpecialHours || 0) * (data.labourSpecialRate || 0);
    const materialsTotal = (data.materialsCost || 0) * (1 + (data.materialsProfitPercent || 100) / 100);
    const subcontractorTotal = (data.subcontractorCost || 0) * (1 + (data.subcontractorProfitPercent || 0) / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    jobCostingQueries.createOrUpdate.run(
      costingId,
      id,
      data.labourHours || 0,
      data.labourRate || 0,
      labourTotal,
      data.labourSpecialHours || 0,
      data.labourSpecialRate || 0,
      labourSpecialTotal,
      data.materialsCost || 0,
      data.materialsProfitPercent || 100,
      materialsTotal,
      data.subcontractorCost || 0,
      data.subcontractorProfitPercent || 0,
      subcontractorTotal,
      grandTotal
    );

    recordHistory('jobcard', id, 'update_costing', req.user.userId, req.user.name, { grandTotal }, null);

    res.json({ success: true, grandTotal });
  } catch (err) {
    console.error('Update costing error:', err);
    res.status(500).json({ error: 'Failed to update costing' });
  }
});

// Add document
router.post('/:id/documents', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { filename, fileType, fileSize, fileData } = req.body;

    const docId = `doc:${Date.now()}:${uuidv4().slice(0, 8)}`;

    documentQueries.create.run(
      docId,
      id,
      filename,
      fileType || null,
      fileSize || null,
      fileData,
      req.user.userId
    );

    recordHistory('jobcard', id, 'add_document', req.user.userId, req.user.name, { filename }, null);

    res.status(201).json({ id: docId, filename });
  } catch (err) {
    console.error('Add document error:', err);
    res.status(500).json({ error: 'Failed to add document' });
  }
});

// Update QA form status
router.patch('/:jobcardId/qa-forms/:formId', authenticate, (req, res) => {
  try {
    const { jobcardId, formId } = req.params;
    const { status, scannedDocumentId, notes } = req.body;

    const form = qaFormQueries.getById.get(formId);
    if (!form) {
      return res.status(404).json({ error: 'QA form not found' });
    }

    const oldStatus = form.status;
    const printedAt = status === 'PRINTED' ? new Date().toISOString() : form.printed_at;
    const scannedAt = status === 'SCANNED' ? new Date().toISOString() : form.scanned_at;

    qaFormQueries.update.run(
      status || form.status,
      printedAt,
      scannedAt,
      scannedDocumentId || form.scanned_document_id,
      notes || form.notes,
      formId
    );

    // Record history
    recordHistory('jobcard', jobcardId, 'update_qa_form', req.user.userId, req.user.name, {
      formCode: form.form_code,
      formName: form.form_name,
      statusChange: { from: oldStatus, to: status }
    }, null);

    res.json({ success: true });
  } catch (err) {
    console.error('Update QA form error:', err);
    res.status(500).json({ error: 'Failed to update QA form' });
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
    console.error('Delete jobcard error:', err);
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
    console.error('Sync update error:', err);
    res.status(500).json({ error: 'Failed to sync update' });
  }
});

module.exports = router;
