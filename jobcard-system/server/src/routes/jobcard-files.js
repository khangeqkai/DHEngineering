const express = require('express');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const {
  jobcardQueries,
  contactQueries,
  getSettings,
  recordHistory
} = require('../db/database');
const { sanitizeFolderName, isWithinBase } = require('../utils/folderCreation');
const { handleValidationErrors } = require('../middleware/validation');
const { body, param } = require('express-validator');

const router = express.Router();

const VALID_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif'];

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'text/xml',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

// Stable URL slugs ↔ on-disk folder names.
const CATEGORY_FOLDER = {
  'job-files': 'Job Files',
  'qa-form-files': 'QA Forms',
  'customer-property-files': 'Customer Property'
};

const CATEGORIES = Object.keys(CATEGORY_FOLDER);

// Cap binary upload at 30 MB so a single phone-photo upload can't tie up the
// request thread; the global express.json() ceiling of 50 MB is intentionally
// looser to accommodate other JSON payloads. Base64 encoding inflates bytes by
// ~4/3, so the raw-string ceiling is ceil(30 MB * 4 / 3).
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_FILE_DATA_CHARS = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3);

/**
 * Resolve the on-disk category folder for a job card.
 * Returns { folderPath, jobcard } on success, or { error, status } on failure.
 */
function resolveCategoryFolder(jobcardId, category) {
  const settings = getSettings();
  const basePath = settings.job_folders_base;
  if (!basePath || !basePath.trim()) {
    return { error: 'Job folders base path not configured', status: 400 };
  }

  const jobcard = jobcardQueries.getById.get(jobcardId);
  if (!jobcard) {
    return { error: 'Job card not found', status: 404 };
  }

  let companyName = null;
  if (jobcard.contact_id) {
    const contact = contactQueries.getById.get(jobcard.contact_id);
    if (contact) companyName = contact.company_name;
  }
  if (!companyName) companyName = jobcard.company_name;
  if (!companyName) {
    return { error: 'No company associated with this job card', status: 400 };
  }

  const sanitizedCompany = sanitizeFolderName(companyName);
  const sanitizedJob = sanitizeFolderName(jobcard.job_number);
  const subfolder = CATEGORY_FOLDER[category];
  if (!sanitizedCompany || !sanitizedJob || !subfolder) {
    return { error: 'Invalid path components', status: 400 };
  }

  const folderPath = path.join(basePath.trim(), sanitizedCompany, sanitizedJob, subfolder);
  if (!isWithinBase(basePath.trim(), folderPath)) {
    return { error: 'Path traversal detected', status: 403 };
  }

  return { folderPath, jobcard };
}

/**
 * Build a unique on-disk filename. Prefix with a timestamp so two uploads
 * of the same name don't collide.
 */
function buildStorageFilename(folderPath, displayName) {
  const ext = path.extname(displayName);
  const base = path.basename(displayName, ext);
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  let candidate = `${stamp}_${base}${ext}`;
  let counter = 1;
  while (fs.existsSync(path.join(folderPath, candidate))) {
    candidate = `${stamp}_${base}_${counter}${ext}`;
    counter += 1;
  }
  return candidate;
}

