const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { sanitizeFolderName, isWithinBase, findQaLevelFolder } = require('../utils/folderCreation');
const { fillPdfTemplate } = require('../utils/pdfFiller');
const {
  jobItemQueries,
  jobAssigneeQueries,
  qaLevelQueries,
  qaLevelTemplateQueries,
  getSettings
} = require('../db/database');

// Customer/contact fields hidden from non-admins. Used both when formatting a
// job card and when sanitizing a job card's history so the two protections stay
// in sync (see formatJobcard + sanitizeHistoryForRole).
const CUSTOMER_HISTORY_FIELDS = [
  'contactId',
  'contactName',
  'companyName',
  'contactPhone',
  'contactEmail',
  'storedContactName',
  'storedCompanyName'
];

function parseTreatments(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatJobcard(row, items = [], assignees = [], userRole = 'user') {
  const isAdmin = userRole === 'admin';
  // Customer fields are hidden from non-admins — same set as CUSTOMER_HISTORY_FIELDS.
  const contactFields = isAdmin ? {
    contactId: row.contact_id,
    contactName: row.contact_name,
    companyName: row.company_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    storedContactName: row.stored_contact_name,
    storedCompanyName: row.stored_company_name
  } : Object.fromEntries(CUSTOMER_HISTORY_FIELDS.map(f => [f, null]));
  return {
    _id: row.id,
    id: row.id,
    jobNumber: row.job_number,
    cardType: row.card_type,
    status: row.status,
    ...contactFields,
    qualityLevel: row.quality_level,
    qaLevelId: row.qa_level_id || null,
    priority: row.priority,
    poNumber: row.po_number,
    quoteReference: row.quote_reference,
    drawingsType: row.drawings_type,
    customerProperty: row.customer_property,
    description: row.description,
    dueDate: row.due_date,
    isRepeatJob: row.is_repeat_job === 1,
    repeatJobReference: row.repeat_job_reference,
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
      description: item.description,
      jobType: item.job_type || null,
      material: item.material || null,
      treatments: parseTreatments(item.treatments)
    })),
    assignees: assignees.map(a => ({
      id: a.id,
      userId: a.user_id,
      userName: a.user_name,
      username: a.username
    }))
  };
}

function buildChanges(existing, data) {
  const changes = {};
  const fieldsToTrack = [
    ['status', 'status'],
    ['quality_level', 'qualityLevel'],
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
    ['qa_level_id', 'qaLevelId'],
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

// Strip customer/contact fields out of a single history record for non-admins,
// mirroring how formatJobcard hides those same fields on the live job card. The
// record stays in the database with full from/to values for admins; this only
// filters the copy handed back to a non-admin. Non-customer fields (status,
// priority, etc.) are left intact so the rest of the history still shows.
function sanitizeHistoryForRole(record, userRole) {
  if (userRole === 'admin') return record;
  for (const field of CUSTOMER_HISTORY_FIELDS) {
    if (record.changes) delete record.changes[field];
    if (record.snapshot) delete record.snapshot[field];
  }
  return record;
}

function serializeTreatments(treatments) {
  if (!Array.isArray(treatments) || treatments.length === 0) return null;
  return JSON.stringify(treatments);
}

// Build the data object passed to copyQaTemplatesForJob for PDF pre-fill.
// Loads current items from DB and aggregates treatments/job types across them.
function buildQaFillData(jobcardId, fields) {
  const items = jobItemQueries.getByJobcard.all(jobcardId);
  const itemsForPdf = items.map(i => ({
    itemNumber: i.item_number,
    qty: i.qty,
    description: i.description,
    jobType: i.job_type,
    material: i.material,
    treatments: parseTreatments(i.treatments)
  }));
  const allTreatments = itemsForPdf.flatMap(i => i.treatments).map(t => {
    const name = t.value === 'OTHER' ? (t.otherText || 'Other') : t.value;
    return t.supplierName ? `${name} → ${t.supplierName}` : name;
  });
  const allJobTypes = [...new Set(items.map(i => i.job_type).filter(Boolean))];
  return {
    ...fields,
    jobType: allJobTypes.join(',') || null,
    treatmentRequired: allTreatments.join(', ') || null,
    items: itemsForPdf
  };
}

function createRelatedRecords(jobcardId, data) {
  if (data.items && Array.isArray(data.items)) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const itemId = `item:${uuidv4()}`;
      jobItemQueries.create.run(
        itemId, jobcardId, i + 1,
        item.qty || null, item.description,
        item.jobType || null, item.material || null,
        serializeTreatments(item.treatments)
      );
    }
  }

  if (data.assigneeIds && Array.isArray(data.assigneeIds)) {
    for (const userId of data.assigneeIds) {
      const assigneeId = `assignee:${uuidv4()}`;
      try {
        jobAssigneeQueries.create.run(assigneeId, jobcardId, userId);
      } catch (e) {
        // Ignore duplicate
      }
    }
  }
}

/**
 * Copy a QA level's template PDFs into the job's QA Forms folder, filling
 * in fillable fields from job data. Templates without fillable fields are
 * copied as-is.
 * @param {string} jobcardId
 * @param {string} qaLevelId
 * @param {Object} jobData - Full job data for PDF pre-fill
 */
async function copyQaTemplatesForJob(jobcardId, qaLevelId, jobData) {
  const level = qaLevelQueries.getById.get(qaLevelId);
  if (!level) {
    return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'QA level not found' };
  }

  const templates = qaLevelTemplateQueries.getByLevel.all(qaLevelId);
  if (templates.length === 0) {
    return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'No templates configured for QA level' };
  }

  return await copyTemplatesToJobFolder(jobcardId, level, templates, jobData);
}

