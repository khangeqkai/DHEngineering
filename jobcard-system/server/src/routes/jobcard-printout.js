const express = require('express');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { sanitizeFolderName, isWithinBase } = require('../utils/folderCreation');
const { fillPdfTemplate } = require('../utils/pdfFiller');
const { buildQaFillData } = require('./jobcard-helpers');
const { resolveJobFolder } = require('./jobcard-files');
const { getSettings, updateSettings, recordHistory } = require('../db/database');

// The job card printout is a SINGLE global fillable PDF template, uploaded once by an
// admin. On "Print job card" it is filled with a job's data, saved as one file at the
// top of that job's folder (overwritten each print so it's never stale), and printed.
// It is deliberately NOT a file category, so the missing-attachment scan never sees it.

// Mirror the 30 MB raw-bytes cap used for job-card file uploads (base64 inflates ~4/3).
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_FILE_DATA_CHARS = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3);

const TEMPLATE_SETTING_KEY = 'job_card_template';
const TEMPLATE_DIR_NAME = 'Job Card Template';

// The global template lives at [job_folders_base]/Job Card Template/<file>.pdf, and the
// stored filename is held in the job_card_template setting. Returns null when storage
// isn't configured.
function getTemplateDir() {
  const settings = getSettings();
  const base = settings.job_folders_base;
  if (!base || !base.trim()) return null;
  const dir = path.join(base.trim(), TEMPLATE_DIR_NAME);
  if (!isWithinBase(base.trim(), dir)) return null;
  return dir;
}

// Resolve the current template's on-disk path from the saved setting, or null.
function getTemplateFile() {
  const fileName = getSettings()[TEMPLATE_SETTING_KEY];
  if (!fileName) return null;
  const dir = getTemplateDir();
  if (!dir) return null;
  const filePath = path.join(dir, fileName);
  if (!isWithinBase(dir, filePath)) return null;
  return { filePath, fileName };
}

// ---------------------------------------------------------------------------
// Global template management — mounted under /api/settings/job-card-template
// (admin only; the parent settings router already applies authenticate).
// ---------------------------------------------------------------------------
const templateRouter = express.Router();

// GET — report the configured template filename and whether the file is on disk.
templateRouter.get('/', requireAdmin, (req, res) => {
  try {
    const current = getTemplateFile();
    const exists = !!(current && fs.existsSync(current.filePath));
    res.json({ fileName: current ? current.fileName : null, exists });
  } catch (err) {
    logger.error({ err }, 'Get job card template error');
    res.status(500).json({ error: 'Failed to get job card template' });
  }
});

// POST — upload/replace the global template.
templateRouter.post('/', requireAdmin, (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'fileName and fileData (base64) are required' });
    }
    if (path.extname(fileName).toLowerCase() !== '.pdf') {
      return res.status(400).json({ error: 'The job card template must be a PDF' });
    }
    if (fileData.length > MAX_FILE_DATA_CHARS) {
      return res.status(400).json({ error: 'File is too large (max 30 MB)' });
    }

    const dir = getTemplateDir();
    if (!dir) {
      return res.status(400).json({ error: 'Job folders base path not configured' });
    }

    const sanitizedFileName = sanitizeFolderName(path.parse(fileName).name) + '.pdf';
    const filePath = path.join(dir, sanitizedFileName);
    if (!isWithinBase(dir, filePath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }

    fs.mkdirSync(dir, { recursive: true });

    // Keep exactly one file in the template folder: drop any previously-stored file
    // whose name differs from the new one before writing.
    const prev = getSettings()[TEMPLATE_SETTING_KEY];
    if (prev && prev !== sanitizedFileName) {
      const prevPath = path.join(dir, prev);
      try {
        if (isWithinBase(dir, prevPath) && fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
      } catch (err) {
        logger.error({ err }, 'Failed to remove previous job card template');
      }
    }

    fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));
    updateSettings({ [TEMPLATE_SETTING_KEY]: sanitizedFileName });
    recordHistory('settings', TEMPLATE_SETTING_KEY, 'update', req.user.userId, req.user.name || req.user.username, {
      jobCardTemplate: { from: prev || null, to: sanitizedFileName }
    });

    res.status(201).json({ fileName: sanitizedFileName });
  } catch (err) {
    logger.error({ err }, 'Upload job card template error');
    res.status(500).json({ error: 'Failed to upload job card template' });
  }
});

