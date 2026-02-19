const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAssigneeOrAdmin } = require('../middleware/auth');
const { documentQueries, recordHistory } = require('../db/database');

const router = express.Router();

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

    recordHistory('jobcard', id, 'add_document', req.user.userId, req.user.name, { filename }, null);

    res.status(201).json({ id: docId, filename });
  } catch (err) {
    logger.error({ err }, 'Add document error');
    res.status(500).json({ error: 'Failed to add document' });
  }
});

module.exports = router;