/**
 * Copy template PDFs from QA Level folder to job's QA Forms folder.
 * Awaits PDF fill so files exist on disk before the API response is sent.
 */
async function copyTemplatesToJobFolder(jobcardId, level, templates, jobData) {
  const totalTemplates = templates.length;
  try {
    const settings = getSettings();
    const basePath = settings.job_folders_base;
    if (!basePath || !basePath.trim()) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'No job folders base configured' };
    }

    const sanitizedCompany = sanitizeFolderName(jobData.companyName);
    const sanitizedJob = sanitizeFolderName(jobData.jobNumber);
    if (!sanitizedCompany || !sanitizedJob) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'Invalid company or job folder name' };
    }

    const qaFormsFolder = path.join(basePath.trim(), sanitizedCompany, sanitizedJob, 'QA Forms');
    if (!isWithinBase(basePath.trim(), qaFormsFolder)) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'QA Forms folder path outside base' };
    }

    // Locate the level's template folder by its marker, not its name, so a
    // renamed level still resolves to the right folder.
    const qaLevelsBase = path.join(basePath.trim(), 'QA Levels');
    const levelFolder = findQaLevelFolder(qaLevelsBase, level.id);

    if (!levelFolder) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'QA level folder not found' };
    }

    fs.mkdirSync(qaFormsFolder, { recursive: true });

    const fillData = {
      ...jobData,
      date: new Date().toLocaleDateString('en-AU'),
      qualityLevel: jobData.qualityLevel || level.name,
      items: jobData.items || []
    };

    const failed = [];
    let succeeded = 0;
    const copyPromises = [];
    for (const tmpl of templates) {
      const srcPath = path.join(levelFolder, tmpl.file_name);
      const destPath = path.join(qaFormsFolder, tmpl.file_name);

      if (!fs.existsSync(srcPath)) {
        failed.push({ fileName: tmpl.file_name, reason: 'Source template file not found' });
        continue;
      }
      if (!isWithinBase(levelFolder, srcPath) || !isWithinBase(qaFormsFolder, destPath)) {
        failed.push({ fileName: tmpl.file_name, reason: 'Path outside permitted base' });
        continue;
      }

      const sourceBuffer = fs.readFileSync(srcPath);
      copyPromises.push(
        fillPdfTemplate(sourceBuffer, fillData)
          .then(filledBuffer => {
            fs.writeFileSync(destPath, filledBuffer);
            logger.info({ destPath }, 'Copied QA template to job folder');
            succeeded += 1;
          })
          .catch(err => {
            try {
              fs.copyFileSync(srcPath, destPath);
              succeeded += 1;
            } catch (copyErr) {
              logger.error({ err: copyErr, srcPath, destPath }, 'Failed to copy QA template');
              failed.push({ fileName: tmpl.file_name, reason: copyErr.message || String(copyErr) });
            }
          })
      );
    }

    await Promise.all(copyPromises);

    return { totalTemplates, succeeded, failed, skipped: false };
  } catch (err) {
    logger.error({ err }, 'Failed to copy templates to job folder');
    return {
      totalTemplates,
      succeeded: 0,
      failed: [{ fileName: '*', reason: err.message || String(err) }],
      skipped: false
    };
  }
}

/**
 * Pre-save check: confirm a QA level's template files are present and readable
 * BEFORE the job is written, so a job can never be saved believing it has
 * inspection forms that were never created. Mirrors the source-side checks in
 * copyTemplatesToJobFolder (level folder found, each source file exists + is
 * within base) — these are the only failures that are predictable before the
 * copy runs.
 *
 * Returns { ok: true } when there is nothing that could fail, including the
 * cases where the copy would be legitimately skipped (no storage configured, or
 * the level has no templates). Returns { ok: false, reason } with a plain
 * message when a form file is missing. Rare runtime errors (full disk, locked
 * file) can't be foreseen here; the post-save warning still covers those.
 */
function verifyQaTemplatesAvailable(qaLevelId) {
  if (!qaLevelId) return { ok: true };

  const level = qaLevelQueries.getById.get(qaLevelId);
  if (!level) return { ok: false, reason: 'The selected quality level no longer exists.' };

  const templates = qaLevelTemplateQueries.getByLevel.all(qaLevelId);
  if (templates.length === 0) return { ok: true };

  const settings = getSettings();
  const basePath = settings.job_folders_base;
  if (!basePath || !basePath.trim()) return { ok: true };

  const qaLevelsBase = path.join(basePath.trim(), 'QA Levels');
  const levelFolder = findQaLevelFolder(qaLevelsBase, level.id);
  if (!levelFolder) {
    return {
      ok: false,
      reason: `Quality level "${level.name}" has forms listed but its folder is missing. Re-upload its forms under Quality Levels, then try again.`
    };
  }

  const missing = [];
  for (const tmpl of templates) {
    const srcPath = path.join(levelFolder, tmpl.file_name);
    if (!isWithinBase(levelFolder, srcPath) || !fs.existsSync(srcPath)) {
      missing.push(tmpl.file_name);
    }
  }
  if (missing.length > 0) {
    const plural = missing.length > 1;
    return {
      ok: false,
      reason: `Quality level "${level.name}" is missing ${missing.length} form file${plural ? 's' : ''} (${missing.join(', ')}). Re-upload ${plural ? 'them' : 'it'} under Quality Levels, then try again.`
    };
  }

  return { ok: true };
}

module.exports = { formatJobcard, buildChanges, sanitizeHistoryForRole, createRelatedRecords, parseTreatments, serializeTreatments, buildQaFillData, copyQaTemplatesForJob, verifyQaTemplatesAvailable };
