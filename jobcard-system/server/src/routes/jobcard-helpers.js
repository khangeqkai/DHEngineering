const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { sanitizeFolderName, isWithinBase, findQaLevelFolder, ensureCompanyFolder, resolveCompanyFolder } = require('../utils/folderCreation');
const { fillPdfTemplate } = require('../utils/pdfFiller');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  qaLevelQueries,
  qaLevelTemplateQueries,
  tagQueries,
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
  'contactEmail'
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

// A drawings / customer-property field "declares" something when it carries a
// real value — anything other than empty or the explicit "N/A" answer (stored
// as the slug N_A). Values are comma-separated tag slugs.
function declaresValue(raw) {
  if (!raw) return false;
  return String(raw).split(',').map(v => v.trim()).filter(Boolean).some(v => v !== 'N_A');
}

// A per-part file is stored as "{name} [p{code}]" by the upload route (or
// "{name} [p{code}] (n)" on a name clash), where the code is derived from the
// part's permanent id. Matching by that code (not the visible item number) keeps
// a part's files attached even after re-numbering. The code is matched only at
// the END of the base name — where the upload route writes it — so a file whose
// human-readable name merely *contains* another part's code can't masquerade as
// that part's attachment (which could otherwise slip a missing drawing past the
// invoice gate).
function hasItemFile(names, itemId) {
  const { partFileCode } = require('./jobcard-files');
  const code = partFileCode(itemId);
  if (!code) return false;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagAtEnd = new RegExp(`\\[${escaped}\\](?: \\(\\d+\\))?$`);
  return names.some(name => {
    const base = name.slice(0, name.length - path.extname(name).length);
    return tagAtEnd.test(base);
  });
}

// Like hasItemFile, but returns the human-readable names of the files attached to
// a part — with the on-disk "[p{code}]" id tag (and any " (n)" clash suffix)
// stripped back off, so the printout shows the name the user uploaded ("ABC.pdf"),
// not the storage name. Used by the job card printout to list a part's drawings.
function itemFileDisplayNames(names, itemId) {
  const { partFileCode } = require('./jobcard-files');
  const code = partFileCode(itemId);
  if (!code) return [];
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagAtEnd = new RegExp(`\\[${escaped}\\](?: \\(\\d+\\))?$`);
  const stripTag = new RegExp(` \\[${escaped}\\](?: \\(\\d+\\))?$`);
  return names
    .filter(name => tagAtEnd.test(name.slice(0, name.length - path.extname(name).length)))
    .map(name => {
      const ext = path.extname(name);
      const base = name.slice(0, name.length - ext.length).replace(stripTag, '');
      return `${base}${ext}`;
    });
}

