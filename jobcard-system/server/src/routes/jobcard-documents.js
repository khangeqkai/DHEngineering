const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { authenticate } = require('../middleware/auth');
const { documentQueries, recordHistory } = require('../db/database');

const router = express.Router();

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
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Add document
router.post('/:id/documents', authenticate, (req, res) => {
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
    console.error('Add document error:', err);
    res.status(500).json({ error: 'Failed to add document' });
  }
});

module.exports = router;
