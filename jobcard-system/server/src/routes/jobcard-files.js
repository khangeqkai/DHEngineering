const express = require('express');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const {
  jobcardQueries,
  jobItemQueries,
  companyQueries,
  getSettings,
  recordHistory
} = require('../db/database');
const { sanitizeFolderName, isWithinBase, resolveCompanyFolder, idSlug } = require('../utils/folderCreation');
const { decodeBase64Strict, assertMatchesExtension } = require('../utils/fileValidation');
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
  // The customer's current name wins over the name frozen onto the job, so a job
  // saved under the old name still resolves to the folder as it stands today.
  const companyId = jobcard.company_id || null;
  let companyName = null;
  if (companyId) {
    const company = companyQueries.getById.get(companyId);
    if (company) companyName = company.name;
  }
  if (!companyName) companyName = jobcard.company_name;
  if (!companyName) {
    return { error: 'No company associated with this job card', status: 400 };
  }

  const companyFolder = resolveCompanyFolder(base, companyId, companyName);
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
 * Strip the trailing " [code]" tag (and any " (n)" clash suffix) that the upload
 * route bakes onto a stored filename, returning the clean human-readable name the
 * user originally uploaded ("ABC [p550e8400].pdf" → "ABC.pdf"). Used when showing
 * a file's real name and when re-tagging a file for a different part.
 */
function stripStorageTag(name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  return `${base.replace(/ \[[^\]]+\](?: \(\d+\))?$/, '')}${ext}`;
}

/**
 * Regex that matches a part's "[p{code}]" tag only at the END of a base name
 * (optionally followed by a " (n)" clash suffix) — the exact spot the upload
 * route writes it, so a file whose human name merely contains the code can't
 * masquerade as that part's attachment.
 */
