const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { createJobCardFolders } = require('../utils/folderCreation');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateJobcardEnums, validateItemTreatments, validateItemMaterials, validateItemJobTypes, validateItemDescriptions } = require('../middleware/validation');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  qaLevelQueries,
  userQueries,
  recordHistory
} = require('../db/database');
const { formatJobcard, buildChanges, createRelatedRecords, parseTreatments, serializeTreatments, buildQaFillData, copyQaTemplatesForJob } = require('./jobcard-helpers');
const { peekNextJobNumber, bumpJobNumber } = require('../db/helpers');
const { db } = require('../db/connection');

const router = express.Router();

function buildQaTemplateWarning(result) {
  if (!result || !Array.isArray(result.failed) || result.failed.length === 0) return null;
  const fatal = result.failed.find(f => f.fileName === '*');
  if (fatal) {
    return `QA template copy failed: ${fatal.reason || 'unknown error'}`;
  }
  const parts = result.failed.map(f => `${f.fileName} (${f.reason || 'unknown'})`);
  return `${result.failed.length} QA template${result.failed.length > 1 ? 's' : ''} failed to copy: ${parts.join('; ')}`;
}

router.post('/', authenticate, requireAdmin, ...validateJobcardEnums, async (req, res) => {
  try {
    const data = req.body;

    if (req.user.role !== 'admin') {
      delete data.contactId;
      delete data.contactName;
      delete data.companyName;
      delete data.contactPhone;
      delete data.contactEmail;
    }

    // Validate everything BEFORE any database write, so a rejection can never
    // consume a job number or leave a half-made record behind.
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

    const jobTypeError = validateItemJobTypes(data.items);
    if (jobTypeError) {
      return res.status(400).json({ error: jobTypeError });
    }

    const descriptionError = validateItemDescriptions(data.items);
    if (descriptionError) {
      return res.status(400).json({ error: descriptionError });
    }

    const id = `jobcard:${uuidv4()}`;
    const status = data.status || 'OPEN';

    const qaLevelId = data.qaLevelId || null;
    let qualityLevelName = null;

    // QA level validity is a read — check it before touching the number.
    if (qaLevelId) {
      const level = qaLevelQueries.getById.get(qaLevelId);
      if (!level) {
        return res.status(400).json({ error: 'Invalid QA level selected' });
      }
      qualityLevelName = level.name.toUpperCase();
    }

    // Write the job record, its line items, and the number-bump as ONE
    // all-or-nothing step. The counter advances LAST, so any failure rolls the
    // whole thing back and the number is never wasted. Tagged errors carry the
    // HTTP status to surface after the transaction unwinds.
    const createJobcard = db.transaction(() => {
      const peek = peekNextJobNumber();
      if (peek.error) {
        const e = new Error(peek.error);
        e.httpStatus = 400;
        throw e;
      }

      // Guard against manual DB edits that desync the auto-increment counter
      if (jobcardQueries.getByJobNumber.get(peek.jobNumber)) {
        const e = new Error(`Job number ${peek.jobNumber} already exists. Please update the starting number in Settings.`);
        e.httpStatus = 409;
        throw e;
      }

      jobcardQueries.create.run(
        id,
        peek.jobNumber,
        'JOB_CARD',
        status,
        data.contactId || null,
        data.contactName || null,
        data.companyName || null,
        data.contactPhone || null,
        data.contactEmail || null,
        qualityLevelName,
        data.priority || 'NONE',
        data.poNumber || null,
        data.quoteReference || null,
        data.drawingsType || null,
        data.customerProperty || null,
        data.description || null,
        data.dueDate || null,
        data.isRepeatJob ? 1 : 0,
        data.repeatJobReference || null,
        data.photos ? JSON.stringify(data.photos) : null,
        req.user.userId,
        req.user.userId,
        qaLevelId
      );

      createRelatedRecords(id, data);

      bumpJobNumber(peek.nextNum, peek.width);

      // Audit log is part of the same all-or-nothing save: if it can't be
      // written, the whole creation rolls back rather than reporting failure
      // for a job that actually got saved.
      recordHistory('jobcard', id, 'create', req.user.userId, req.user.name || req.user.username, {
        jobNumber: { from: null, to: peek.jobNumber },
        status: { from: null, to: status },
        priority: { from: null, to: data.priority || 'NONE' },
        qualityLevel: { from: null, to: qualityLevelName || null }
      });

      return peek.jobNumber;
    });

    let jobNumber;
    try {
      jobNumber = createJobcard();
    } catch (txErr) {
      if (txErr.httpStatus) {
        return res.status(txErr.httpStatus).json({ error: txErr.message });
      }
      throw txErr;
    }

    let qaResult = null;
    if (qaLevelId) {
      qaResult = await copyQaTemplatesForJob(id, qaLevelId, buildQaFillData(id, {
        jobNumber: jobNumber,
        status: status,
        companyName: data.companyName || null,
        contactName: data.contactName || null,
        description: data.description || null,
        priority: data.priority || 'NONE',
        dueDate: data.dueDate || null,
        qualityLevel: qualityLevelName,
        poNumber: data.poNumber || null,
        quoteReference: data.quoteReference || null,
        drawingsType: data.drawingsType || null,
        customerProperty: data.customerProperty || null,
        repeatJob: data.isRepeatJob ? 'Yes' : 'No',
        repeatJobReference: data.repeatJobReference || null
      }));
    }

    const jobcard = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const assignees = jobAssigneeQueries.getByJobcard.all(id);

    const folderCompany = jobcard.company_name || data.companyName;
    if (folderCompany) {
      createJobCardFolders(folderCompany, jobNumber);
    }

    const response = formatJobcard(jobcard, items, assignees, req.user.role);
    const warning = buildQaTemplateWarning(qaResult);
    if (warning) response.qaTemplateWarning = warning;
    res.status(201).json(response);
  } catch (err) {
    logger.error({ err }, 'Create jobcard error');
    res.status(500).json({ error: 'Failed to create job card' });
  }
});