// Detect "declared but no file" gaps for one job by comparing each line item's
// declarations against what's actually on disk:
//   - a drawing declared but no file named for that part in Job Files
//   - customer property declared but no file named for that part in Customer Property
//   - a QA level set but no returned (timestamp-named) form in QA Forms
// Items may be DB rows (snake_case) or formatted/request items (camelCase).
// No-ops safely (hasAny:false) when job-folders storage isn't configured.
function computeAttachmentWarnings(jobcardId, items = [], qaLevelId = null, flagUnsaved = false) {
  const { listCategoryFileNames, partFileCode } = require('./jobcard-files');
  const settings = getSettings();
  if (!settings.job_folders_base || !settings.job_folders_base.trim()) {
    return { items: [], missingQaForms: false, hasAny: false };
  }

  // Normalise items once — they may be DB rows (snake_case) or formatted/request
  // items (camelCase). itemNumber is only carried back so the UI can line each
  // warning up with the row it's showing; files are matched by the part's id.
  const normItems = items.map((it, idx) => ({
    id: it.id,
    itemNumber: it.itemNumber != null ? it.itemNumber
      : (it.item_number != null ? it.item_number : idx + 1),
    drawings: it.drawingsType !== undefined ? it.drawingsType : it.drawings_type,
    customerProperty: it.customerProperty !== undefined ? it.customerProperty : it.customer_property
  }));

  // Work out what actually needs checking before touching the disk, so a job
  // that declared nothing (and needs no quality form) does no folder reads.
  const anyDrawing = normItems.some(it => declaresValue(it.drawings));
  const anyProperty = normItems.some(it => declaresValue(it.customerProperty));
  // A job needs a returned quality form only if its QA level has a template attached
  // AND the level is switched to "requires completed form returned". Print-only levels
  // (switch off) still get their templates copied/pre-filled on save, but never nag.
  const qaTemplates = qaLevelId ? qaLevelTemplateQueries.getByLevel.all(qaLevelId) : [];
  const qaLevel = qaLevelId ? qaLevelQueries.getById.get(qaLevelId) : null;
  const needsQa = qaTemplates.length > 0 && !!(qaLevel && qaLevel.requires_returned_form);

  if (!anyDrawing && !anyProperty && !needsQa) {
    return { items: [], missingQaForms: false, hasAny: false };
  }

  // Read only the category folders we need, in one job-folder resolve.
  const categories = [];
  if (anyDrawing) categories.push('job-files');
  if (anyProperty) categories.push('customer-property-files');
  if (needsQa) categories.push('qa-form-files');
  const fileNames = listCategoryFileNames(jobcardId, categories);
  const jobFileNames = fileNames['job-files'] || [];
  const customerPropertyNames = fileNames['customer-property-files'] || [];

  const flagged = [];
  normItems.forEach((it) => {
    // Only a saved part has a permanent "item:" id; an unsaved part (just added
    // in this same edit) has no folder code, so no file can be matched to it yet.
    if (!partFileCode(it.id)) {
      // In a live scan, skip it — flagging a part you can't attach to yet is a
      // dead end; it'll be checked normally on the next save once it has an id.
      // At the invoice gate (flagUnsaved), a declared drawing/customer-property
      // on a brand-new part is genuinely unattached, so it must be flagged or the
      // job could be invoiced with a missing file no warning ever caught.
      if (!flagUnsaved) return;
      const missingDrawing = declaresValue(it.drawings);
      const missingCustomerProperty = declaresValue(it.customerProperty);
      if (missingDrawing || missingCustomerProperty) {
        flagged.push({ itemNumber: it.itemNumber, missingDrawing, missingCustomerProperty });
      }
      return;
    }
    const missingDrawing = declaresValue(it.drawings) && !hasItemFile(jobFileNames, it.id);
    const missingCustomerProperty = declaresValue(it.customerProperty) && !hasItemFile(customerPropertyNames, it.id);
    if (missingDrawing || missingCustomerProperty) {
      flagged.push({ itemNumber: it.itemNumber, missingDrawing, missingCustomerProperty });
    }
  });

  // The blank templates are copied (bare-named) into the QA Forms folder when the
  // job is created; a completed form is brought back in via the upload route,
  // which stamps a 14-digit timestamp tag at the end of the name
  // ("{name} [{timestamp}]", or "... (n)" on a clash). Detect a returned form by
  // that positive marker — NOT by "any file that isn't a template name", which
  // would let any unrelated file (or a stray blank template) dropped in the
  // folder falsely clear the missing-form warning. The real gap is "no stamped
  // form returned yet".
  let missingQaForms = false;
  if (needsQa) {
    const returnedTag = /\[\d{14}\](?: \(\d+\))?$/;
    const qaNames = fileNames['qa-form-files'] || [];
    const hasReturnedForm = qaNames.some(name =>
      returnedTag.test(name.slice(0, name.length - path.extname(name).length))
    );
    missingQaForms = !hasReturnedForm;
  }

  return { items: flagged, missingQaForms, hasAny: flagged.length > 0 || missingQaForms };
}

function formatJobcard(row, items = [], assignees = [], userRole = 'user') {
  const isAdmin = userRole === 'admin';
  // Customer fields are hidden from non-admins — same set as CUSTOMER_HISTORY_FIELDS.
  const contactFields = isAdmin ? {
    contactId: row.contact_id,
    contactName: row.contact_name,
    companyName: row.company_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email
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
      treatments: parseTreatments(item.treatments),
      drawingsType: item.drawings_type || null,
      customerProperty: item.customer_property || null
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
    treatments: parseTreatments(i.treatments),
    drawingsType: i.drawings_type,
    customerProperty: i.customer_property
  }));
  const allTreatments = itemsForPdf.flatMap(i => i.treatments).map(t => {
    const name = t.value === 'OTHER' ? (t.otherText || 'Other') : t.value;
    return t.supplierName ? `${name} - ${t.supplierName}` : name;
  });
  const allJobTypes = [...new Set(items.map(i => i.job_type).filter(Boolean))];
  // Drawings + customer property now live per line item; aggregate (de-duped)
  // across the job so the job-level PDF fields still fill.
  const splitValues = raw => (raw ? String(raw) : '').split(',').map(v => v.trim()).filter(Boolean);
  const allDrawings = [...new Set(items.flatMap(i => splitValues(i.drawings_type)))];
  const allProperty = [...new Set(items.flatMap(i => splitValues(i.customer_property)))];
  // The job's creation date, formatted for any "date created" PDF field.
  const jc = jobcardQueries.getById.get(jobcardId);
  return {
    ...fields,
    dateCreated: jc ? formatAuDate(jc.created_at) : null,
    jobType: allJobTypes.join(',') || null,
    treatmentRequired: allTreatments.join(', ') || null,
    drawingsType: allDrawings.join(',') || null,
    customerProperty: allProperty.join(',') || null,
    items: itemsForPdf
  };
}

