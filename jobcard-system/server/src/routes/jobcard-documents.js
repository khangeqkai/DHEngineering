const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAssigneeOrAdmin } = require('../middleware/auth');
const { documentQueries, getSettings, recordHistory } = require('../db/database');
const { isWithinBase } = require('../utils/folderCreation');
const { requiredString, handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

const MAX_SCANNER_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Get job card documents
router.get('/:id/documents', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const docs = documentQueries.getByJobcard.all(req.params.id);
    res.json(docs.map(d => ({
      id: d.id,
      filename: d.filename,
      fileType: d.file_type,
      fileSize: d.file_size,
      uploadedBy: d.uploaded_by,
      uploadedAt: d.uploaded_at
    })));
  } catch (err) {
    logger.error({ err }, 'Get documents error');
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Get single document with file data
router.get('/:id/documents/:documentId', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const doc = documentQueries.getById.get(req.params.documentId);
    if (!doc || doc.jobcard_id !== req.params.id) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({
      id: doc.id,
      filename: doc.filename,
      fileType: doc.file_type,
      fileSize: doc.file_size,
      fileData: doc.file_data,
      uploadedBy: doc.uploaded_by,
      uploadedAt: doc.uploaded_at
    });
  } catch (err) {
    logger.error({ err }, 'Get document error');
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Add document
router.post('/:id/documents', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { filename, fileType, fileSize, fileData } = req.body;

    const docId = `doc:${Date.now()}:${uuidv4().slice(0, 8)}`;

    documentQueries.create.run(
      docId,
      id,
      filename,
      fileType || null,
      fileSize || null,
      fileData,
      req.user.userId
    );

    recordHistory('jobcard', id, 'add_document', req.user.userId, req.user.name,
      { document: { from: null, to: filename } },
      { filename }
    );

    res.status(201).json({ id: docId, filename });
  } catch (err) {
    logger.error({ err }, 'Add document error');
    res.status(500).json({ error: 'Failed to add document' });
  }
});

// Attach a file from the scanner folder as a document
router.post('/:id/documents/from-scanner', authenticate, requireAssigneeOrAdmin, [
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
      return res.status(404).json({ error: 'File not found' });
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    const stats = fs.statSync(filePath);

    if (stats.size > MAX_SCANNER_FILE_SIZE) {
      return res.status(400).json({ error: 'File exceeds maximum size of 50 MB' });
    }

    const fileData = fs.readFileSync(filePath).toString('base64');

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

    const docId = `doc:${Date.now()}:${uuidv4().slice(0, 8)}`;

    documentQueries.create.run(
      docId,
      id,
      filename,
      mimeTypes[ext] || 'application/octet-stream',
      stats.size,
      fileData,
      req.user.userId
    );

    recordHistory('jobcard', id, 'add_document', req.user.userId, req.user.name,
      { document: { from: null, to: filename } },
      { filename, source: 'scanner' }
    );

    res.status(201).json({ id: docId, filename });
  } catch (err) {
    logger.error({ err }, 'Attach scanner file error');
    res.status(500).json({ error: 'Failed to attach scanner file' });
  }
});

module.exports = router;