function listFolderFiles(folderPath) {
  if (!fs.existsSync(folderPath)) return [];
  return fs.readdirSync(folderPath)
    .map(name => {
      const full = path.join(folderPath, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        return null;
      }
      if (!stat.isFile()) return null;
      const ext = path.extname(name).toLowerCase();
      if (!VALID_EXTENSIONS.includes(ext)) return null;
      return {
        name,
        size: stat.size,
        mimeType: MIME_TYPES[ext] || 'application/octet-stream',
        modified: stat.mtime.toISOString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

const validateCategory = [
  param('category')
    .isIn(CATEGORIES)
    .withMessage(`category must be one of: ${CATEGORIES.join(', ')}`),
  handleValidationErrors
];

const validateFilenameParam = [
  param('filename')
    .isString().trim().notEmpty().withMessage('Filename required')
    .custom(value => {
      if (value.includes('/') || value.includes('\\') || value.includes('..')) {
        throw new Error('Filename must not contain path separators');
      }
      return true;
    }),
  handleValidationErrors
];

const validateUploadBody = [
  body('filename')
    .isString().trim().notEmpty().withMessage('Filename is required')
    .custom((value) => {
      if (value.includes('/') || value.includes('\\') || value.includes('..')) {
        throw new Error('Filename must not contain path separators');
      }
      const ext = path.extname(value).toLowerCase();
      if (!VALID_EXTENSIONS.includes(ext)) {
        throw new Error('Invalid file extension');
      }
      return true;
    }),
  body('fileData')
    .isString().notEmpty().withMessage('File data is required')
    .bail()
    .custom((value) => {
      if (value.length > MAX_FILE_DATA_CHARS) {
        throw new Error('File too large (max 30 MB)');
      }
      return true;
    }),
  handleValidationErrors
];

// ─── List files in a category folder (disk-first) ───
router.get('/:id/files/:category', authenticate, validateCategory, (req, res) => {
  try {
    const { id, category } = req.params;
    const folderRes = resolveCategoryFolder(id, category);
    if (folderRes.error) return res.status(folderRes.status).json({ error: folderRes.error });
    res.json(listFolderFiles(folderRes.folderPath));
  } catch (err) {
    logger.error({ err }, 'List jobcard files error');
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ─── Read a single file (returns base64) ───
router.get('/:id/files/:category/:filename', authenticate, validateCategory, validateFilenameParam, (req, res) => {
  try {
    const { id, category, filename } = req.params;
    const folderRes = resolveCategoryFolder(id, category);
    if (folderRes.error) return res.status(folderRes.status).json({ error: folderRes.error });

    const filePath = path.join(folderRes.folderPath, filename);
    if (!isWithinBase(folderRes.folderPath, filePath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    const fileData = fs.readFileSync(filePath);
    res.json({
      name: filename,
      mimeType: MIME_TYPES[ext] || 'application/octet-stream',
      data: fileData.toString('base64')
    });
  } catch (err) {
    logger.error({ err }, 'Get jobcard file data error');
    res.status(500).json({ error: 'Failed to get file data' });
  }
});

// ─── Save a file (shared by file-upload + camera flows) ───
function saveFile({ jobcardId, category, displayName, buffer, source, req, res }) {
  const folderRes = resolveCategoryFolder(jobcardId, category);
  if (folderRes.error) return res.status(folderRes.status).json({ error: folderRes.error });

  if (!fs.existsSync(folderRes.folderPath)) {
    fs.mkdirSync(folderRes.folderPath, { recursive: true });
  }

  const storageFilename = buildStorageFilename(folderRes.folderPath, displayName);
  const targetPath = path.join(folderRes.folderPath, storageFilename);
  if (!isWithinBase(folderRes.folderPath, targetPath)) {
    return res.status(403).json({ error: 'Path traversal detected' });
  }

  fs.writeFileSync(targetPath, buffer);

  recordHistory('jobcard', jobcardId, 'upload_file', req.user.userId, req.user.name || req.user.username,
    { file: { from: null, to: displayName } },
    { destination: CATEGORY_FOLDER[category], source }
  );

  const stat = fs.statSync(targetPath);
  const ext = path.extname(storageFilename).toLowerCase();
  return res.status(201).json({
    name: storageFilename,
    size: stat.size,
    mimeType: MIME_TYPES[ext] || 'application/octet-stream',
    modified: stat.mtime.toISOString()
  });
}

// ─── Upload (base64) → category folder ───
router.post('/:id/files/:category/upload', authenticate, validateCategory, validateUploadBody, (req, res) => {
  try {
    const { id, category } = req.params;
    const { filename, fileData } = req.body;

    return saveFile({
      jobcardId: id,
      category,
      displayName: filename,
      buffer: Buffer.from(fileData, 'base64'),
      source: 'upload',
      req,
      res
    });
  } catch (err) {
    logger.error({ err }, 'Upload-to-files error');
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

module.exports = router;
