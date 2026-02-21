const express = require('express');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { authenticate, requireAssigneeOrAdmin } = require('../middleware/auth');
const { jobcardQueries, contactQueries, getSettings } = require('../db/database');
const { sanitizeFolderName, isWithinBase } = require('../utils/folderCreation');
const { handleValidationErrors } = require('../middleware/validation');
const { param } = require('express-validator');

const router = express.Router();

const VALID_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif'];

function resolveDrawingsPath(jobcardId) {
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

  const drawingsPath = path.join(basePath.trim(), sanitizedCompany, sanitizedJob, 'Drawings');

  if (!isWithinBase(basePath.trim(), drawingsPath)) {
    return { error: 'Path traversal detected', status: 403 };
  }

  return { drawingsPath };
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

router.get('/:id/drawings-files', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const result = resolveDrawingsPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { drawingsPath } = result;

    if (!fs.existsSync(drawingsPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(drawingsPath)
      .map(filename => {
        const filePath = path.join(drawingsPath, filename);
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return null;

          const ext = path.extname(filename).toLowerCase();
          if (!VALID_EXTENSIONS.includes(ext)) return null;

          return {
            name: filename,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          };
        } catch {
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json(files);
  } catch (err) {
    logger.error({ err }, 'Get drawings files error');
    res.status(500).json({ error: 'Failed to list drawings files' });
  }
});

router.get('/:id/drawings-files/:filename', authenticate, requireAssigneeOrAdmin, validateFilename, (req, res) => {
  try {
    const result = resolveDrawingsPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { drawingsPath } = result;
    const filename = req.params.filename;
    const filePath = path.join(drawingsPath, filename);

    if (!isWithinBase(drawingsPath, filePath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileData = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.bmp': 'image/bmp',
      '.gif': 'image/gif'
    };

    res.json({
      name: filename,
      path: filePath,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      data: fileData.toString('base64')
    });
  } catch (err) {
    logger.error({ err }, 'Get drawings file data error');
    res.status(500).json({ error: 'Failed to get file data' });
  }
});

// ─── QA Documents (on-disk files in QA Documents folder) ───

function resolveQaDocsPath(jobcardId) {
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

  const qaDocsPath = path.join(basePath.trim(), sanitizedCompany, sanitizedJob, 'QA Documents');

  if (!isWithinBase(basePath.trim(), qaDocsPath)) {
    return { error: 'Path traversal detected', status: 403 };
  }

  return { qaDocsPath };
}

router.get('/:id/qa-documents-files', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const result = resolveQaDocsPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { qaDocsPath } = result;

    if (!fs.existsSync(qaDocsPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(qaDocsPath)
      .map(filename => {
        const filePath = path.join(qaDocsPath, filename);
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return null;

          const ext = path.extname(filename).toLowerCase();
          if (!VALID_EXTENSIONS.includes(ext)) return null;

          return {
            name: filename,
            size: stats.size,
            modified: stats.mtime
          };
        } catch {
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json(files);
  } catch (err) {
    logger.error({ err }, 'Get QA documents files error');
    res.status(500).json({ error: 'Failed to list QA document files' });
  }
});

router.get('/:id/qa-documents-files/:filename', authenticate, requireAssigneeOrAdmin, validateFilename, (req, res) => {
  try {
    const result = resolveQaDocsPath(req.params.id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const { qaDocsPath } = result;
    const filename = req.params.filename;
    const filePath = path.join(qaDocsPath, filename);

    if (!isWithinBase(qaDocsPath, filePath)) {
      return res.status(403).json({ error: 'Path traversal detected' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileData = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.bmp': 'image/bmp',
      '.gif': 'image/gif'
    };

    res.json({
      name: filename,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      data: fileData.toString('base64')
    });
  } catch (err) {
    logger.error({ err }, 'Get QA document file data error');
    res.status(500).json({ error: 'Failed to get QA document file data' });
  }
});

module.exports = router;
