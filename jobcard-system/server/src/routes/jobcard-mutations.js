const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { createJobCardFolders } = require('../utils/folderCreation');
const { authenticate, requireManagement, isManagement } = require('../middleware/auth');
const { validateJobcardEnums, validateJobcardDescriptionRequired, validateItemTreatments, validateItemMaterials, validateItemJobTypes, validateItemDrawings, validateItemCustomerProperty, validateItemDescriptions, validateItemQuantities } = require('../middleware/validation');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  qaLevelQueries,
  companyQueries,
  contactQueries,
  getSettings,
  recordHistory
} = require('../db/database');
const { formatJobcard, buildChanges, createRelatedRecords, buildQaFillData, computeAttachmentWarnings } = require('./jobcard-helpers');
const { copyQaTemplatesForJob, verifyQaTemplatesAvailable } = require('../utils/qaTemplateProvisioning');
const { itemSummary, assigneeNames, buildQaTemplateWarning } = require('./jobcard-audit-text');
const { computeLiveCosting, persistCosting } = require('../utils/costingCompute');
const { peekNextJobNumber, bumpJobNumber } = require('../db/helpers');
const { db } = require('../db/connection');

const router = express.Router();

router.post('/', authenticate, requireManagement, validateJobcardDescriptionRequired, ...validateJobcardEnums, async (req, res) => {
  try {
    const data = req.body;

    // Validate everything BEFORE any database write, so a rejection can never
    // consume a job number or leave a half-made record behind.
    // A job needs at least one line; the per-line rules below all no-op on an
    // empty list, so without this guard a job with no parts would slip past them.
    if (!Array.isArray(data.items) || data.items.length === 0) {
      return res.status(400).json({ error: 'A job must have at least one part' });
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

    const drawingsError = validateItemDrawings(data.items);
    if (drawingsError) {
      return res.status(400).json({ error: drawingsError });
    }

    const propertyError = validateItemCustomerProperty(data.items);
    if (propertyError) {
      return res.status(400).json({ error: propertyError });
    }

    const descriptionError = validateItemDescriptions(data.items);
    if (descriptionError) {
      return res.status(400).json({ error: descriptionError });
    }

    const quantityError = validateItemQuantities(data.items);
    if (quantityError) {
      return res.status(400).json({ error: quantityError });
    }

    // The customer is the company; the contact is the person there the job was
    // taken for. The company must be picked (it owns the folder the job's files go
    // in) and its name is taken from the record, not from what was typed — the job
    // then keeps that name for good. The person is optional, and if one is named
    // they must actually work at that company.
    const company = companyQueries.getById.get(data.companyId || '');
    if (!company) {
      return res.status(400).json({ error: 'Pick a customer for this job' });
    }
    if (company.archived) {
      return res.status(400).json({ error: 'That customer is archived. Restore it before starting new work for them.' });
    }

    let contact = null;
    if (data.contactId) {
      contact = contactQueries.getById.get(data.contactId);
      if (!contact || contact.company_id !== company.id) {
        return res.status(400).json({ error: 'That contact person does not work at the chosen customer' });
      }
    }

    const id = `jobcard:${uuidv4()}`;
    const status = data.status || 'OPEN';

    // A job is never born invoiced. Invoicing must file the job away (archive +
    // invoiced date) and run the missing-files check, which only the update/status
    // paths do — allowing it here would strand a job in the "invoiced but still
    // open" limbo the status-lock exists to prevent.
    if (status === 'INVOICED') {
      return res.status(400).json({ error: 'A new job cannot be created as Invoiced. Save it first, then invoice it.' });
    }

    // No level chosen means the plain "Standard" baseline (no special quality form),
    // which is stored as the label STANDARD with no level id.
    const qaLevelId = data.qaLevelId || null;
    let qualityLevelName = 'STANDARD';

    // QA level validity is a read — check it before touching the number.
    if (qaLevelId) {
      const level = qaLevelQueries.getById.get(qaLevelId);
      if (!level) {
        return res.status(400).json({ error: 'Invalid QA level selected' });
      }
      qualityLevelName = level.name.toUpperCase();

      // Confirm the level's forms are actually on disk BEFORE consuming a job
      // number, so a job is never saved believing it has forms that can't be made.
      const qaCheck = verifyQaTemplatesAvailable(qaLevelId);
      if (!qaCheck.ok) {
        return res.status(400).json({ error: qaCheck.reason });
      }
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
        company.id,
        contact ? contact.id : null,
        data.contactName || null,
        company.name,
        data.contactPhone || null,
        data.contactEmail || null,
        qualityLevelName,
        data.priority || 'NONE',
        data.poNumber || null,
        data.quoteReference || null,
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

      // Seed this job's labour rate from the company default at creation time, then the
      // job owns it. This is what makes the default apply to NEW jobs only — a later
      // change to the company default reads this stored rate and never moves the job.
      // Everything else on the costing starts at zero (no logged time yet).
      const seedRate = Number(getSettings().labour_default_rate) || 0;
      persistCosting(computeLiveCosting(id, { labourRate: seedRate }));

      bumpJobNumber(peek.nextNum, peek.width);

      // Audit log is part of the same all-or-nothing save: if it can't be
      // written, the whole creation rolls back rather than reporting failure
      // for a job that actually got saved.
      const createChanges = {
        jobNumber: { from: null, to: peek.jobNumber },
        status: { from: null, to: status },
        priority: { from: null, to: data.priority || 'NONE' },
        qualityLevel: { from: null, to: qualityLevelName || null }
      };
      // Record the line items the job started with, matching the per-item
      // detail kept for later edits, so the original contents are recoverable.
      if (Array.isArray(data.items)) {
        data.items.forEach((i, idx) => {
          const num = i.itemNumber || idx + 1;
          createChanges[`item #${num} added`] = {
            from: null,
            to: itemSummary(i.qty, i.description, i.jobType, i.material, i.treatments, i.drawingsType, i.customerProperty)
          };
        });
      }
      // Record who was assigned at creation.
      if (Array.isArray(data.assigneeIds) && data.assigneeIds.length > 0) {
        createChanges['assignees'] = { from: null, to: assigneeNames(data.assigneeIds) };
      }
      recordHistory('jobcard', id, 'create', req.user.userId, req.user.name || req.user.username, createChanges);

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
        companyId: company.id,
        companyName: company.name,
        contactName: data.contactName || null,
        description: data.description || null,
        priority: data.priority || 'NONE',
        dueDate: data.dueDate || null,
        qualityLevel: qualityLevelName,
        poNumber: data.poNumber || null,
        quoteReference: data.quoteReference || null,
        repeatJob: data.isRepeatJob ? 'Yes' : 'No',
        repeatJobReference: data.repeatJobReference || null
      }));
    }

    const jobcard = jobcardQueries.getById.get(id);
    const items = jobItemQueries.getByJobcard.all(id);
    const assignees = jobAssigneeQueries.getByJobcard.all(id);

    createJobCardFolders(jobcard.company_id, jobcard.company_name, jobNumber);

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

    if (!isManagement(req.user.role)) {
      const allowedFields = ['photos'];
      const submittedFields = Object.keys(data).filter(k => data[k] !== undefined);
      const disallowed = submittedFields.filter(f => !allowedFields.includes(f));
      if (disallowed.length > 0) {
        return res.status(403).json({ error: 'Employees can only update photos' });
      }
    }

    // Customer details are frozen at creation and can never change on an existing
    // job (traceability: a job is a permanent record of who the work was for, as
    // it was at the time). Strip them on every update regardless of role; the
    // update query falls back to the existing stored values.
    delete data.companyId;
    delete data.contactId;
    delete data.contactName;
    delete data.companyName;
    delete data.contactPhone;
    delete data.contactEmail;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    if (data.status !== undefined && data.status !== existing.status && !isManagement(req.user.role)) {
      return res.status(403).json({ error: 'Only management can change job card status' });
    }

    // A filed-away (archived) job is locked: refuse a status change here too, so
    // even an admin can't recreate the filed-away-but-open state by editing.
    // Editing other fields on an archived job is still allowed, and once a job is
    // un-filed (archived cleared, status reset to OPEN) status edits work normally.
    if (data.status !== undefined && data.status !== existing.status &&
        existing.archived === 1) {
      return res.status(409).json({ error: 'This job is invoiced and filed away. Un-file it before changing its status.' });
    }

    // Validate a changed QA level BEFORE touching the database, so an invalid
    // selection can't leave a half-applied update committed.
    // A job always keeps a quality level — if the edit clears it (or an old job had
    // none), fall back to the built-in Standard instead of saving "no level".
    const newQaLevelId = data.qaLevelId !== undefined ? (data.qaLevelId || null) : existing.qa_level_id;
    const qaLevelChanged = data.qaLevelId !== undefined && (data.qaLevelId || null) !== (existing.qa_level_id || null);
    // The stored quality-level label follows the level: a special level's name, or
    // the plain "Standard" baseline when no level is set.
    let newQualityLevel = existing.quality_level;
    if (qaLevelChanged) {
      newQualityLevel = 'STANDARD';
    }
    if (qaLevelChanged && newQaLevelId) {
      const newLevel = qaLevelQueries.getById.get(newQaLevelId);
      if (!newLevel) {
        return res.status(400).json({ error: 'Invalid QA level selected' });
      }
      newQualityLevel = newLevel.name.toUpperCase();
      // Confirm the new level's forms are on disk BEFORE writing the update, so
      // the job is never saved expecting forms that can't be made.
      const qaCheck = verifyQaTemplatesAvailable(newQaLevelId);
      if (!qaCheck.ok) {
        return res.status(400).json({ error: qaCheck.reason });
      }
    }

    // The screen sends only `qaLevelId`, never `qualityLevel` — but the trail
    // should read "Standard → Premium", not an id-to-id change nobody can make
    // sense of. Hand buildChanges the readable value this route already derived
    // above, as if the caller had sent it, so its normal quality_level tracking
    // picks it up (a no-op when the level didn't actually change, since
    // newQualityLevel then equals the existing label).
    if (qaLevelChanged) {
      data.qualityLevel = newQualityLevel;
    }
    const changes = buildChanges(existing, data);

    const newStatus = data.status !== undefined ? data.status : existing.status;
    const shouldArchive = newStatus === 'INVOICED' && existing.status !== 'INVOICED' && existing.archived === 0;
    const invoicedDate = shouldArchive ? new Date().toISOString() : null;

    // Soft close-out checkpoint: when this update would invoice (and archive) the
    // job but files were declared and never attached, stop before any write and
    // report the gaps — unless the caller already confirmed "invoice anyway".
    // Parts and their attachments are never part of this route any more (see
    // jobcard-items.js and the files routes), so this always reads the job's
    // current, already-saved items.
    if (shouldArchive && data.confirmMissingAttachments !== true) {
      const itemsForCheck = jobItemQueries.getByJobcard.all(id);
      const warnings = computeAttachmentWarnings(id, itemsForCheck, newQaLevelId, true);
      if (warnings.hasAny) {
        return res.status(409).json({ error: 'MISSING_ATTACHMENTS', attachmentWarnings: warnings });
      }
    }

    // All database writes happen in one transaction: either the status/field
    // update lands, or none of it does.
    const applyUpdate = db.transaction(() => {
      jobcardQueries.update.run(
        existing.card_type,
        data.status !== undefined ? data.status : existing.status,
        // Who the job is for is frozen at creation and was stripped from the
        // request above, so these always carry the stored values straight through.
        existing.company_id,
        existing.contact_id,
        existing.contact_name,
        existing.company_name,
        existing.contact_phone,
        existing.contact_email,
        newQualityLevel,
        data.priority !== undefined ? data.priority : existing.priority,
        data.poNumber !== undefined ? data.poNumber : existing.po_number,
        data.quoteReference !== undefined ? data.quoteReference : existing.quote_reference,
        data.description !== undefined ? data.description : existing.description,
        data.dueDate !== undefined ? data.dueDate : existing.due_date,
        data.isRepeatJob !== undefined ? (data.isRepeatJob ? 1 : 0) : existing.is_repeat_job,
        data.repeatJobReference !== undefined ? data.repeatJobReference : existing.repeat_job_reference,
        data.photos !== undefined ? JSON.stringify(data.photos) : existing.photos,
        req.user.userId,
        data.qaLevelId !== undefined ? data.qaLevelId : existing.qa_level_id,
        id
      );

      if (shouldArchive) {
        jobcardQueries.archive.run(invoicedDate, req.user.userId, id);
      }
    });
    applyUpdate();

    // Invoicing just files the job away. No costing snapshot is taken: the job owns its
    // own overtime rules and rate, so recomputing its costing later always reproduces
    // the billed number — there is nothing a settings change could move.

    // ---- Change tracking (pure computation; uses `existing`, fetched above) ----
    if (data.photos !== undefined) {
      const newPhotos = JSON.stringify(data.photos);
      const oldPhotos = existing.photos || '[]';
      if (newPhotos !== oldPhotos) {
        const oldCount = existing.photos ? JSON.parse(existing.photos).length : 0;
        const newCount = data.photos.length;
        changes['photos'] = { from: `${oldCount} photos`, to: `${newCount} photos` };
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
        companyId: current.company_id || null,
        companyName: current.company_name || null,
        contactName: current.contact_name || null,
        description: current.description || data.description || null,
        priority: current.priority || data.priority || 'NONE',
        dueDate: current.due_date || data.dueDate || null,
        qualityLevel: newQualityLevel,
        poNumber: current.po_number || data.poNumber || null,
        quoteReference: current.quote_reference || data.quoteReference || null,
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
    if (updated.company_name) {
      createJobCardFolders(updated.company_id || null, updated.company_name, updated.job_number);
    }

    const response = formatJobcard(updated, items, assignees, req.user.role);
    const warning = buildQaTemplateWarning(qaResult);
    if (warning) response.qaTemplateWarning = warning;
    response.attachmentWarnings = computeAttachmentWarnings(id, items, updated.qa_level_id);
    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Update jobcard error');
    res.status(500).json({ error: 'Failed to update job card' });
  }
});

module.exports = router;
