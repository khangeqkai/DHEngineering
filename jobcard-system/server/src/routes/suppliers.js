const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { supplierQueries, serviceTagQueries, recordHistory } = require('../db/database');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Convert supplier from snake_case (DB) to camelCase (API)
function toApiFormat(supplier) {
  if (!supplier) return null;
  const tags = serviceTagQueries.getForSupplier.all(supplier.id);
  return {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contact_name,
    contactPhone: supplier.contact_phone,
    contactEmail: supplier.contact_email,
    address: supplier.address,
    services: supplier.services,
    approved: supplier.approved,
    notes: supplier.notes,
    active: supplier.active,
    serviceTags: (tags || []).map(t => ({
      id: t.id,
      name: t.name,
      isSystem: t.is_system
    }))
  };
}

// Helper to get supplier with its service tags (in API format)
function getSupplierWithTags(supplierId) {
  const supplier = supplierQueries.getById.get(supplierId);
  return toApiFormat(supplier);
}

// GET /api/suppliers - Get all suppliers
router.get('/', (req, res) => {
  try {
    const suppliers = supplierQueries.getAll.all();
    // Convert each supplier to API format with service tags
    const result = suppliers.map(s => toApiFormat(s));
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to get suppliers');
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
});

// GET /api/suppliers/:id - Get single supplier
router.get('/:id', (req, res) => {
  try {
    const supplier = getSupplierWithTags(req.params.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to get supplier');
    res.status(500).json({ error: 'Failed to get supplier' });
  }
});

// POST /api/suppliers - Create new supplier (admin only)
router.post('/', requireAdmin, (req, res) => {
  try {
    const { name, contactName, contactPhone, contactEmail, address, notes, serviceTagIds } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const id = uuidv4();

    supplierQueries.create.run(
      id,
      name,
      contactName || null,
      contactPhone || null,
      contactEmail || null,
      address || null,
      null, // services field deprecated
      notes || null
    );

    // Add service tags
    if (Array.isArray(serviceTagIds)) {
      for (const tagId of serviceTagIds) {
        serviceTagQueries.addToSupplier.run(id, tagId);
      }
    }

    const supplier = getSupplierWithTags(id);

    recordHistory('supplier', id, 'created', req.user.id, req.user.name || req.user.username, null, supplier);

    res.status(201).json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to create supplier');
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// PUT /api/suppliers/:id - Update supplier (admin only)
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name, contactName, contactPhone, contactEmail, address, notes, serviceTagIds } = req.body;

    const existing = supplierQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    supplierQueries.update.run(
      name,
      contactName || null,
      contactPhone || null,
      contactEmail || null,
      address || null,
      null, // services field deprecated
      notes || null,
      id
    );

    // Update service tags (clear and re-add)
    if (Array.isArray(serviceTagIds)) {
      serviceTagQueries.clearSupplierTags.run(id);
      for (const tagId of serviceTagIds) {
        serviceTagQueries.addToSupplier.run(id, tagId);
      }
    }

    const supplier = getSupplierWithTags(id);

    recordHistory('supplier', id, 'updated', req.user.id, req.user.name || req.user.username, req.body, supplier);

    res.json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to update supplier');
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// DELETE /api/suppliers/:id - Delete supplier (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = getSupplierWithTags(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Clear service tags first (cascade should handle this, but be explicit)
    serviceTagQueries.clearSupplierTags.run(id);
    supplierQueries.delete.run(id);

    recordHistory('supplier', id, 'deleted', req.user.id, req.user.name || req.user.username, null, existing);

    res.json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to delete supplier');
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

module.exports = router;