// ─── Job card printout (generated HTML) ───
// Resolve a stored tag value to its friendly name; fall back to the raw value
// (covers values whose option was archived/renamed away).
const PRIORITY_LABELS = { NONE: 'None', LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

function tagName(category, value) {
  if (value == null || value === '') return '';
  const row = tagQueries.getByValue.get(category, value);
  return row ? row.name : value;
}

function splitValues(raw) {
  return String(raw || '').split(',').map(v => v.trim()).filter(Boolean);
}

function formatAuDate(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString('en-AU');
}

// Build friendly, pre-formatted data for the generated job card printout
// (rendered by renderJobCardHtml in utils/jobCardHtml.js). `jc` is the raw
// jobcards row.
function buildJobCardView(jobcardId, jc) {
  const rows = jobItemQueries.getByJobcard.all(jobcardId);

  // Read the Job Files folder once so each part's drawing can show the actual
  // file attached to it (or flag a missing one). Empty when storage isn't set up
  // or the folder is missing — in which case every declared drawing shows missing.
  const { listCategoryFileNames } = require('./jobcard-files');
  const jobFileNames = listCategoryFileNames(jobcardId, ['job-files'])['job-files'] || [];

  const items = rows.map(r => {
    const dVals = splitValues(r.drawings_type);
    const drawingsIsNa = dVals.length === 0 || (dVals.length === 1 && dVals[0] === 'N_A');
    const drawings = drawingsIsNa
      ? 'N/A'
      : [...new Set(dVals.map(v => tagName('drawings', v)))].join(', ');
    // For a declared drawing, find the file(s) attached to this exact part and
    // show their human-readable names; "missing" when none are on disk yet.
    const drawingFiles = drawingsIsNa ? [] : itemFileDisplayNames(jobFileNames, r.id);
    const drawingsMissing = !drawingsIsNa && drawingFiles.length === 0;
    const treatments = parseTreatments(r.treatments).map(t => {
      const name = t.value === 'OTHER' ? (t.otherText || 'Other') : tagName('treatment', t.value);
      return t.supplierName ? `${name} - ${t.supplierName}` : name;
    });
    // Customer property is a per-part field on screen, so the printout shows it
    // per part too (same friendly-name + N/A handling as drawings).
    const cpVals = splitValues(r.customer_property);
    const customerPropertyIsNa = cpVals.length === 0 || (cpVals.length === 1 && cpVals[0] === 'N_A');
    const customerProperty = customerPropertyIsNa
      ? 'N/A'
      : [...new Set(cpVals.map(v => tagName('customer_property', v)))].join(', ');
    return {
      number: r.item_number,
      qty: (r.qty == null || r.qty === '') ? '—' : r.qty,
      jobType: tagName('job_type', r.job_type) || '—',
      description: r.description || '',
      material: tagName('material', r.material) || '—',
      drawings,
      drawingsIsNa,
      drawingFiles,
      drawingsMissing,
      treatment: treatments.length ? treatments.join(', ') : 'None',
      customerProperty,
      customerPropertyIsNa
    };
  });

  const priorityKey = (jc.priority || 'NONE').toUpperCase();
  const priorityLabel = priorityKey === 'NONE' ? null : (PRIORITY_LABELS[priorityKey] || priorityKey);

  return {
    jobNumber: jc.job_number,
    priorityLabel,
    priorityClass: priorityKey === 'HIGH' ? 'high' : 'normal',
    dateCreated: formatAuDate(jc.created_at),
    dueDate: formatAuDate(jc.due_date),
    // The shop-floor printout shows the company so workers know whose job it is.
    // Contact name / phone / email are never on the printout for anyone.
    company: jc.company_name || '',
    printed: new Date().toLocaleDateString('en-AU'),
    items
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
        serializeTreatments(item.treatments),
        item.drawingsType || null, item.customerProperty || null
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

    const base = basePath.trim();
    // Locate the customer's company folder by permanent contact id (created +
    // marked if needed) so QA forms land in the same folder the job's files
    // resolve to — even after a company-name change. Jobs with no contact fall
    // back to the name-built folder.
    const contactId = jobData.contactId || null;
    const companyFolder = contactId
      ? ensureCompanyFolder(contactId, jobData.companyName)
      : resolveCompanyFolder(base, null, jobData.companyName);
    const sanitizedJob = sanitizeFolderName(jobData.jobNumber);
    if (!companyFolder || !sanitizedJob) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'Invalid company or job folder name' };
    }

    const qaFormsFolder = path.join(companyFolder, sanitizedJob, 'QA Forms');
    if (!isWithinBase(base, qaFormsFolder)) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'QA Forms folder path outside base' };
    }

    // Locate the level's template folder by the code in its name, not the name
    // itself, so a renamed level still resolves to the right folder.
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

module.exports = { formatJobcard, buildChanges, sanitizeHistoryForRole, createRelatedRecords, parseTreatments, serializeTreatments, buildQaFillData, buildJobCardView, copyQaTemplatesForJob, verifyQaTemplatesAvailable, computeAttachmentWarnings };