function partTagRegex(code) {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\[${escaped}\\](?: \\(\\d+\\))?$`);
}

/**
 * Annotate a list of file objects with which line item (if any) each belongs to,
 * by matching the stored "[p{code}]" tag against every part on the job. A file with
 * no matching part tag (e.g. a "[timestamp]" job-level file) comes back as
 * whole-job (itemId: null). Adds `displayName` (tag stripped), `itemId`, and
 * `itemNumber` to each file. All filename-tag knowledge stays server-side.
 */
function resolveFileOwners(jobcardId, files) {
  const items = jobItemQueries.getByJobcard.all(jobcardId) || [];
  const parts = items
    .map(it => ({ itemId: it.id, itemNumber: it.item_number, code: partFileCode(it.id) }))
    .filter(p => p.code)
    .map(p => ({ ...p, re: partTagRegex(p.code) }));
  return files.map(f => {
    const base = f.name.slice(0, f.name.length - path.extname(f.name).length);
    const owner = parts.find(p => p.re.test(base)) || null;
    return {
      ...f,
      displayName: stripStorageTag(f.name),
      itemId: owner ? owner.itemId : null,
      itemNumber: owner ? owner.itemNumber : null
    };
  });
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

/**
 * Returned quality forms are renamed to a clean, predictable "Completed Form N"
 * regardless of what the scanner/camera called the file, so the QA Forms list
 * reads "Completed Form 1, 2, 3…" instead of "scan001"/"photo_…". The next
 * number is one past the highest existing "Completed Form N" in the folder
 * (gaps from any future deletion are left as-is; numbering only goes forward).
 * The timestamp tag is still appended by buildStorageFilename, so the
 * returned-form detection (and collision safety) is unchanged.
 */
function nextQaFormNumber(folderPath) {
  let max = 0;
  try {
    for (const name of fs.readdirSync(folderPath)) {
      const ext = path.extname(name);
      const base = name.slice(0, name.length - ext.length);
      const m = base.match(/^Completed Form (\d+)\b/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // Unreadable/missing folder → treat as empty, start at 1.
  }
  return max + 1;
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
    // Tag each file with the part it belongs to (and its clean display name) so the
    // paperwork hub can show a "For:" picker and reassign files to a part.
    res.json(resolveFileOwners(id, listFolderFiles(folderRes.folderPath)));
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

  // A file brought back into the QA Forms folder is a completed inspection form.
  // Give it a clean "Completed Form N" name (counting up) so the list is tidy,
  // dropping whatever random name the scanner/camera produced. Other folders keep
  // the uploaded name. QA forms are always job-level (no line-item code).
  let effectiveName = displayName;
  if (category === 'qa-form-files' && !partFileCode(itemId)) {
    const ext = path.extname(displayName);
    effectiveName = `Completed Form ${nextQaFormNumber(folderRes.folderPath)}${ext}`;
  }

  const storageFilename = buildStorageFilename(folderRes.folderPath, effectiveName, partFileCode(itemId));
  const targetPath = path.join(folderRes.folderPath, storageFilename);
  if (!isWithinBase(folderRes.folderPath, targetPath)) {
    return res.status(403).json({ error: 'Path traversal detected' });
  }

  fs.writeFileSync(targetPath, buffer);

  recordHistory('jobcard', jobcardId, 'upload_file', req.user.userId, req.user.name || req.user.username,
    { file: { from: null, to: effectiveName } },
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

    let buffer;
    try {
      buffer = decodeBase64Strict(fileData);
      assertMatchesExtension(buffer, filename);
    } catch (decodeErr) {
      return res.status(400).json({ error: decodeErr.message });
    }

    return saveFile({
      jobcardId: id,
      category,
      displayName: filename,
      buffer,
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

// ─── Reassign a file to a part (or back to whole-job) by re-tagging its name ───
// Renames the stored file so its trailing "[p{code}]" (part) / "[timestamp]"
// (whole-job) tag matches the chosen owner. This is what makes a file added
// through the paperwork hub count toward a part's missing-attachment warning.
const validateAssignBody = [
  body('itemId')
    .optional({ nullable: true })
    .isString().bail()
    .matches(/^item:[A-Za-z0-9:-]+$/).withMessage('itemId must be a valid item reference'),
  handleValidationErrors
];

router.post('/:id/files/:category/:filename/assign', authenticate, validateCategory, validateFilenameParam, validateAssignBody, (req, res) => {
  try {
    const { id, category, filename } = req.params;
    const itemId = req.body.itemId || null;

    const folderRes = resolveCategoryFolder(id, category);
    if (folderRes.error) return res.status(folderRes.status).json({ error: folderRes.error });

    const currentPath = path.join(folderRes.folderPath, filename);
    if (!isWithinBase(folderRes.folderPath, currentPath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }
    if (!fs.existsSync(currentPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // A chosen part must be a real line item on this job — otherwise a file could
    // be tagged to a part that doesn't exist (and silently never match anything).
    if (itemId) {
      const parts = jobItemQueries.getByJobcard.all(id) || [];
      if (!parts.some(it => it.id === itemId)) {
        return res.status(400).json({ error: 'That part is not on this job card' });
      }
    }

    const cleanName = stripStorageTag(filename);
    const newName = buildStorageFilename(folderRes.folderPath, cleanName, partFileCode(itemId));

    // Already tagged for this owner (same base + tag) → nothing to do. buildStorageFilename
    // adds a " (n)" only on a real clash, so an unchanged owner reproduces the same name.
    if (newName === filename) {
      const [same] = resolveFileOwners(id, listFolderFiles(folderRes.folderPath)).filter(f => f.name === filename);
      return res.json(same || { name: filename });
    }

    const newPath = path.join(folderRes.folderPath, newName);
    if (!isWithinBase(folderRes.folderPath, newPath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }
    fs.renameSync(currentPath, newPath);

    recordHistory('jobcard', id, 'reassign_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: filename, to: newName } },
      { destination: CATEGORY_FOLDER[category], itemId: itemId ?? null }
    );

    const [owned] = resolveFileOwners(id, [{
      name: newName,
      size: fs.statSync(newPath).size,
      mimeType: MIME_TYPES[path.extname(newName).toLowerCase()] || 'application/octet-stream',
      modified: fs.statSync(newPath).mtime.toISOString()
    }]);
    return res.json(owned);
  } catch (err) {
    logger.error({ err }, 'Assign-file error');
    res.status(500).json({ error: 'Failed to reassign file' });
  }
});

// ─── Delete a stored file ───
// Management-only: a file is a job's evidence (drawing, customer property,
// returned quality form), and removing one can silently re-open a part's
// missing-attachment warning, so it follows the same rule as deleting a note.
router.delete('/:id/files/:category/:filename', authenticate, requireManagement, validateCategory, validateFilenameParam, (req, res) => {
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

    fs.unlinkSync(filePath);

    recordHistory('jobcard', id, 'delete_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: stripStorageTag(filename), to: null } },
      { destination: CATEGORY_FOLDER[category], storedName: filename }
    );

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete jobcard file error');
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
module.exports.listCategoryFileNames = listCategoryFileNames;
module.exports.partFileCode = partFileCode;
module.exports.resolveJobFolder = resolveJobFolder;
module.exports.resolveCategoryFolder = resolveCategoryFolder;
