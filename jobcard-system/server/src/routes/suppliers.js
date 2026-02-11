const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { supplierQueries, recordHistory } = require('../db/database');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/suppliers - Get all approved suppliers
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const suppliers = includeInactive
      ? supplierQueries.getAllIncludeInactive.all()
      : supplierQueries.getAll.all();
    res.json(suppliers);
  } catch (err) {
    console.error('Failed to get suppliers:', err);
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
});

// GET /api/suppliers/:id - Get single supplier
router.get('/:id', (req, res) => {
  try {
    const supplier = supplierQueries.getById.get(req.params.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (err) {
    console.error('Failed to get supplier:', err);
    res.status(500).json({ error: 'Failed to get supplier' });
  }
});

// POST /api/suppliers - Create new supplier (admin only)
router.post('/', requireAdmin, (req, res) => {
  try {
    const { name, contact_name, contact_phone, contact_email, address, services, approved, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const id = uuidv4();

    supplierQueries.create.run(
      id,
      name,
      contact_name || null,
      contact_phone || null,
      contact_email || null,
      address || null,
      services || null,
      approved !== false ? 1 : 0,
      notes || null
    );

    const supplier = supplierQueries.getById.get(id);

    recordHistory('supplier', id, 'created', req.user.id, req.user.name || req.user.username, null, supplier);

    res.status(201).json(supplier);
  } catch (err) {
    console.error('Failed to create supplier:', err);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// PUT /api/suppliers/:id - Update supplier (admin only)
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_name, contact_phone, contact_email, address, services, approved, notes } = req.body;

    const existing = supplierQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    supplierQueries.update.run(
      name,
      contact_name || null,
      contact_phone || null,
      contact_email || null,
      address || null,
      services || null,
      approved !== false ? 1 : 0,
      notes || null,
      id
    );

    const supplier = supplierQueries.getById.get(id);

    recordHistory('supplier', id, 'updated', req.user.id, req.user.name || req.user.username, req.body, supplier);

    res.json(supplier);
  } catch (err) {
    console.error('Failed to update supplier:', err);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// POST /api/suppliers/:id/deactivate - Deactivate supplier (admin only)
router.post('/:id/deactivate', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = supplierQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    supplierQueries.deactivate.run(id);
    const supplier = supplierQueries.getById.get(id);

    recordHistory('supplier', id, 'deactivated', req.user.id, req.user.name || req.user.username, null, supplier);

    res.json(supplier);
  } catch (err) {
    console.error('Failed to deactivate supplier:', err);
    res.status(500).json({ error: 'Failed to deactivate supplier' });
  }
});

// POST /api/suppliers/:id/activate - Activate supplier (admin only)
router.post('/:id/activate', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = supplierQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    supplierQueries.activate.run(id);
    const supplier = supplierQueries.getById.get(id);

    recordHistory('supplier', id, 'activated', req.user.id, req.user.name || req.user.username, null, supplier);

    res.json(supplier);
  } catch (err) {
    console.error('Failed to activate supplier:', err);
    res.status(500).json({ error: 'Failed to activate supplier' });
  }
});

// DELETE /api/suppliers/:id - Delete supplier (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = supplierQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    supplierQueries.delete.run(id);

    recordHistory('supplier', id, 'deleted', req.user.id, req.user.name || req.user.username, null, existing);

    res.json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    console.error('Failed to delete supplier:', err);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

module.exports = router;
