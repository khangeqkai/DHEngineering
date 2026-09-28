const { v4: uuidv4 } = require('uuid');
const path = require('path');

const { isManagement } = require('../middleware/auth');
const jobStatuses = require('../shared/jobStatuses.json');
const {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  tagQueries,
  timeEntryQueries,
  getSettings
} = require('../db/database');
const { invoiceBlockedByTime } = require('../utils/timeEntryHelpers');
const { diffFields } = require('../utils/historyChanges');
const { officeDateString } = require('../utils/officeTime');
const { formatDayAu } = require('../shared/calendarDate');
const { splitAnswer, isNaAnswer, declaresAnswer } = require('../shared/lineItemAnswers');

// Customer/contact fields hidden from non-admins. Used both when formatting a
// job card and when sanitizing a job card's history so the two protections stay
// in sync (see formatJobcard + sanitizeHistoryForRole).
const CUSTOMER_HISTORY_FIELDS = [
  'companyId',
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
// Items may be DB rows (snake_case) or formatted/request items (camelCase).
// No-ops safely (hasAny:false) when job-folders storage isn't configured, and
// the same when the storage location can't be reached (drive or share offline)
// — then nothing is known about the files, so nothing is flagged; that result
// also carries `filesUnreachable: true` (and the not-configured one
// `filesNotConfigured: true`).
function computeAttachmentWarnings(jobcardId, items = []) {
  const { listCategoryFileNames, partFileCode } = require('./jobcard-files');
  const settings = getSettings();
  // No location set: nothing was looked at. Said plainly (filesNotConfigured),
  // the same way an unreachable drive says filesUnreachable below, so a screen
  // can tell "checked and fine" apart from "never checked" — never read as a
  // file being there. Invoicing does not stop for this one: with no location
  // set there is nowhere a file could ever have been attached.
  if (!settings.job_folders_base || !settings.job_folders_base.trim()) {
    return { items: [], hasAny: false, attachedByItem: {}, filesNotConfigured: true };
  }

  // Normalise items once — they may be DB rows (snake_case) or formatted/request
  // items (camelCase). Files are matched by the part's id, and each flagged part
  // carries that id so a screen lines the warning up with its row by id too;
  // itemNumber is only carried back for older readers.
  // `items` always arrives as the job's full list ordered by item_number ascending
  // (jobItemQueries.getByJobcard.all, or a route's own freshly-formatted items),
  // so this array's own index IS the part's 1-based position — the server states
  // it here rather than leaving every caller to count it again.
  const normItems = items.map((it, idx) => ({
    id: it.id,
    itemNumber: it.itemNumber != null ? it.itemNumber
      : (it.item_number != null ? it.item_number : idx + 1),
    position: idx + 1,
    drawings: it.drawingsType !== undefined ? it.drawingsType : it.drawings_type,
    customerProperty: it.customerProperty !== undefined ? it.customerProperty : it.customer_property
  }));

  // Work out what actually needs checking before touching the disk, so a job
  // that declared nothing does no folder reads.
  const anyDrawing = normItems.some(it => declaresAnswer(it.drawings));
  const anyProperty = normItems.some(it => declaresAnswer(it.customerProperty));
  if (!anyDrawing && !anyProperty) {
    return { items: [], hasAny: false, attachedByItem: {} };
  }

  // Read only the category folders we need, in one job-folder resolve.
  const categories = [];
  if (anyDrawing) categories.push('job-files');
  if (anyProperty) categories.push('customer-property-files');
  const fileNames = listCategoryFileNames(jobcardId, categories);
  if (!fileNames) {
    return { items: [], hasAny: false, attachedByItem: {}, filesUnreachable: true };
  }
  const jobFileNames = fileNames['job-files'] || [];
  const customerPropertyNames = fileNames['customer-property-files'] || [];

  const flagged = [];
  // Per-part list of the file names actually attached (id tag stripped back to the
  // name the user uploaded), keyed by the part's permanent id — never its sort
  // number, which a new part still on screen can share — so the line-item view can show
  // "✓ ABC.pdf" under each Drawings / Customer Property field instead of a bare
  // "Attached". Only carries parts that have at least one attached file.
  const attachedByItem = {};
  normItems.forEach((it) => {
    // Only a saved part has a permanent "item:" id; an unsaved part (just added
    // in this same edit) has no folder code, so no file can be matched to it yet.
    // Every caller — including the invoice-time check — passes this job's
    // current, already-saved items (jobItemQueries.getByJobcard.all), so this is
    // never actually hit in practice; skip it rather than flag a part nothing
    // can be matched to yet, and it'll be checked normally on the next read.
    if (!partFileCode(it.id)) return;
    const missingDrawing = declaresAnswer(it.drawings) && !hasItemFile(jobFileNames, it.id);
    const missingCustomerProperty = declaresAnswer(it.customerProperty) && !hasItemFile(customerPropertyNames, it.id);
    if (missingDrawing || missingCustomerProperty) {
      flagged.push({ id: it.id, itemNumber: it.itemNumber, position: it.position, missingDrawing, missingCustomerProperty });
    }

    // Collect the names of files already attached to this part, so the field can
    // show them. Only the folders we read above are available; an undeclared
    // category simply yields no names.
    const drawingFiles = anyDrawing ? itemFileDisplayNames(jobFileNames, it.id) : [];
    const propertyFiles = anyProperty ? itemFileDisplayNames(customerPropertyNames, it.id) : [];
    if (drawingFiles.length || propertyFiles.length) {
      attachedByItem[it.id] = { drawings: drawingFiles, customerProperty: propertyFiles };
    }
  });

  return { items: flagged, hasAny: flagged.length > 0, attachedByItem };
}

// ─── Invoicing (shared by PUT /jobcards/:id and PATCH /jobcards/:id/status) ───
// A job's status moving to INVOICED also files it away (archived + invoicedDate)
// — see docs/notes/jobs-and-status.md. Both routes that can make this transition
// run the exact same checks, in the same order, before any write; this is that
// one shared step. Returns `refusal` (a `{ status, body }` to send as-is) when the
// transition must be blocked, otherwise `shouldArchive`/`invoicedDate` for the
// caller to act on inside its own write transaction via applyInvoicingArchive.
function checkInvoicing(existing, newStatus, confirmMissingAttachments, confirmMissingInspection) {
  const shouldArchive = newStatus === 'INVOICED' && existing.status !== 'INVOICED' && existing.archived === 0;
  if (!shouldArchive) {
    return { shouldArchive: false, invoicedDate: null, refusal: null };
  }

  // Hard block: a running timer, or a just-stopped one whose form isn't saved
  // yet, can't be confirmed away like a missing attachment can — refuse before
  // any write, and before the soft attachment checkpoint below.
  const timeBlock = invoiceBlockedByTime(existing.id);
  if (timeBlock) {
    return { shouldArchive, invoicedDate: null, refusal: { status: 409, body: { error: timeBlock } } };
  }

  // Soft close-out checkpoint: stop before any write and report the gaps
  // instead of writing — unless the caller already confirmed "invoice anyway".
  // When the job declared files but the storage location can't be reached,
  // nothing is known either way, so it still stops and asks (FILES_UNREACHABLE)
  // rather than letting an unchecked job be invoiced and archived silently.
  if (confirmMissingAttachments !== true) {
    const items = jobItemQueries.getByJobcard.all(existing.id);
    const warnings = computeAttachmentWarnings(existing.id, items);
    if (warnings.hasAny || warnings.filesUnreachable) {
      const error = warnings.filesUnreachable ? 'FILES_UNREACHABLE' : 'MISSING_ATTACHMENTS';
      return {
        shouldArchive,
        invoicedDate: null,
        refusal: { status: 409, body: { error, attachmentWarnings: warnings } }
      };
    }
  }

  // Second soft close-out checkpoint, same shape as the attachments one above:
  // finished runs that needed the Critical sign-off (critical_at_finish = 1) but
  // are still missing one of the four inspection answers. This is a warning, not a
  // hard block — only management can invoice, so this is the manager's own confirm.
  const missingInspectionRows = timeEntryQueries.getMissingInspectionByJobcard.all(existing.id);
  if (missingInspectionRows.length > 0 && confirmMissingInspection !== true) {
    const inspectionWarnings = missingInspectionRows.map(row => ({
      id: row.id,
      workerName: row.user_name,
      startTime: row.start_time,
      endTime: row.end_time,
      itemNumber: row.item_number
    }));
    return {
      shouldArchive,
      invoicedDate: null,
      refusal: { status: 409, body: { error: 'MISSING_INSPECTION', inspectionWarnings } }
    };
  }

  return {
    shouldArchive,
    invoicedDate: new Date().toISOString(),
    refusal: null,
    // 0 when nothing was missing (so applyInvoicingArchive knows not to note it);
    // > 0 only when the manager just confirmed past runs that were missing answers.
    inspectionConfirmedCount: missingInspectionRows.length
  };
}

// Writes the archive row — call from inside the caller's own write transaction,
// in the same position the inline `if (shouldArchive) jobcardQueries.archive.run(...)`
// used to sit — and returns the history change entries to fold into the
// caller's own `changes` object. No-ops (and returns {}) when this update isn't
// an invoicing transition. `inspectionConfirmedCount` (from checkInvoicing) folds an
// extra change into the trail entry only when the job was invoiced anyway with
// unanswered Critical sign-offs — the same idea as the missing-attachments confirm,
// which isn't separately recorded anywhere so there is nothing to mirror there.
function applyInvoicingArchive(shouldArchive, invoicedDate, userId, jobcardId, inspectionConfirmedCount = 0) {
  if (!shouldArchive) return {};
  jobcardQueries.archive.run(invoicedDate, userId, jobcardId);
  const changes = {
    archived: { from: false, to: true },
    invoicedDate: { from: null, to: invoicedDate }
  };
  if (inspectionConfirmedCount > 0) {
    changes.inspectionSignOff = {
      from: `${inspectionConfirmedCount} run(s) unanswered`,
      to: 'invoiced anyway'
    };
  }
  return changes;
}

// The one "hide customer details" step — the six customer/contact fields off a
// job's own row, or all null when the requester isn't management. Every reader of
// a job's customer fields (the live job card, search's job results, the printout)
// goes through here, so the hiding rule can never drift between them.
function customerFields(row, canManage) {
  if (!canManage) return Object.fromEntries(CUSTOMER_HISTORY_FIELDS.map(f => [f, null]));
  return {
    companyId: row.company_id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    companyName: row.company_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email
  };
}

function formatJobcard(row, items = [], assignees = [], userRole = 'user') {
  const canManage = isManagement(userRole);
  return {
    _id: row.id,
    id: row.id,
    jobNumber: row.job_number,
    cardType: row.card_type,
    status: row.status,
    ...customerFields(row, canManage),
    qualityLevel: row.quality_level,
    priority: row.priority,
    poNumber: row.po_number,
    quoteReference: row.quote_reference,
    description: row.description,
    dueDate: row.due_date,
    isRepeatJob: row.is_repeat_job === 1,
    repeatJobReference: row.repeat_job_reference,
    photos: row.photos ? JSON.parse(row.photos) : [],
    invoicedDate: row.invoiced_date,
    printedAt: row.printed_at || null,
    archived: row.archived === 1,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // `items` is always this job's parts ordered by item_number ascending
    // (jobItemQueries.getByJobcard.all), so the array index IS the part's
    // 1-based position — display-only, never stored, never sent back.
    items: items.map((item, idx) => ({
      id: item.id,
      itemNumber: item.item_number,
      position: idx + 1,
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
  const fieldSpecs = [
    ['status', 'status'],
    ['quality_level', 'qualityLevel'],
    ['priority', 'priority'],
    ['due_date', 'dueDate'],
    ['company_id', 'companyId'],
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
  ];

  // Only fields the caller actually sent are compared at all — this is a partial
  // update, so a field left out of `data` means "don't touch it", not "clear it".
  const fieldsToTrack = fieldSpecs
    .filter(([, reqField]) => data[reqField] !== undefined)
    .map(([dbField, reqField]) => [
      dbField,
      reqField,
      dbField === 'is_repeat_job' ? (data[reqField] ? 1 : 0) : data[reqField]
    ]);

  return diffFields(existing, fieldsToTrack);
}

// Strip customer/contact fields out of a single history record for non-admins,
// mirroring how formatJobcard hides those same fields on the live job card. The
// record stays in the database with full from/to values for admins; this only
// filters the copy handed back to a non-admin. Non-customer fields (status,
// priority, etc.) are left intact so the rest of the history still shows.
function sanitizeHistoryForRole(record, userRole) {
  if (isManagement(userRole)) return record;
  for (const field of CUSTOMER_HISTORY_FIELDS) {
    if (record.changes) delete record.changes[field];
    if (record.snapshot) delete record.snapshot[field];
  }
  return record;
}

// A part's quantity column is text. Bind it as text: a JSON number bound as-is is
// written as a decimal ("10.0"), which then fails the whole-number check on every
// later edit of the part. Blank → NULL.
function partQtyText(qty) {
  if (qty === undefined || qty === null) return null;
  const str = String(qty).trim();
  return str === '' ? null : str;
}

function serializeTreatments(treatments) {
  if (!Array.isArray(treatments) || treatments.length === 0) return null;
  return JSON.stringify(treatments);
}

// Friendly, comma-joined label for a stored multi-value tag field (drawings /
// customer property), matching exactly how the job card printout shows them
// (buildJobCardView below): the explicit "N/A" sentinel reads as "N/A" and
// everything else resolves through tagName — so the activity trail and the job
// card never disagree on what a stored code means.
function friendlyTagList(raw, category) {
  if (isNaAnswer(raw)) return 'N/A';
  const vals = splitAnswer(raw);
  return [...new Set(vals.map(v => tagName(category, v)))].join(', ');
}

// ─── Job card printout (generated HTML) ───
// Resolve a stored tag value to its friendly name; fall back to the raw value
// (covers values whose option was archived/renamed away).
// Which pill the printed card wears. Anything not listed prints as the calm pill.
const PRIORITY_PILL_CLASSES = { HIGH: 'high', SAME_DAY: 'same-day' };

// From the one shared jobStatuses.json (also read by the client's
// PRIORITY_OPTIONS, client/src/components/jobcard/constants.js).
const PRIORITY_LABELS = Object.fromEntries(jobStatuses.priorities.map(p => [p.value, p.label]));

function tagName(category, value) {
  if (value == null || value === '') return '';
  const row = tagQueries.getByValue.get(category, value);
  return row ? row.name : value;
}

// Build friendly, pre-formatted data for the generated job card printout
// (rendered by renderJobCardHtml in utils/jobCardHtml.js). `jc` is the raw
// jobcards row. `canManage` gates the customer company name — non-management
// requesters never see who the job is for, same as the live job card.
function buildJobCardView(jobcardId, jc, canManage = false) {
  const rows = jobItemQueries.getByJobcard.all(jobcardId);

  // Read the Job Files and Customer Property folders once so each part's drawing
  // and customer-property field can show the actual file(s) attached to it (or
  // flag a missing one). A folder that is missing or empty means every declared
  // drawing / property there shows missing. When no storage location is set, or
  // it can't be reached, nothing is known — so the card says the files weren't
  // checked (and why) instead of calling them missing, the same as the job screen.
  const { listCategoryFileNames } = require('./jobcard-files');
  const listing = listCategoryFileNames(jobcardId, ['job-files', 'customer-property-files']);
  let filesNotChecked = null;
  if (listing === null) {
    const base = getSettings().job_folders_base;
    filesNotChecked = base && base.trim() ? 'unreachable' : 'not set';
  }
  const folderNames = listing || {};
  const jobFileNames = folderNames['job-files'] || [];
  const customerPropertyNames = folderNames['customer-property-files'] || [];

  // rows is ordered by item_number ascending (jobItemQueries.getByJobcard.all),
  // so this loop's own index gives each part's 1-based position — what the
  // printed card shows, never the stored (possibly gapped) item_number.
  const items = rows.map((r, idx) => {
    const dVals = splitAnswer(r.drawings_type);
    const drawingsIsNa = isNaAnswer(r.drawings_type);
    const drawings = drawingsIsNa
      ? 'N/A'
      : [...new Set(dVals.map(v => tagName('drawings', v)))].join(', ');
    // For a declared drawing, find the file(s) attached to this exact part and
    // show their human-readable names; "missing" when none are on disk yet.
    const drawingFiles = drawingsIsNa ? [] : itemFileDisplayNames(jobFileNames, r.id);
    const drawingsMissing = !filesNotChecked && !drawingsIsNa && drawingFiles.length === 0;
    const treatments = parseTreatments(r.treatments).map(t => {
      const name = tagName('treatment', t.value);
      return t.supplierName ? `${name} - ${t.supplierName}` : name;
    });
    // Customer property is a per-part field on screen, so the printout shows it
    // per part too (same friendly-name + N/A handling as drawings).
    const cpVals = splitAnswer(r.customer_property);
    const customerPropertyIsNa = isNaAnswer(r.customer_property);
    const customerProperty = customerPropertyIsNa
      ? 'N/A'
      : [...new Set(cpVals.map(v => tagName('customer_property', v)))].join(', ');
    // For declared customer property, list the file(s) attached to this exact part
    // (or flag "missing"), the same way drawings does.
    const propertyFiles = customerPropertyIsNa ? [] : itemFileDisplayNames(customerPropertyNames, r.id);
    const customerPropertyMissing = !filesNotChecked && !customerPropertyIsNa && propertyFiles.length === 0;
    return {
      number: r.item_number,
      position: idx + 1,
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
      customerPropertyIsNa,
      propertyFiles,
      customerPropertyMissing,
      filesNotChecked
    };
  });

  const priorityKey = (jc.priority || 'NONE').toUpperCase();
  const priorityLabel = priorityKey === 'NONE' ? null : (PRIORITY_LABELS[priorityKey] || priorityKey);

  return {
    jobNumber: jc.job_number,
    description: jc.description || '',
    priorityLabel,
    priorityClass: PRIORITY_PILL_CLASSES[priorityKey] || 'normal',
    // The created moment is read on the office's day, same as the printout's
    // other office-day fields; the due date is a bare calendar day, never read
    // through a Date/time zone.
    dateCreated: formatDayAu(officeDateString(new Date(jc.created_at))),
    dueDate: formatDayAu(jc.due_date),
    // The shop-floor printout shows the company to management requesters so they
    // know whose job it is. Non-management requesters never see the customer —
    // contact name / phone / email are never on the printout for anyone.
    company: customerFields(jc, canManage).companyName || '',
    poNumber: jc.po_number || '',
    quoteReference: jc.quote_reference || '',
    printed: formatDayAu(officeDateString(new Date())),
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
        partQtyText(item.qty), item.description,
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

module.exports = { formatJobcard, customerFields, buildChanges, sanitizeHistoryForRole, createRelatedRecords, parseTreatments, serializeTreatments, partQtyText, buildJobCardView, computeAttachmentWarnings, checkInvoicing, applyInvoicingArchive, tagName, friendlyTagList };
