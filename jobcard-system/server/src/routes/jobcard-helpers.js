const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { sanitizeFolderName, isWithinBase } = require('../utils/folderCreation');
const { fillPdfTemplate } = require('../utils/pdfFiller');
const {
  jobItemQueries,
  jobAssigneeQueries,
  qaLevelQueries,
  qaLevelTemplateQueries,
  getSettings
} = require('../db/database');

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
    ['notes', 'notes'],
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
  if (!level) return;

  const templates = qaLevelTemplateQueries.getByLevel.all(qaLevelId);
  if (templates.length === 0) return;

  await copyTemplatesToJobFolder(jobcardId, level, templates, jobData);
}

/**
 * Copy template PDFs from QA Level folder to job's QA Forms folder.
 * Awaits PDF fill so files exist on disk before the API response is sent.
 */
async function copyTemplatesToJobFolder(jobcardId, level, templates, jobData) {
  try {
    const settings = getSettings();
    const basePath = settings.job_folders_base;
    if (!basePath || !basePath.trim()) return;

    const sanitizedCompany = sanitizeFolderName(jobData.companyName);
    const sanitizedJob = sanitizeFolderName(jobData.jobNumber);
    if (!sanitizedCompany || !sanitizedJob) return;

    const qaFormsFolder = path.join(basePath.trim(), sanitizedCompany, sanitizedJob, 'QA Forms');
    if (!isWithinBase(basePath.trim(), qaFormsFolder)) return;

    const qaLevelsBase = path.join(basePath.trim(), 'QA Levels');
    const sanitizedLevelName = sanitizeFolderName(level.name);
    const levelFolder = path.join(qaLevelsBase, sanitizedLevelName);

    if (!fs.existsSync(levelFolder)) return;

    fs.mkdirSync(qaFormsFolder, { recursive: true });

    const fillData = {
      ...jobData,
      date: new Date().toLocaleDateString('en-AU'),
      qualityLevel: jobData.qualityLevel || level.name,
      items: jobData.items || []
    };

    const copyPromises = [];
    for (const tmpl of templates) {
      const srcPath = path.join(levelFolder, tmpl.file_name);
      const destPath = path.join(qaFormsFolder, tmpl.file_name);

      if (!fs.existsSync(srcPath)) continue;
      if (!isWithinBase(levelFolder, srcPath) || !isWithinBase(qaFormsFolder, destPath)) continue;

      const sourceBuffer = fs.readFileSync(srcPath);
      copyPromises.push(
        fillPdfTemplate(sourceBuffer, fillData)
          .then(filledBuffer => {
            fs.writeFileSync(destPath, filledBuffer);
            logger.info({ destPath }, 'Copied QA template to job folder');
          })
          .catch(err => {
            // Fallback: copy as-is
            try {
              fs.copyFileSync(srcPath, destPath);
            } catch (copyErr) {
              logger.error({ err: copyErr, srcPath, destPath }, 'Failed to copy QA template');
            }
          })
      );
    }

    await Promise.all(copyPromises);
  } catch (err) {
    logger.error({ err }, 'Failed to copy templates to job folder');
  }
}

module.exports = { formatJobcard, buildChanges, createRelatedRecords, parseTreatments, serializeTreatments, buildQaFillData, copyQaTemplatesForJob };
