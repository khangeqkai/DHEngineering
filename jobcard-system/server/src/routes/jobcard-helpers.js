const { v4: uuidv4 } = require('uuid');

const {
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  qaFormQueries
} = require('../db/database');

function formatJobcard(row, items = [], assignees = [], subcontracts = [], userRole = 'user') {
  const isAdmin = userRole === 'admin';
  return {
    _id: row.id,
    id: row.id,
    jobNumber: row.job_number,
    cardType: row.card_type,
    status: row.status,
    contactId: isAdmin ? row.contact_id : null,
    contactName: isAdmin ? row.contact_name : null,
    companyName: isAdmin ? row.company_name : null,
    contactPhone: isAdmin ? row.contact_phone : null,
    contactEmail: isAdmin ? row.contact_email : null,
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

function buildChanges(existing, data) {
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
    const value = dbField === 'is_repeat_job' ? (data[reqField] ? 1 : 0) : data[reqField];
    if (normalizeEmpty(value) !== normalizeEmpty(existing[dbField])) {
      changes[reqField] = { from: existing[dbField], to: value };
    }
  }

  return changes;
}

function createRelatedRecords(jobcardId, data) {
  if (data.items && Array.isArray(data.items)) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const itemId = `item:${Date.now()}:${uuidv4().slice(0, 8)}`;
      jobItemQueries.create.run(itemId, jobcardId, i + 1, item.qty || null, item.description);
    }
  }

  if (data.assigneeIds && Array.isArray(data.assigneeIds)) {
    for (const userId of data.assigneeIds) {
      const assigneeId = `assignee:${Date.now()}:${uuidv4().slice(0, 8)}`;
      try {
        jobAssigneeQueries.create.run(assigneeId, jobcardId, userId);
      } catch (e) {
        // Ignore duplicate
      }
    }
  }

  if (data.subcontracts && Array.isArray(data.subcontracts)) {
    for (const sub of data.subcontracts) {
      const subId = `subcontract:${Date.now()}:${uuidv4().slice(0, 8)}`;
      subcontractQueries.create.run(
        subId, jobcardId, sub.supplierId,
        sub.dateSent || null, sub.dateExpected || null,
        sub.notes || null, 'PENDING'
      );
    }
  }
}

function initQaForms(jobcardId) {
  const qaForms = [
    { code: 'DHE-F39', name: 'Critical Parts Inspection & Test Plan' },
    { code: 'DHE-F15', name: 'Inwards Goods Inspection Sticker' },
    { code: 'DHE-F09', name: 'Inspection Report' },
    { code: 'DHE-F43', name: 'Hazard, Incident, Non-Conformance & Customer Complaint' }
  ];
  for (const form of qaForms) {
    const formId = `qaform:${Date.now()}:${uuidv4().slice(0, 8)}`;
    qaFormQueries.create.run(formId, jobcardId, form.code, form.name, 'PENDING');
  }
}

module.exports = { formatJobcard, buildChanges, createRelatedRecords, initQaForms };
