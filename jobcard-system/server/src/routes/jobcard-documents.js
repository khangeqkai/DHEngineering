const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { documentQueries, getSettings, recordHistory } = require('../db/database');
const { isWithinBase } = require('../utils/folderCreation');
const { requiredString, handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

const MAX_SCANNER_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Get job card documents
router.get('/:id/documents', authenticate, (req, res) => {
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
router.get('/:id/documents/:documentId', authenticate, (req, res) => {
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
router.post('/:id/documents', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { filename, fileType, fileSize, fileData } = req.body;

    const docId = `doc:${uuidv4()}`;

    documentQueries.create.run(
      docId,
      id,
      filename,
      fileType || null,
      fileSize || null,
      fileData,
      req.user.userId
    );

    recordHistory('jobcard', id, 'add_document', req.user.userId, req.user.name || req.user.username,
      { document: { from: null, to: filename } },
      { filename }
    );

    res.status(201).json({ id: docId, filename });
  } catch (err) {
    logger.error({ err }, 'Add document error');
    res.status(500).json({ error: 'Failed to add document' });
  }
});

module.exports = router;