router.put('/:id', authenticate, ...validateJobcardEnums, async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (req.user.role !== 'admin') {
      const allowedFields = ['photos'];
      const submittedFields = Object.keys(data).filter(k => data[k] !== undefined);
      const disallowed = submittedFields.filter(f => !allowedFields.includes(f));
      if (disallowed.length > 0) {
        return res.status(403).json({ error: 'Employees can only update photos' });
      }
    }

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
      const jobTypeError = validateItemJobTypes(data.items);
      if (jobTypeError) {
        return res.status(400).json({ error: jobTypeError });
      }
      const descriptionError = validateItemDescriptions(data.items);
      if (descriptionError) {
        return res.status(400).json({ error: descriptionError });
      }
    }

    const changes = buildChanges(existing, data);

    // Snapshot current items/assignees before any writes, for change tracking after commit
    const existingItems = data.items !== undefined ? jobItemQueries.getByJobcard.all(id) : [];
    const existingAssignees = data.assigneeIds !== undefined ? jobAssigneeQueries.getByJobcard.all(id) : [];

    // Validate a changed QA level BEFORE touching the database, so an invalid
    // selection can't leave a half-applied update committed.
    const newQaLevelId = data.qaLevelId !== undefined ? data.qaLevelId : existing.qa_level_id;
    const qaLevelChanged = data.qaLevelId !== undefined && (data.qaLevelId || null) !== (existing.qa_level_id || null);
    if (qaLevelChanged && newQaLevelId) {
      const newLevel = qaLevelQueries.getById.get(newQaLevelId);
      if (!newLevel) {
        return res.status(400).json({ error: 'Invalid QA level selected' });
      }
    }

    const newStatus = data.status !== undefined ? data.status : existing.status;
    const shouldArchive = newStatus === 'INVOICED' && existing.status !== 'INVOICED' && existing.archived === 0;
    const invoicedDate = shouldArchive ? new Date().toISOString() : null;

    // All database writes happen in one transaction: either every change lands,
    // or none do. A failure partway through (e.g. a rejected line item) rolls the
    // whole update back, so existing items/assignees are never lost.
    const applyUpdate = db.transaction(() => {
      jobcardQueries.update.run(
        existing.card_type,
        data.status !== undefined ? data.status : existing.status,
        data.contactId !== undefined ? data.contactId : existing.contact_id,
        data.contactName !== undefined ? data.contactName : existing.contact_name,
        data.companyName !== undefined ? data.companyName : existing.company_name,
        data.contactPhone !== undefined ? data.contactPhone : existing.contact_phone,
        data.contactEmail !== undefined ? data.contactEmail : existing.contact_email,
        data.qualityLevel !== undefined ? data.qualityLevel : existing.quality_level,
        data.priority !== undefined ? data.priority : existing.priority,
        data.poNumber !== undefined ? data.poNumber : existing.po_number,
        data.quoteReference !== undefined ? data.quoteReference : existing.quote_reference,
        data.drawingsType !== undefined ? data.drawingsType : existing.drawings_type,
        data.customerProperty !== undefined ? data.customerProperty : existing.customer_property,
        data.description !== undefined ? data.description : existing.description,
        data.dueDate !== undefined ? data.dueDate : existing.due_date,
        data.isRepeatJob !== undefined ? (data.isRepeatJob ? 1 : 0) : existing.is_repeat_job,
        data.repeatJobReference !== undefined ? data.repeatJobReference : existing.repeat_job_reference,
        data.photos !== undefined ? JSON.stringify(data.photos) : existing.photos,
        req.user.userId,
        data.qaLevelId !== undefined ? data.qaLevelId : existing.qa_level_id,
        id
      );

      if (data.items !== undefined) {
        jobItemQueries.deleteByJobcard.run(id);
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          const itemId = item.id || `item:${uuidv4()}`;
          jobItemQueries.create.run(
            itemId, id, i + 1,
            item.qty || null, item.description,
            item.jobType || null, item.material || null,
            serializeTreatments(item.treatments)
          );
        }
      }

      if (data.assigneeIds !== undefined) {
        jobAssigneeQueries.deleteByJobcard.run(id);
        for (const userId of data.assigneeIds) {
          const assigneeId = `assignee:${uuidv4()}`;
          try {
            jobAssigneeQueries.create.run(assigneeId, id, userId);
          } catch (e) {
            // Swallow UNIQUE-constraint duplicates from repeated userId in payload
          }
        }
      }

      if (shouldArchive) {
        jobcardQueries.archive.run(invoicedDate, req.user.userId, id);
      }
    });
    applyUpdate();

    // ---- Change tracking (pure computation; uses the snapshots captured above) ----
    if (data.photos !== undefined) {
      const newPhotos = JSON.stringify(data.photos);
      const oldPhotos = existing.photos || '[]';
      if (newPhotos !== oldPhotos) {
        const oldCount = existing.photos ? JSON.parse(existing.photos).length : 0;
        const newCount = data.photos.length;
        changes['photos'] = { from: `${oldCount} photos`, to: `${newCount} photos` };
      }
    }

    if (data.items !== undefined) {
      const treatmentsToText = (treatments) => {
        const arr = Array.isArray(treatments) ? treatments : parseTreatments(treatments);
        return arr.map(t => {
          const tName = t.value === 'OTHER' ? (t.otherText || 'Other') : t.value;
          return `${tName}→${t.supplierName || t.supplierId || '?'}`;
        }).join(', ');
      };
      const itemSummary = (qty, description, jobType, material, treatments) => {
        const tStr = treatmentsToText(treatments);
        return `${qty || ''}x ${description}${jobType ? ' <' + jobType + '>' : ''}${material ? ' (' + material + ')' : ''}${tStr ? ' [' + tStr + ']' : ''}`;
      };
      const oldMap = new Map(existingItems.map(i => [i.item_number, itemSummary(i.qty, i.description, i.job_type, i.material, i.treatments)]));
      const newMap = new Map(data.items.map((i, idx) => [i.itemNumber || idx + 1, itemSummary(i.qty, i.description, i.jobType, i.material, i.treatments)]));
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

    if (shouldArchive) {
      changes.archived = { from: false, to: true };
      changes.invoicedDate = { from: null, to: invoicedDate };
    }

    // QA template copy is a disk operation, kept outside the database transaction.
    let qaResult = null;
    if (qaLevelChanged && newQaLevelId) {
      const current = jobcardQueries.getById.get(id);
      qaResult = await copyQaTemplatesForJob(id, newQaLevelId, buildQaFillData(id, {
        jobNumber: current.job_number,
        status: current.status,
        companyName: current.company_name || data.companyName || null,
        contactName: current.contact_name || data.contactName || null,
        description: current.description || data.description || null,
        priority: current.priority || data.priority || 'NONE',
        dueDate: current.due_date || data.dueDate || null,
        qualityLevel: data.qualityLevel || existing.quality_level,
        poNumber: current.po_number || data.poNumber || null,
        quoteReference: current.quote_reference || data.quoteReference || null,
        drawingsType: current.drawings_type || data.drawingsType || null,
        customerProperty: current.customer_property || data.customerProperty || null,
        repeatJob: (data.isRepeatJob !== undefined ? data.isRepeatJob : current.is_repeat_job === 1) ? 'Yes' : 'No',
        repeatJobReference: current.repeat_job_reference || data.repeatJobReference || null
      }));
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, changes, null);
    }

    const updated = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const assignees = jobAssigneeQueries.getByJobcard.all(id);

    // Idempotent — covers jobs created before job_folders_base was configured
    const folderCompany = updated.company_name || data.companyName;
    if (folderCompany) {
      createJobCardFolders(folderCompany, updated.job_number);
    }

    const response = formatJobcard(updated, items, assignees, req.user.role);
    const warning = buildQaTemplateWarning(qaResult);
    if (warning) response.qaTemplateWarning = warning;
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Update jobcard error');
    res.status(500).json({ error: 'Failed to update job card' });
  }
});

module.exports = router;
