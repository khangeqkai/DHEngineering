const express = require('express');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { jobcardQueries, contactQueries, getSettings, recordHistory } = require('../db/database');
const { sanitizeFolderName, isWithinBase } = require('../utils/folderCreation');
const { handleValidationErrors, requiredString } = require('../middleware/validation');
const { param, body } = require('express-validator');

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

/**
 * Generic resolver: returns the full path for a subfolder within a job card's directory.
 * Returns { folderPath } on success, or { error, status } on failure.
 */
function resolveJobSubfolder(jobcardId, subfolder) {
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

  if (!companyName) {
    return { error: 'No company associated with this job card', status: 400 };
  }

  const sanitizedCompany = sanitizeFolderName(companyName);
  const sanitizedJob = sanitizeFolderName(jobcard.job_number);

  if (!sanitizedCompany || !sanitizedJob) {
    return { error: 'Invalid company or job number for folder resolution', status: 400 };
  }

  const folderPath = path.join(basePath.trim(), sanitizedCompany, sanitizedJob, subfolder);

  if (!isWithinBase(basePath.trim(), folderPath)) {
    return { error: 'Path traversal detected', status: 403 };
  }

  return { folderPath };
}

function resolveJobFilesPath(jobcardId) {
  const result = resolveJobSubfolder(jobcardId, 'Job Files');
  if (result.error) return result;
  return { jobFilesPath: result.folderPath };
}

const validateFilename = [
  param('filename')
    .isString()
    .withMessage('Filename must be a string')
    .custom((value) => {
      if (value.includes('/') || value.includes('\\') || value.includes('..')) {
        throw new Error('Filename must not contain path separators');
      }
      return true;
    }),
  handleValidationErrors
];

