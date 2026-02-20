const express = require('express');

const logger = require('../utils/logger');
const { authenticate, requireAssigneeOrAdmin } = require('../middleware/auth');
const { qaFormQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Get job card QA forms
router.get('/:id/qa-forms', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const forms = qaFormQueries.getByJobcard.all(req.params.id);
    res.json(forms.map(f => ({
      id: f.id,
      formCode: f.form_code,
      formName: f.form_name,
      status: f.status,
      printedAt: f.printed_at,
      scannedAt: f.scanned_at,
      notes: f.notes
    })));
  } catch (err) {
    logger.error({ err }, 'Get QA forms error');
    res.status(500).json({ error: 'Failed to get QA forms' });
  }
});

// Update QA form status
router.patch('/:id/qa-forms/:formId', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const { id, formId } = req.params;
    const { status, scannedDocumentId, notes } = req.body;

    const form = qaFormQueries.getById.get(formId);
    if (!form) {
      return res.status(404).json({ error: 'QA form not found' });
    }

    const oldStatus = form.status;
    const printedAt = status === 'PRINTED' ? new Date().toISOString() : form.printed_at;
    const scannedAt = status === 'SCANNED' ? new Date().toISOString() : form.scanned_at;

    qaFormQueries.update.run(
      status || form.status,
      printedAt,
      scannedAt,
      scannedDocumentId || form.scanned_document_id,
      notes || form.notes,
      formId
    );

    // Record history
    recordHistory('jobcard', id, 'update_qa_form', req.user.userId, req.user.name, {
      status: { from: oldStatus, to: status }
    }, { formCode: form.form_code, formName: form.form_name });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update QA form error');
    res.status(500).json({ error: 'Failed to update QA form' });
  }
});

module.exports = router;
