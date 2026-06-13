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
const { sanitizeFolderName, isWithinBase, resolveCompanyFolder, idSlug } = require('../utils/folderCreation');
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
 * Resolve the on-disk job folder ([Company]/[JobNumber]) for a job card, once.
 * Returns { jobFolderPath, base, jobcard } on success, or { error, status } on
 * failure. Read-only — never creates folders. Locating the customer's company
 * folder by the permanent code in its name (not the mutable name) means renaming
 * a customer never strands files; jobs with no linked contact fall back to a
 * name-based lookup.
 */
function resolveJobFolder(jobcardId) {
  const settings = getSettings();
  const basePath = settings.job_folders_base;
  if (!basePath || !basePath.trim()) {
    return { error: 'Job folders base path not configured', status: 400 };
  }

  const jobcard = jobcardQueries.getById.get(jobcardId);
  if (!jobcard) {
    return { error: 'Job card not found', status: 404 };
  }

  const base = basePath.trim();
  const contactId = jobcard.contact_id || null;
  let companyName = null;
  if (contactId) {
    const contact = contactQueries.getById.get(contactId);
    if (contact) companyName = contact.company_name;
  }
  if (!companyName) companyName = jobcard.company_name;
  if (!companyName) {
    return { error: 'No company associated with this job card', status: 400 };
  }

  const companyFolder = resolveCompanyFolder(base, contactId, companyName);
  const sanitizedJob = sanitizeFolderName(jobcard.job_number);
  if (!companyFolder || !sanitizedJob) {
    return { error: 'Invalid path components', status: 400 };
  }

  const jobFolderPath = path.join(companyFolder, sanitizedJob);
  if (!isWithinBase(base, jobFolderPath)) {
    return { error: 'Path traversal detected', status: 403 };
  }

  return { jobFolderPath, base, jobcard };
}

/**
 * Resolve a single category folder for a job card.
 * Returns { folderPath, jobcard } on success, or { error, status } on failure.
 */
function resolveCategoryFolder(jobcardId, category) {
  const jobRes = resolveJobFolder(jobcardId);
  if (jobRes.error) return jobRes;

  const subfolder = CATEGORY_FOLDER[category];
  if (!subfolder) {
    return { error: 'Invalid path components', status: 400 };
  }

  const folderPath = path.join(jobRes.jobFolderPath, subfolder);
  if (!isWithinBase(jobRes.base, folderPath)) {
    return { error: 'Path traversal detected', status: 403 };
  }

  return { folderPath, jobcard: jobRes.jobcard };
}

/**
 * Derive a short, stable code from a line item's permanent id (e.g.
 * "item:550e8400-..." → "p550e8400"). Files for that part are named with this
 * code, so a part's attachments survive any re-numbering of the parts (the
 * visible item number can change; the id never does). Returns null for a value
 * that isn't a persisted item id.
 */
function partFileCode(itemId) {
  if (!itemId || typeof itemId !== 'string' || !itemId.startsWith('item:')) return null;
  const slug = idSlug(itemId);
  return slug ? `p${slug}` : null;
}

/**
 * Build a unique on-disk filename. The identifying code rides at the END of the
 * name, in square brackets, so the human-readable name leads — matching the
 * folder naming scheme (see folderCreation.js).
 * - Per-part files (a drawing / customer property attached to a specific line)
 *   are named "{name} [p{code}]" using the part's stable id code, so each part's
 *   file is identifiable on disk and the missing-file check can match per part
 *   even after the parts are re-numbered.
 * - Job-level files get a 14-digit timestamp tag instead, so two uploads of the
 *   same name don't collide. (The returned-QA-form check relies on an uploaded
 *   form's name differing from a bare template name, which the tag guarantees.)
 * In both cases " (n)" is appended before the extension if the name exists.
 */
function buildStorageFilename(folderPath, displayName, partCode) {
  const ext = path.extname(displayName);
  const base = path.basename(displayName, ext);
  const tag = partCode || new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  let candidate = `${base} [${tag}]${ext}`;
  let counter = 1;
  while (fs.existsSync(path.join(folderPath, candidate))) {
    candidate = `${base} [${tag}] (${counter})${ext}`;
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

// List the on-disk filenames for several of a job's category folders at once,
// resolving the job folder a single time (the customer-area lookup is the
// expensive part, so we don't repeat it per category). Returns a map of
// category → filenames; categories whose folder is missing/empty, or any job
// that can't be resolved, come back as empty arrays. Used by the
// attachment-warnings detector to tell whether a declared drawing / customer
// property / returned QA form actually has a file.
function listCategoryFileNames(jobcardId, categories) {
  const wanted = Array.isArray(categories) ? categories : [categories];
  const empty = Object.fromEntries(wanted.map(c => [c, []]));

  const jobRes = resolveJobFolder(jobcardId);
  if (jobRes.error) return empty;

  const out = {};
  for (const category of wanted) {
    const subfolder = CATEGORY_FOLDER[category];
    if (!subfolder) { out[category] = []; continue; }
    const folderPath = path.join(jobRes.jobFolderPath, subfolder);
    out[category] = isWithinBase(jobRes.base, folderPath)
      ? listFolderFiles(folderPath).map(f => f.name)
      : [];
  }
  return out;
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
  // Optional: when a file is attached to a specific line item, that part's
  // permanent id is baked (as a short code) into the stored filename so the
  // missing-file check can match per part even after the parts are re-numbered.
  body('itemId')
    .optional({ nullable: true })
    .isString().bail()
    .matches(/^item:[A-Za-z0-9:-]+$/).withMessage('itemId must be a valid item reference'),
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
function saveFile({ jobcardId, category, displayName, buffer, source, itemId, req, res }) {
  const folderRes = resolveCategoryFolder(jobcardId, category);
  if (folderRes.error) return res.status(folderRes.status).json({ error: folderRes.error });

  if (!fs.existsSync(folderRes.folderPath)) {
    fs.mkdirSync(folderRes.folderPath, { recursive: true });
  }

  const storageFilename = buildStorageFilename(folderRes.folderPath, displayName, partFileCode(itemId));
  const targetPath = path.join(folderRes.folderPath, storageFilename);
  if (!isWithinBase(folderRes.folderPath, targetPath)) {
    return res.status(403).json({ error: 'Path traversal detected' });
  }

  fs.writeFileSync(targetPath, buffer);

  recordHistory('jobcard', jobcardId, 'upload_file', req.user.userId, req.user.name || req.user.username,
    { file: { from: null, to: displayName } },
    { destination: CATEGORY_FOLDER[category], source, itemId: itemId ?? null }
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
    const { filename, fileData, itemId } = req.body;

    return saveFile({
      jobcardId: id,
      category,
      displayName: filename,
      buffer: Buffer.from(fileData, 'base64'),
      source: 'upload',
      itemId,
      req,
      res
    });
  } catch (err) {
    logger.error({ err }, 'Upload-to-files error');
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

module.exports = router;
module.exports.listCategoryFileNames = listCategoryFileNames;
module.exports.partFileCode = partFileCode;
module.exports.resolveJobFolder = resolveJobFolder;
