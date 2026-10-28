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
  companyQueries,
  getSettings
} = require('../db/database');
const { billingBlockedByTime } = require('../utils/timeEntryHelpers');
const logger = require('../utils/logger');
const { readTrailEntry } = require('../db/trailEntries');
const { diffFields } = require('../utils/historyChanges');
const { officeDateString } = require('../utils/officeTime');
const { formatDayAu } = require('../shared/calendarDate');
const { splitAnswer, isNaAnswer, declaresAnswer } = require('../shared/lineItemAnswers');
const { partTagRegex, partTagWithSpaceRegex } = require('../shared/partFileTag');

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
  const tagAtEnd = partTagRegex(code);
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
  const tagAtEnd = partTagRegex(code);
  const stripTag = partTagWithSpaceRegex(code);
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
  if (!settings.job_folders_base) {
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

// ─── Status moves (shared by PUT /jobcards/:id and PATCH /jobcards/:id/status) ───
// Everything that rides along with a status move, worked out once for both routes
// that can move one, with the same checks in the same order before any write — see
// docs/notes/jobs-and-status.md:
//   - every billing move (To be Invoiced, Call for Payment, Paid – Archived) is refused
//     while the job's time is still moving, and the close-out questions (missing files,
//     missing sign-offs) are asked when the job first reaches billing and again when it
//     is archived;
//   - Paid – Archived (closedStatus) also files the job away (archived = 1) and locks it;
//   - the first move to Call for Payment (or straight to Paid – Archived) stamps the
//     invoiced date — the day the bill went out;
//   - moving into Action Required or Paid – Archived remembers where the job was
//     (previous_status), so "Put back" and unarchive can return it there;
//   - a customer marked as needing a PO number is asked about before a billing move while
//     the job has no PO number.
// checkStatusMove returns `refusal` (a `{ status, body }` to send as-is) when the move
// must stop, otherwise a plan for applyStatusMove to carry out inside the caller's own
// write transaction. `confirms` holds the "are you sure" / "carry on anyway" flags the client resends
// with; `after` is what the job's PO number and customer will be once this write lands
// (PUT can change the PO number in the same save), defaulting to what is stored.
function checkStatusMove(existing, newStatus, confirms = {}, after = {}) {
  const none = { refusal: null, moved: false };
  if (newStatus === existing.status) return none;

  const shouldArchive = newStatus === jobStatuses.closedStatus && existing.archived === 0;
  const billing = jobStatuses.billingStatuses;
  const intoBilling = billing.includes(newStatus);
  // The close-out questions are asked when the job first reaches billing (whichever
  // billing status it jumps to) and again when it is archived — not on every step
  // between, where nothing they check could have changed unseen.
  const asksCloseOut = intoBilling && (!billing.includes(existing.status) || shouldArchive);

  if (intoBilling) {
    // Hard block: a running timer, a clock still awaiting its worker's answer, or a
    // just-stopped one whose form isn't saved yet can't be confirmed away like a
    // missing attachment can — refuse before any write, and before the soft
    // checkpoints below.
    const timeBlock = billingBlockedByTime(existing.id);
    if (timeBlock) return { refusal: { status: 409, body: { error: timeBlock } } };
  }

  // The "are you sure?" question for the moments that bill or lock the job — first
  // reaching billing, and archiving — asked only once the hard blocks above have
  // passed, so nobody answers a question for a move that was going to be refused
  // anyway. The client asks it (with a fresh total) and resends with confirmBilling.
  if (asksCloseOut && confirms.confirmBilling !== true) {
    return { refusal: { status: 409, body: { error: 'CONFIRM_BILLING', archiving: shouldArchive } } };
  }

  // Soft close-out checkpoint: stop before any write and report the gaps instead of
  // writing — unless the caller already confirmed "carry on anyway". When the job
  // declared files but the storage location can't be reached, nothing is known
  // either way, so it still stops and asks (FILES_UNREACHABLE) rather than letting an
  // unchecked job be billed silently.
  if (asksCloseOut && confirms.confirmMissingAttachments !== true) {
    const items = jobItemQueries.getByJobcard.all(existing.id);
    const warnings = computeAttachmentWarnings(existing.id, items);
    if (warnings.hasAny || warnings.filesUnreachable) {
      const error = warnings.filesUnreachable ? 'FILES_UNREACHABLE' : 'MISSING_ATTACHMENTS';
      return { refusal: { status: 409, body: { error, attachmentWarnings: warnings } } };
    }
  }

  // Second soft close-out checkpoint, same shape as the attachments one above:
  // finished runs that needed the Critical sign-off (critical_at_finish = 1) but
  // are still missing one of the four inspection answers. A warning, not a hard
  // block — only an admin can bill, so this is the admin's own confirm.
  let inspectionConfirmedCount = 0;
  if (asksCloseOut) {
    const missingInspectionRows = timeEntryQueries.getMissingInspectionByJobcard.all(existing.id);
    if (missingInspectionRows.length > 0 && confirms.confirmMissingInspection !== true) {
      const inspectionWarnings = missingInspectionRows.map(row => ({
        id: row.id,
        workerName: row.user_name,
        startTime: row.start_time,
        endTime: row.end_time,
        itemNumber: row.item_number
      }));
      return { refusal: { status: 409, body: { error: 'MISSING_INSPECTION', inspectionWarnings } } };
    }
    inspectionConfirmedCount = missingInspectionRows.length;
  }

  // Third soft checkpoint: a billing move for a customer whose accounts won't take an
  // invoice without their purchase order number, while the job has none. Asked, never
  // blocked — the PO may have come by phone or on paper.
  const poNumber = after.poNumber !== undefined ? after.poNumber : existing.po_number;
  const companyId = after.companyId !== undefined ? after.companyId : existing.company_id;
  const poMissing = intoBilling
    && !String(poNumber || '').trim()
    && companyId != null
    && companyQueries.getById.get(companyId)?.requires_po === 1;
  if (poMissing && confirms.confirmMissingPo !== true) {
    return { refusal: { status: 409, body: { error: 'MISSING_PO' } } };
  }

  // Where the job was is remembered on the way into Action Required or Paid – Archived,
  // and forgotten on the way out of either. Action Required is a flag over the job's
  // real status, so archiving a flagged job keeps the status from before the flag —
  // unarchiving then returns it there, not to the flag.
  const remembering = [jobStatuses.alertStatus, jobStatuses.closedStatus];
  let previousStatus = existing.previous_status ?? null;
  if (remembering.includes(newStatus)) {
    const flagged = existing.status === jobStatuses.alertStatus && existing.previous_status;
    previousStatus = flagged ? existing.previous_status : existing.status;
  } else if (remembering.includes(existing.status)) {
    previousStatus = null;
  }

  const stampsInvoicedDate = !existing.invoiced_date
    && (newStatus === jobStatuses.billedStatus || newStatus === jobStatuses.closedStatus);

  return {
    refusal: null,
    moved: true,
    shouldArchive,
    previousStatus,
    invoicedDate: stampsInvoicedDate ? new Date().toISOString() : (existing.invoiced_date ?? null),
    stampsInvoicedDate,
    inspectionConfirmedCount,
    carriedOnWithoutPo: poMissing
  };
}

// Carries out checkStatusMove's plan — call from inside the caller's own write
// transaction, after the status itself is written — and returns the history change
// entries to fold into the caller's own `changes` object. No-ops (and returns {})
// when the status didn't move. The remembered status is bookkeeping, not an edit,
// so it is never put in the trail.
function applyStatusMove(move, userId, jobcardId) {
  if (!move.moved) return {};
  jobcardQueries.setStatusBookkeeping.run(move.previousStatus, move.invoicedDate, jobcardId);
  const changes = {};
  if (move.stampsInvoicedDate) changes.invoicedDate = { from: null, to: move.invoicedDate };
  if (move.shouldArchive) {
    jobcardQueries.archive.run(userId, jobcardId);
    changes.archived = { from: false, to: true };
  }
  if (move.inspectionConfirmedCount > 0) {
    changes.inspectionSignOff = {
      from: `${move.inspectionConfirmedCount} run(s) unanswered`,
      to: move.shouldArchive ? 'archived anyway' : 'billed anyway'
    };
  }
  if (move.carriedOnWithoutPo) {
    // Its own key, not poNumber: a PUT can carry a real PO number change in the same entry.
    changes.missingPo = { from: 'not entered', to: 'carried on anyway' };
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

// Whether the job's customer needs a PO number for invoicing — read live from the
// customer (a saved job's screen has no customer list loaded to look it up in), so
// ticking or unticking the customer shows on every one of their jobs at once.
// Management only, like the rest of the customer's details.
function customerRequiresPo(row, canManage) {
  if (!canManage || row.company_id == null) return false;
  return companyQueries.getById.get(row.company_id)?.requires_po === 1;
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
    customerRequiresPo: customerRequiresPo(row, canManage),
    qualityLevel: row.quality_level,
    priority: row.priority,
    poNumber: row.po_number,
    description: row.description,
    dueDate: row.due_date,
    repeatJobReference: row.repeat_job_reference,
    invoicedDate: row.invoiced_date,
    previousStatus: row.previous_status ?? null,
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
    ['description', 'description'],
    ['repeat_job_reference', 'repeatJobReference'],
  ];

  // Only fields the caller actually sent are compared at all — this is a partial
  // update, so a field left out of `data` means "don't touch it", not "clear it".
  const fieldsToTrack = fieldSpecs
    .filter(([, reqField]) => data[reqField] !== undefined)
    .map(([dbField, reqField]) => [dbField, reqField, data[reqField]]);

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
    filesNotChecked = base ? 'unreachable' : 'not set';
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
      // The create route has already refused unknown/archived workers and repeats.
      jobAssigneeQueries.create.run(`assignee:${uuidv4()}`, jobcardId, userId);
    }
  }
}

// Reads every row's two JSON columns through readTrailEntry. `shape(h, read)` builds one
// reply entry. A row whose stored JSON is damaged is left out (never a 500) and the
// count is logged once per request, with the route's name.
function readEntries(history, shape, route) {
  let unreadable = 0;
  const entries = [];
  for (const h of history) {
    const read = readTrailEntry(h);
    if (!read) { unreadable++; continue; }
    entries.push(shape(h, read));
  }
  if (unreadable > 0) logger.warn({ route, unreadable }, 'Skipped trail entries whose stored details could not be read');
  return entries;
}

module.exports = { readEntries, formatJobcard, customerFields, buildChanges, sanitizeHistoryForRole, createRelatedRecords, parseTreatments, serializeTreatments, partQtyText, buildJobCardView, computeAttachmentWarnings, checkStatusMove, applyStatusMove, tagName, friendlyTagList };
