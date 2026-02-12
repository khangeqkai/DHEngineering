const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { authenticate } = require('../middleware/auth');
const { subcontractQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Get subcontracts
router.get('/:id/subcontracts', authenticate, (req, res) => {
  try {
    const subcontracts = subcontractQueries.getByJobcard.all(req.params.id);
    res.json(subcontracts.map(s => ({
      id: s.id,
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      date_sent: s.date_sent,
      date_expected: s.date_expected,
      date_received: s.date_received,
      status: s.status,
      notes: s.notes
    })));
  } catch (err) {
    console.error('Get subcontracts error:', err);
    res.status(500).json({ error: 'Failed to get subcontracts' });
  }
});

// Add subcontract
router.post('/:id/subcontracts', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const subId = `subcontract:${Date.now()}:${uuidv4().slice(0, 8)}`;

    subcontractQueries.create.run(
      subId,
      id,
      data.supplier_id,
      data.date_sent || null,
      data.date_expected || null,
      data.notes || null,
      data.status || 'PENDING'
    );

    recordHistory('jobcard', id, 'add_subcontract', req.user.userId, req.user.name, {
      subcontractId: subId,
      supplierId: data.supplier_id,
      status: data.status || 'PENDING'
    }, null);

    const sub = subcontractQueries.getById.get(subId);
    res.status(201).json(sub);
  } catch (err) {
    console.error('Add subcontract error:', err);
    res.status(500).json({ error: 'Failed to add subcontract' });
  }
});

// Update subcontract
router.put('/:id/subcontracts/:subId', authenticate, (req, res) => {
  try {
    const { id, subId } = req.params;
    const data = req.body;

    const existing = subcontractQueries.getById.get(subId);
    if (!existing) {
      return res.status(404).json({ error: 'Subcontract not found' });
    }

    subcontractQueries.update.run(
      data.supplier_id || existing.supplier_id,
      data.date_sent !== undefined ? data.date_sent : existing.date_sent,
      data.date_expected !== undefined ? data.date_expected : existing.date_expected,
      data.date_received !== undefined ? data.date_received : existing.date_received,
      data.notes !== undefined ? data.notes : existing.notes,
      data.status || existing.status,
      subId
    );

    recordHistory('jobcard', id, 'update_subcontract', req.user.userId, req.user.name, {
      subcontractId: subId,
      status: data.status,
      dateReceived: data.date_received
    }, null);

    const sub = subcontractQueries.getById.get(subId);
    res.json(sub);
  } catch (err) {
    console.error('Update subcontract error:', err);
    res.status(500).json({ error: 'Failed to update subcontract' });
  }
});

// Delete subcontract
router.delete('/:id/subcontracts/:subId', authenticate, (req, res) => {
  try {
    const { id, subId } = req.params;

    const existing = subcontractQueries.getById.get(subId);
    if (!existing) {
      return res.status(404).json({ error: 'Subcontract not found' });
    }

    recordHistory('jobcard', id, 'delete_subcontract', req.user.userId, req.user.name, {
      subcontractId: subId,
      supplierId: existing.supplier_id
    }, null);

    subcontractQueries.delete.run(subId);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete subcontract error:', err);
    res.status(500).json({ error: 'Failed to delete subcontract' });
  }
});

module.exports = router;
