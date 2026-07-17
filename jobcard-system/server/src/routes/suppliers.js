const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireManagement, isManagement } = require('../middleware/auth');
const { supplierQueries, tagQueries, recordHistory } = require('../db/database');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Convert supplier from snake_case (DB) to camelCase (API).
// Non-admins must not receive a supplier's private phone/email (same privacy
// rule already applied to customer contact details), so blank them out unless
// the requester is an admin.
function toApiFormat(supplier, canManage = true) {
  if (!supplier) return null;
  const tags = tagQueries.getForSupplier.all(supplier.id);
  return {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contact_name,
    contactPhone: canManage ? supplier.contact_phone : null,
    contactEmail: canManage ? supplier.contact_email : null,
    address: supplier.address,
    services: supplier.services,
    approved: supplier.approved,
    notes: supplier.notes,
    active: supplier.active,
    serviceTags: (tags || []).map(t => ({
      id: t.id,
      name: t.name,
      value: t.value
    }))
  };
}

// Helper to get supplier with its service tags (in API format)
function getSupplierWithTags(supplierId, canManage = true) {
  const supplier = supplierQueries.getById.get(supplierId);
  return toApiFormat(supplier, canManage);
}

// GET /api/suppliers - Get all suppliers
router.get('/', (req, res) => {
  try {
    const canManage = isManagement(req.user.role);
    const includeInactive = req.query.includeInactive === 'true';
    const suppliers = includeInactive
      ? supplierQueries.getAllIncludeInactive.all()
      : supplierQueries.getAll.all();
    // Convert each supplier to API format with service tags
    const result = suppliers.map(s => toApiFormat(s, canManage));
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to get suppliers');
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
});

// GET /api/suppliers/:id - Get single supplier
router.get('/:id', (req, res) => {
  try {
    const supplier = getSupplierWithTags(req.params.id, isManagement(req.user.role));
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to get supplier');
    res.status(500).json({ error: 'Failed to get supplier' });
  }
});

// POST /api/suppliers - Create new supplier (admin or manager)
router.post('/', requireManagement, (req, res) => {
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
        tagQueries.addToSupplier.run(id, tagId);
      }
    }

    const supplier = getSupplierWithTags(id);

    recordHistory('supplier', id, 'create', req.user.userId, req.user.name || req.user.username, {
      name: { from: null, to: supplier.name },
      contactName: { from: null, to: supplier.contactName }
    });

    res.status(201).json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to create supplier');
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// PUT /api/suppliers/:id - Update supplier (admin or manager)
router.put('/:id', requireManagement, (req, res) => {
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

    // Track changes for audit
    const oldTags = tagQueries.getForSupplier.all(id) || [];
    const oldTagIds = oldTags.map(t => t.id).sort().join(',');
    const newTagIds = Array.isArray(serviceTagIds) ? [...serviceTagIds].sort().join(',') : oldTagIds;
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    const changes = {};
    if (normalizeEmpty(name) !== normalizeEmpty(existing.name)) changes.name = { from: existing.name, to: name };
    if (normalizeEmpty(contactName) !== normalizeEmpty(existing.contact_name)) changes.contactName = { from: existing.contact_name, to: contactName || null };
    if (normalizeEmpty(contactPhone) !== normalizeEmpty(existing.contact_phone)) changes.contactPhone = { from: existing.contact_phone, to: contactPhone || null };
    if (normalizeEmpty(contactEmail) !== normalizeEmpty(existing.contact_email)) changes.contactEmail = { from: existing.contact_email, to: contactEmail || null };
    if (normalizeEmpty(address) !== normalizeEmpty(existing.address)) changes.address = { from: existing.address, to: address || null };
    if (normalizeEmpty(notes) !== normalizeEmpty(existing.notes)) changes.notes = { from: existing.notes, to: notes || null };
    if (newTagIds !== oldTagIds) {
      const oldTagNames = oldTags.map(t => t.name).sort().join(', ') || null;
      const allTags = tagQueries.getByCategoryIncludeArchived.all('treatment') || [];
      const newTagNames = Array.isArray(serviceTagIds)
        ? serviceTagIds.map(tid => { const t = allTags.find(at => at.id === tid); return t ? t.name : tid; }).sort().join(', ') || null
        : oldTagNames;
      changes.serviceTags = { from: oldTagNames, to: newTagNames };
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
      tagQueries.clearSupplierTags.run(id);
      for (const tagId of serviceTagIds) {
        tagQueries.addToSupplier.run(id, tagId);
      }
    }

    const supplier = getSupplierWithTags(id);

    if (Object.keys(changes).length > 0) {
      recordHistory('supplier', id, 'update', req.user.userId, req.user.name || req.user.username, changes, supplier);
    }

    res.json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to update supplier');
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// POST /api/suppliers/:id/deactivate - Archive supplier (admin or manager)
// Suppliers are never permanently deleted: jobs snapshot a supplier's id/name onto
// their treatments, so erasing a supplier would leave those jobs pointing at nothing.
// Archiving keeps the record (existing jobs stay valid) but drops it from the picker.
router.post('/:id/deactivate', requireManagement, (req, res) => {
  try {
    const { id } = req.params;

    const existing = getSupplierWithTags(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    supplierQueries.deactivate.run(id);

    recordHistory('supplier', id, 'archive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Active', to: 'Archived' }
    }, { name: existing.name });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to archive supplier');
    res.status(500).json({ error: 'Failed to archive supplier' });
  }
});

// POST /api/suppliers/:id/activate - Restore archived supplier (admin or manager)
router.post('/:id/activate', requireManagement, (req, res) => {
  try {
    const { id } = req.params;

    const existing = getSupplierWithTags(id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    supplierQueries.activate.run(id);

    recordHistory('supplier', id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Archived', to: 'Active' }
    }, { name: existing.name });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to restore supplier');
    res.status(500).json({ error: 'Failed to restore supplier' });
  }
});

module.exports = router;