// DELETE — remove the global template.
templateRouter.delete('/', requireAdmin, (req, res) => {
  try {
    const current = getTemplateFile();
    if (current) {
      try {
        if (fs.existsSync(current.filePath)) fs.unlinkSync(current.filePath);
      } catch (err) {
        logger.error({ err }, 'Failed to delete job card template file');
      }
    }
    const prev = getSettings()[TEMPLATE_SETTING_KEY] || null;
    updateSettings({ [TEMPLATE_SETTING_KEY]: '' });
    recordHistory('settings', TEMPLATE_SETTING_KEY, 'update', req.user.userId, req.user.name || req.user.username, {
      jobCardTemplate: { from: prev, to: null }
    });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete job card template error');
    res.status(500).json({ error: 'Failed to delete job card template' });
  }
});

// ---------------------------------------------------------------------------
// Per-job printout — mounted under /api/jobcards (any authenticated user).
// ---------------------------------------------------------------------------
const printRouter = express.Router();

// POST /api/jobcards/:id/print — fill the global template with this job's data, save
// it as a single file at the job folder root, and return it for printing.
printRouter.post('/:id/print', authenticate, async (req, res) => {
  try {
    const jobRes = resolveJobFolder(req.params.id);
    if (jobRes.error) {
      return res.status(jobRes.status).json({ error: jobRes.error });
    }

    const template = getTemplateFile();
    if (!template || !fs.existsSync(template.filePath)) {
      return res.status(400).json({ error: 'No job card template configured. Upload one in Settings.' });
    }

    const jc = jobRes.jobcard;
    const fillData = buildQaFillData(req.params.id, {
      jobNumber: jc.job_number,
      status: jc.status,
      contactId: jc.contact_id || null,
      companyName: jc.company_name || null,
      contactName: jc.contact_name || null,
      description: jc.description || null,
      priority: jc.priority || 'NONE',
      dueDate: jc.due_date || null,
      qualityLevel: jc.quality_level || null,
      poNumber: jc.po_number || null,
      quoteReference: jc.quote_reference || null,
      repeatJob: jc.is_repeat_job ? 'Yes' : 'No',
      repeatJobReference: jc.repeat_job_reference || null,
      date: new Date().toLocaleDateString('en-AU')
    });

    const sourceBuffer = fs.readFileSync(template.filePath);
    const filledBuffer = await fillPdfTemplate(sourceBuffer, fillData);

    const outName = `Job Card ${sanitizeFolderName(jc.job_number)}.pdf`;
    const outPath = path.join(jobRes.jobFolderPath, outName);
    if (!isWithinBase(jobRes.base, outPath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }

    // The job folder normally already exists; create the chain defensively in case
    // storage was configured after this job was made.
    fs.mkdirSync(jobRes.jobFolderPath, { recursive: true });
    fs.writeFileSync(outPath, filledBuffer);

    recordHistory('jobcard', req.params.id, 'update', req.user.userId, req.user.name || req.user.username, {
      jobCardPrinted: { from: null, to: outName }
    });

    res.json({
      fileName: outName,
      filePath: outPath,
      data: filledBuffer.toString('base64'),
      mimeType: 'application/pdf'
    });
  } catch (err) {
    logger.error({ err }, 'Print job card error');
    res.status(500).json({ error: 'Failed to generate job card printout' });
  }
});

module.exports = printRouter;
module.exports.templateRouter = templateRouter;