router.get('/:id/job-files', authenticate, (req, res) => {
  try {
    const result = resolveJobFilesPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { jobFilesPath } = result;

    if (!fs.existsSync(jobFilesPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(jobFilesPath)
      .map(filename => {
        const filePath = path.join(jobFilesPath, filename);
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return null;
          const ext = path.extname(filename).toLowerCase();
          return {
            name: filename,
            size: stats.size,
            modified: stats.mtime,
            mimeType: MIME_TYPES[ext] || 'application/octet-stream'
          };
        } catch {
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json(files);
  } catch (err) {
    logger.error({ err }, 'Get job files error');
    res.status(500).json({ error: 'Failed to list job files' });
  }
});

router.get('/:id/job-files/:filename', authenticate, validateFilename, (req, res) => {
  try {
    const result = resolveJobFilesPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { jobFilesPath } = result;
    const filename = req.params.filename;
    const filePath = path.join(jobFilesPath, filename);

    if (!isWithinBase(jobFilesPath, filePath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileData = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    res.json({
      name: filename,
      mimeType: MIME_TYPES[ext] || 'application/octet-stream',
      data: fileData.toString('base64')
    });
  } catch (err) {
    logger.error({ err }, 'Get job file data error');
    res.status(500).json({ error: 'Failed to get file data' });
  }
});

// ─── QA Forms (on-disk files in QA Forms folder) ───

function resolveQaFormsPath(jobcardId) {
  const result = resolveJobSubfolder(jobcardId, 'QA Forms');
  if (result.error) return result;
  return { qaFormsPath: result.folderPath };
}

router.get('/:id/qa-form-files', authenticate, (req, res) => {
  try {
    const result = resolveQaFormsPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { qaFormsPath } = result;

    if (!fs.existsSync(qaFormsPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(qaFormsPath)
      .map(filename => {
        const filePath = path.join(qaFormsPath, filename);
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return null;
          const ext = path.extname(filename).toLowerCase();
          return {
            name: filename,
            size: stats.size,
            modified: stats.mtime,
            mimeType: MIME_TYPES[ext] || 'application/octet-stream'
          };
        } catch {
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json(files);
  } catch (err) {
    logger.error({ err }, 'Get QA form files error');
    res.status(500).json({ error: 'Failed to list QA form files' });
  }
});

router.get('/:id/qa-form-files/:filename', authenticate, validateFilename, (req, res) => {
  try {
    const result = resolveQaFormsPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { qaFormsPath } = result;
    const filename = req.params.filename;
    const filePath = path.join(qaFormsPath, filename);

    if (!isWithinBase(qaFormsPath, filePath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileData = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    res.json({
      name: filename,
      mimeType: MIME_TYPES[ext] || 'application/octet-stream',
      data: fileData.toString('base64')
    });
  } catch (err) {
    logger.error({ err }, 'Get QA form file data error');
    res.status(500).json({ error: 'Failed to get QA form file data' });
  }
});

// ─── Customer Property (on-disk files in Customer Property folder) ───

function resolveCustomerPropertyPath(jobcardId) {
  const result = resolveJobSubfolder(jobcardId, 'Customer Property');
  if (result.error) return result;
  return { customerPropertyPath: result.folderPath };
}

router.get('/:id/customer-property-files', authenticate, (req, res) => {
  try {
    const result = resolveCustomerPropertyPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { customerPropertyPath } = result;

    if (!fs.existsSync(customerPropertyPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(customerPropertyPath)
      .map(filename => {
        const filePath = path.join(customerPropertyPath, filename);
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return null;
          const ext = path.extname(filename).toLowerCase();
          return {
            name: filename,
            size: stats.size,
            modified: stats.mtime,
            mimeType: MIME_TYPES[ext] || 'application/octet-stream'
          };
        } catch {
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json(files);
  } catch (err) {
    logger.error({ err }, 'Get customer property files error');
    res.status(500).json({ error: 'Failed to list customer property files' });
  }
});

router.get('/:id/customer-property-files/:filename', authenticate, validateFilename, (req, res) => {
  try {
    const result = resolveCustomerPropertyPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { customerPropertyPath } = result;
    const filename = req.params.filename;
    const filePath = path.join(customerPropertyPath, filename);

    if (!isWithinBase(customerPropertyPath, filePath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileData = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();

    res.json({
      name: filename,
      mimeType: MIME_TYPES[ext] || 'application/octet-stream',
      data: fileData.toString('base64')
    });
  } catch (err) {
    logger.error({ err }, 'Get customer property file data error');
    res.status(500).json({ error: 'Failed to get customer property file data' });
  }
});

// ─── File deduplication helper ───

function deduplicateFilename(dir, filename) {
  let targetPath = path.join(dir, filename);
  if (!fs.existsSync(targetPath)) return filename;

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let counter = 1;
  while (fs.existsSync(targetPath)) {
    const newName = `${base} (${counter})${ext}`;
    targetPath = path.join(dir, newName);
    counter++;
  }
  return path.basename(targetPath);
}

// ─── Scanner → Job Files ───

router.post('/:id/job-files/from-scanner', authenticate, [
  requiredString('filePath', 'File path'),
  handleValidationErrors
], (req, res) => {
  try {
    const { id } = req.params;
    const { filePath } = req.body;

    const settings = getSettings();
    if (!settings.scanner_folder) {
      return res.status(400).json({ error: 'Scanner folder not configured' });
    }

    if (!isWithinBase(settings.scanner_folder, filePath)) {
      return res.status(403).json({ error: 'File must be within the configured scanner folder' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found in scanner folder' });
    }

    const result = resolveJobFilesPath(id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { jobFilesPath } = result;
    if (!fs.existsSync(jobFilesPath)) fs.mkdirSync(jobFilesPath, { recursive: true });

    const originalName = path.basename(filePath);
    const finalName = deduplicateFilename(jobFilesPath, originalName);
    fs.copyFileSync(filePath, path.join(jobFilesPath, finalName));
    fs.unlinkSync(filePath);

    recordHistory('jobcard', id, 'upload_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: null, to: finalName } },
      { destination: 'Job Files', source: 'scanner' }
    );

    res.status(201).json({ filename: finalName, destination: 'Job Files' });
  } catch (err) {
    logger.error({ err }, 'Scanner to Job Files error');
    res.status(500).json({ error: 'Failed to copy scanner file to Job Files' });
  }
});

// ─── Scanner → QA Forms ───

router.post('/:id/qa-form-files/from-scanner', authenticate, [
  requiredString('filePath', 'File path'),
  handleValidationErrors
], (req, res) => {
  try {
    const { id } = req.params;
    const { filePath } = req.body;

    const settings = getSettings();
    if (!settings.scanner_folder) {
      return res.status(400).json({ error: 'Scanner folder not configured' });
    }

    if (!isWithinBase(settings.scanner_folder, filePath)) {
      return res.status(403).json({ error: 'File must be within the configured scanner folder' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found in scanner folder' });
    }

    const result = resolveQaFormsPath(id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { qaFormsPath } = result;
    if (!fs.existsSync(qaFormsPath)) fs.mkdirSync(qaFormsPath, { recursive: true });

    const originalName = path.basename(filePath);
    const finalName = deduplicateFilename(qaFormsPath, originalName);
    fs.copyFileSync(filePath, path.join(qaFormsPath, finalName));
    fs.unlinkSync(filePath);

    recordHistory('jobcard', id, 'upload_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: null, to: finalName } },
      { destination: 'QA Forms', source: 'scanner' }
    );

    res.status(201).json({ filename: finalName, destination: 'QA Forms' });
  } catch (err) {
    logger.error({ err }, 'Scanner to QA Forms error');
    res.status(500).json({ error: 'Failed to copy scanner file to QA Forms' });
  }
});

// ─── Upload (base64) → Job Files ───

const validateUploadBody = [
  body('filename').isString().trim().notEmpty().withMessage('Filename is required')
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
  body('fileData').isString().notEmpty().withMessage('File data is required'),
  handleValidationErrors
];

router.post('/:id/job-files/upload', authenticate, validateUploadBody, (req, res) => {
  try {
    const { id } = req.params;
    const { filename, fileData } = req.body;

    const result = resolveJobFilesPath(id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { jobFilesPath } = result;
    if (!fs.existsSync(jobFilesPath)) fs.mkdirSync(jobFilesPath, { recursive: true });

    const finalName = deduplicateFilename(jobFilesPath, filename);
    fs.writeFileSync(path.join(jobFilesPath, finalName), Buffer.from(fileData, 'base64'));

    recordHistory('jobcard', id, 'upload_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: null, to: finalName } },
      { destination: 'Job Files', source: 'camera' }
    );

    res.status(201).json({ filename: finalName, destination: 'Job Files' });
  } catch (err) {
    logger.error({ err }, 'Upload to Job Files error');
    res.status(500).json({ error: 'Failed to upload file to Job Files' });
  }
});

// ─── Upload (base64) → QA Forms ───

router.post('/:id/qa-form-files/upload', authenticate, validateUploadBody, (req, res) => {
  try {
    const { id } = req.params;
    const { filename, fileData } = req.body;

    const result = resolveQaFormsPath(id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { qaFormsPath } = result;
    if (!fs.existsSync(qaFormsPath)) fs.mkdirSync(qaFormsPath, { recursive: true });

    const finalName = deduplicateFilename(qaFormsPath, filename);
    fs.writeFileSync(path.join(qaFormsPath, finalName), Buffer.from(fileData, 'base64'));

    recordHistory('jobcard', id, 'upload_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: null, to: finalName } },
      { destination: 'QA Forms', source: 'camera' }
    );

    res.status(201).json({ filename: finalName, destination: 'QA Forms' });
  } catch (err) {
    logger.error({ err }, 'Upload to QA Forms error');
    res.status(500).json({ error: 'Failed to upload file to QA Forms' });
  }
});

// ─── Scanner → Customer Property ───

router.post('/:id/customer-property-files/from-scanner', authenticate, [
  requiredString('filePath', 'File path'),
  handleValidationErrors
], (req, res) => {
  try {
    const { id } = req.params;
    const { filePath } = req.body;

    const settings = getSettings();
    if (!settings.scanner_folder) {
      return res.status(400).json({ error: 'Scanner folder not configured' });
    }

    if (!isWithinBase(settings.scanner_folder, filePath)) {
      return res.status(403).json({ error: 'File must be within the configured scanner folder' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found in scanner folder' });
    }

    const result = resolveCustomerPropertyPath(id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { customerPropertyPath } = result;
    if (!fs.existsSync(customerPropertyPath)) fs.mkdirSync(customerPropertyPath, { recursive: true });

    const originalName = path.basename(filePath);
    const finalName = deduplicateFilename(customerPropertyPath, originalName);
    fs.copyFileSync(filePath, path.join(customerPropertyPath, finalName));
    fs.unlinkSync(filePath);

    recordHistory('jobcard', id, 'upload_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: null, to: finalName } },
      { destination: 'Customer Property', source: 'scanner' }
    );

    res.status(201).json({ filename: finalName, destination: 'Customer Property' });
  } catch (err) {
    logger.error({ err }, 'Scanner to Customer Property error');
    res.status(500).json({ error: 'Failed to copy scanner file to Customer Property' });
  }
});

// ─── Upload (base64) → Customer Property ───

router.post('/:id/customer-property-files/upload', authenticate, validateUploadBody, (req, res) => {
  try {
    const { id } = req.params;
    const { filename, fileData } = req.body;

    const result = resolveCustomerPropertyPath(id);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { customerPropertyPath } = result;
    if (!fs.existsSync(customerPropertyPath)) fs.mkdirSync(customerPropertyPath, { recursive: true });

    const finalName = deduplicateFilename(customerPropertyPath, filename);
    fs.writeFileSync(path.join(customerPropertyPath, finalName), Buffer.from(fileData, 'base64'));

    recordHistory('jobcard', id, 'upload_file', req.user.userId, req.user.name || req.user.username,
      { file: { from: null, to: finalName } },
      { destination: 'Customer Property', source: 'camera' }
    );

    res.status(201).json({ filename: finalName, destination: 'Customer Property' });
  } catch (err) {
    logger.error({ err }, 'Upload to Customer Property error');
    res.status(500).json({ error: 'Failed to upload file to Customer Property' });
  }
});

module.exports = router;
