const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAssigneeOrAdmin } = require('../middleware/auth');
const { validateSubcontractStatus } = require('../middleware/validation');
const { subcontractQueries, supplierQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Helper to convert DB row to camelCase response
const toResponse = (s) => ({
  id: s.id,
  supplierId: s.supplier_id,
  supplierName: s.supplier_name,
  dateSent: s.date_sent,
  dateExpected: s.date_expected,
  dateReceived: s.date_received,
  status: s.status,
  notes: s.notes,
  createdAt: s.created_at,
  updatedAt: s.updated_at
});

// Get subcontracts
router.get('/:id/subcontracts', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const subcontracts = subcontractQueries.getByJobcard.all(req.params.id);
    res.json(subcontracts.map(toResponse));
  } catch (err) {
    logger.error({ err }, 'Get subcontracts error');
    res.status(500).json({ error: 'Failed to get subcontracts' });
  }
});

// Add subcontract
router.post('/:id/subcontracts', authenticate, requireAssigneeOrAdmin, ...validateSubcontractStatus, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const subId = `subcontract:${Date.now()}:${uuidv4().slice(0, 8)}`;

    subcontractQueries.create.run(
      subId,
      id,
      data.supplierId,
      data.dateSent || null,
      data.dateExpected || null,
      data.notes || null,
      data.status || 'PENDING'
    );

    const sub = subcontractQueries.getByIdWithSupplier.get(subId);

    recordHistory('jobcard', id, 'add_subcontract', req.user.userId, req.user.name, {
      supplier: { from: null, to: sub.supplier_name },
      status: { from: null, to: data.status || 'PENDING' }
    });
    res.status(201).json(toResponse(sub));
  } catch (err) {
    logger.error({ err }, 'Add subcontract error');
    res.status(500).json({ error: 'Failed to add subcontract' });
  }
});

// Update subcontract
router.put('/:id/subcontracts/:subId', authenticate, requireAssigneeOrAdmin, ...validateSubcontractStatus, (req, res) => {
  try {
    const { id, subId } = req.params;
    const data = req.body;

    const existing = subcontractQueries.getByIdWithSupplier.get(subId);
    if (!existing) {
      return res.status(404).json({ error: 'Subcontract not found' });
    }

    subcontractQueries.update.run(
      data.supplierId || existing.supplier_id,
      data.dateSent !== undefined ? data.dateSent : existing.date_sent,
      data.dateExpected !== undefined ? data.dateExpected : existing.date_expected,
      data.dateReceived !== undefined ? data.dateReceived : existing.date_received,
      data.notes !== undefined ? data.notes : existing.notes,
      data.status || existing.status,
      subId
    );

    // Build proper diff of changed fields
    const changes = {};
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    const newSupplierId = data.supplierId !== undefined ? data.supplierId : existing.supplier_id;
    if (normalizeEmpty(newSupplierId) !== normalizeEmpty(existing.supplier_id)) {
      const newSupplier = supplierQueries.getById.get(newSupplierId);
      changes.supplier = { from: existing.supplier_name, to: newSupplier ? newSupplier.name : newSupplierId };
    }
    const fieldsToTrack = [
      ['date_sent', 'dateSent', data.dateSent !== undefined ? data.dateSent : existing.date_sent],
      ['date_expected', 'dateExpected', data.dateExpected !== undefined ? data.dateExpected : existing.date_expected],
      ['date_received', 'dateReceived', data.dateReceived !== undefined ? data.dateReceived : existing.date_received],
      ['notes', 'notes', data.notes !== undefined ? data.notes : existing.notes],
      ['status', 'status', data.status || existing.status],
    ];
    for (const [dbField, changeKey, newValue] of fieldsToTrack) {
      if (normalizeEmpty(newValue) !== normalizeEmpty(existing[dbField])) {
        changes[changeKey] = { from: existing[dbField], to: newValue };
      }
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update_subcontract', req.user.userId, req.user.name, changes);
    }

    const sub = subcontractQueries.getByIdWithSupplier.get(subId);
    res.json(toResponse(sub));
  } catch (err) {
    logger.error({ err }, 'Update subcontract error');
    res.status(500).json({ error: 'Failed to update subcontract' });
  }
});

// Delete subcontract
router.delete('/:id/subcontracts/:subId', authenticate, requireAssigneeOrAdmin, (req, res) => {
  try {
    const { id, subId } = req.params;

    const existing = subcontractQueries.getByIdWithSupplier.get(subId);
    if (!existing) {
      return res.status(404).json({ error: 'Subcontract not found' });
    }

    recordHistory('jobcard', id, 'delete_subcontract', req.user.userId, req.user.name, {
      supplier: { from: existing.supplier_name, to: null },
      status: { from: existing.status, to: null }
    });

    subcontractQueries.delete.run(subId);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete subcontract error');
    res.status(500).json({ error: 'Failed to delete subcontract' });
  }
});

module.exports = router;
