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
  // Date
  date: 'date',
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
  // Treatment
  treatment: 'treatmentRequired',
  treatment_required: 'treatmentRequired',
  treatmentrequired: 'treatmentRequired',
  treatment_other: 'treatmentOther',
  treatmentother: 'treatmentOther',
  // Repeat job
  repeat_job: 'repeatJob',
  repeatjob: 'repeatJob',
  repeat_job_reference: 'repeatJobReference',
  repeatjobreference: 'repeatJobReference',
  repeat_ref: 'repeatJobReference',
  repeatref: 'repeatJobReference',
  // Notes
  notes: 'notes'
};

/**
 * Fill PDF form fields with job data.
 * Returns filled PDF buffer, or the original buffer if no fields or on error.
 * @param {Buffer} sourceBuffer - Source PDF file buffer
 * @param {Object} jobData - Job card data with keys matching FIELD_MAPPINGS (see docs/QA-PDF-TEMPLATE-GUIDE.md)
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

    let filled = false;
    for (const field of fields) {
      const fieldName = field.getName().toLowerCase().trim();
      const dataKey = FIELD_MAPPINGS[fieldName];

      if (dataKey && jobData[dataKey]) {
        try {
          if (typeof field.setText === 'function') {
            field.setText(String(jobData[dataKey]));
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
