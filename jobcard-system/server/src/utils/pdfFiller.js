const { PDFDocument } = require('pdf-lib');
const logger = require('./logger');

// Common field name mappings: PDF form field name patterns → job data keys
const FIELD_MAPPINGS = {
  // Job number
  job_number: 'jobNumber',
  jobnumber: 'jobNumber',
  'job number': 'jobNumber',
  job_no: 'jobNumber',
  jobno: 'jobNumber',
  // Company / customer
  company: 'companyName',
  company_name: 'companyName',
  companyname: 'companyName',
  customer: 'companyName',
  // Contact
  contact: 'contactName',
  contact_name: 'contactName',
  contactname: 'contactName',
  // Date (today, the day the form is printed)
  date: 'date',
  // Date the job was created
  date_created: 'dateCreated',
  datecreated: 'dateCreated',
  created: 'dateCreated',
  created_date: 'dateCreated',
  createddate: 'dateCreated',
  // Quality level
  quality_level: 'qualityLevel',
  qualitylevel: 'qualityLevel',
  qa_level: 'qualityLevel',
  qalevel: 'qualityLevel',
  // Status
  status: 'status',
  // Description
  description: 'description',
  job_description: 'description',
  // Job type
  job_type: 'jobType',
  jobtype: 'jobType',
  // Priority
  priority: 'priority',
  // Due date
  due_date: 'dueDate',
  duedate: 'dueDate',
  // PO / Quote
  po_number: 'poNumber',
  ponumber: 'poNumber',
  po: 'poNumber',
  quote_reference: 'quoteReference',
  quotereference: 'quoteReference',
  quote_ref: 'quoteReference',
  quoteref: 'quoteReference',
  // Drawings
  drawings_type: 'drawingsType',
  drawingstype: 'drawingsType',
  drawings: 'drawingsType',
  // Customer property
  customer_property: 'customerProperty',
  customerproperty: 'customerProperty',
  // Treatment (aggregate across all items, formatted "Treatment - Supplier, ...")
  treatment: 'treatmentRequired',
  treatment_required: 'treatmentRequired',
  treatmentrequired: 'treatmentRequired',
  // Repeat job
  repeat_job: 'repeatJob',
  repeatjob: 'repeatJob',
  repeat_job_reference: 'repeatJobReference',
  repeatjobreference: 'repeatJobReference',
  repeat_ref: 'repeatJobReference',
  repeatref: 'repeatJobReference'
};

// Regex for item fields: item_1_number, item_2_qty, item_3_description, item_1_job_type, item_1_material, item_1_treatment, item_1_drawings
const ITEM_FIELD_REGEX = /^item_(\d+)_(number|qty|description|job_type|material|treatment|drawings)$/;

function formatTreatments(treatments) {
  if (!Array.isArray(treatments) || treatments.length === 0) return '';
  return treatments.map(t => {
    const name = t.value === 'OTHER' ? (t.otherText || 'Other') : t.value;
    return t.supplierName ? `${name} - ${t.supplierName}` : name;
  }).join(', ');
}

// PDF form fields usually carry a standard font (WinAnsi/Latin-1) that can only
// draw a limited character set. A single unencodable character (a smart quote
// pasted into a company name, an arrow, an em dash) makes pdf-lib throw at save
// time and the WHOLE form falls back to blank. Map the common offenders to safe
// equivalents and drop anything else outside Latin-1 so a stray glyph can never
// wipe out an entire job card.
const CHAR_REPLACEMENTS = {
  '→': '-', // → arrow
  '‘': "'", '’': "'", // ' ' smart single quotes
  '“': '"', '”': '"', // " " smart double quotes
  '–': '-', '—': '-', // – — en/em dash
  '…': '...', // … ellipsis
  '•': '*', // • bullet
  ' ': ' ', // non-breaking space
};
function toPdfSafe(value) {
  let out = '';
  for (const ch of String(value)) {
    if (CHAR_REPLACEMENTS[ch] !== undefined) out += CHAR_REPLACEMENTS[ch];
    else if (ch.codePointAt(0) <= 0xff) out += ch; // Latin-1 — encodable
    // anything else is dropped
  }
  return out;
}

/**
 * Fill PDF form fields with job data.
 * Returns filled PDF buffer, or the original buffer if no fields or on error.
 * @param {Buffer} sourceBuffer - Source PDF file buffer
 * @param {Object} jobData - Job card data with keys matching FIELD_MAPPINGS
 * @returns {Promise<Buffer>} Filled PDF buffer
 */
async function fillPdfTemplate(sourceBuffer, jobData) {
  try {
    const pdfDoc = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });
    let form;
    try {
      form = pdfDoc.getForm();
    } catch {
      // No form in this PDF
      return sourceBuffer;
    }

    const fields = form.getFields();
    if (fields.length === 0) {
      return sourceBuffer;
    }

    const items = Array.isArray(jobData.items) ? jobData.items : [];

    let filled = false;
    for (const field of fields) {
      const fieldName = field.getName().toLowerCase().trim();

      // Check for item fields first (item_N_number, item_N_qty, item_N_description, item_N_job_type, item_N_material, item_N_treatment)
      const itemMatch = fieldName.match(ITEM_FIELD_REGEX);
      if (itemMatch) {
        const index = parseInt(itemMatch[1], 10) - 1; // 1-based → 0-based
        const prop = itemMatch[2];
        const item = items[index];
        if (item) {
          let value;
          if (prop === 'treatment') {
            value = formatTreatments(item.treatments);
          } else {
            const keyMap = { number: 'itemNumber', qty: 'qty', description: 'description', job_type: 'jobType', material: 'material', drawings: 'drawingsType' };
            value = item[keyMap[prop]];
          }
          if (value !== null && value !== undefined && value !== '') {
            try {
              if (typeof field.setText === 'function') {
                field.setText(toPdfSafe(value));
                filled = true;
              }
            } catch {
              // Field might be read-only or incompatible
            }
          }
        }
        continue;
      }

      // Standard field mappings
      const dataKey = FIELD_MAPPINGS[fieldName];

      if (dataKey && jobData[dataKey]) {
        try {
          if (typeof field.setText === 'function') {
            field.setText(toPdfSafe(jobData[dataKey]));
            filled = true;
          }
        } catch {
          // Field might be read-only or incompatible
        }
      }
    }

    if (!filled) {
      return sourceBuffer;
    }

    const filledBytes = await pdfDoc.save();
    return Buffer.from(filledBytes);
  } catch (err) {
    logger.error({ err }, 'PDF fill failed, returning original');
    return sourceBuffer;
  }
}

module.exports = { fillPdfTemplate };
