const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireManagement, isManagement } = require('../middleware/auth');
const { validateCreateSupplier, validateUpdateSupplier } = require('../middleware/validation');
const { db, supplierQueries, tagQueries, jobItemQueries, recordHistory, actorName } = require('../db/database');
const { diffFields } = require('../utils/historyChanges');
const { setArchived } = require('../utils/archiveToggle');
const { supplierContactFields } = require('./supplier-helpers');
const { findOr404 } = require('../utils/findOr404');
const { nameConflictOr409, findNameClash } = require('./name-conflict');
const { sameName } = require('../shared/names');

const router = express.Router();

// A part's treatments carry a snapshot of the supplier's name (job_items.treatments,
// a JSON array of { value, supplierId, supplierName, ... }), so a rename has to reach
// every part already pointing at this supplier or the copied name goes stale.
// Rewrite the supplierName on every treatment line that points at this supplier id.
// The LIKE pre-filter needs no escaping: a supplier id is a UUID.
function renameSupplierOnParts(supplierId, newName) {
  const rows = jobItemQueries.getWithSupplierIdLike.all(supplierId);
  for (const row of rows) {
    let treatments;
    try {
      treatments = JSON.parse(row.treatments);
    } catch {
      continue;
    }
    if (!Array.isArray(treatments)) continue;
    let changed = false;
    for (const tr of treatments) {
      if (tr && tr.supplierId === supplierId && tr.supplierName !== newName) {
        tr.supplierName = newName;
        changed = true;
      }
    }
    if (changed) {
      jobItemQueries.updateTreatments.run(JSON.stringify(treatments), row.id);
    }
  }
}

// A list of service ids from a request, repeats and non-strings dropped. Anything
// that isn't an array reads as no ids.
function uniqueIds(list) {
  return Array.isArray(list) ? [...new Set(list.filter(tid => typeof tid === 'string'))] : [];
}

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
    ...supplierContactFields(supplier, canManage),
    address: supplier.address,
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
    const supplier = findOr404(res, getSupplierWithTags(req.params.id, isManagement(req.user.role)), 'Supplier not found');
    if (!supplier) return;
    res.json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to get supplier');
    res.status(500).json({ error: 'Failed to get supplier' });
  }
});

// POST /api/suppliers - Create new supplier (admin or manager)
router.post('/', requireManagement, validateCreateSupplier, (req, res) => {
  try {
    const { name, contactName, contactPhone, contactEmail, address, notes, serviceTagIds } = req.body;

    // Supplier names are unique (capitals and repeated spaces ignored), same
    // reasoning as companies — an archived supplier still owns its name, so point
    // the caller at restoring it.
    const existingByName = findNameClash(supplierQueries.getAllIncludeInactive.all(), name);
    if (nameConflictOr409(res, existingByName, null, { entityLabel: 'supplier', nameLabel: 'name', isArchived: (row) => row.active === 0 })) {
      return;
    }

    const id = uuidv4();

    // The supplier row and its service tags are ONE all-or-nothing step: a tag id
    // that no longer exists trips a foreign-key error, and without the transaction
    // the supplier row was already committed, leaving a half-saved supplier behind
    // an error message.
    db.transaction(() => {
      supplierQueries.create.run(
        id,
        name,
        contactName || null,
        contactPhone || null,
        contactEmail || null,
        address || null,
        notes || null
      );

      for (const tagId of uniqueIds(serviceTagIds)) {
        tagQueries.addToSupplier.run(id, tagId);
      }
    })();

    const supplier = getSupplierWithTags(id);

    const serviceNames = supplier.serviceTags.map(t => t.name).sort().join(', ');
    recordHistory('supplier', id, 'create', req.user.userId, actorName(req), {
      name: { from: null, to: supplier.name },
      contactName: { from: null, to: supplier.contactName },
      ...(contactPhone ? { contactPhone: { from: null, to: contactPhone } } : {}),
      ...(contactEmail ? { contactEmail: { from: null, to: contactEmail } } : {}),
      ...(supplier.address ? { address: { from: null, to: supplier.address } } : {}),
      ...(supplier.notes ? { notes: { from: null, to: supplier.notes } } : {}),
      ...(serviceNames ? { serviceTags: { from: null, to: serviceNames } } : {})
    });

    res.status(201).json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to create supplier');
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// PUT /api/suppliers/:id - Update supplier (admin or manager)
router.put('/:id', requireManagement, validateUpdateSupplier, (req, res) => {
  try {
    const { id } = req.params;
    // Services come as the changes the person made — ticked on (addServiceTagIds) and
    // ticked off (removeServiceTagIds) compared with what their form opened with —
    // never as a whole list. A whole list from a copy older than a service linked
    // meanwhile (the job screen links them in the background) would quietly undo it.
    const { addServiceTagIds, removeServiceTagIds } = req.body;

    const existing = findOr404(res, supplierQueries.getById.get(id), 'Supplier not found');
    if (!existing) return;

    // The same goes for the supplier's own details: a field left out of the request
    // keeps the stored value, and only a sent one (blank included, except the name)
    // replaces it — the form sends only what the person changed.
    const sentOr = (field, stored) => (req.body[field] === undefined ? stored : req.body[field]);
    const name = sentOr('name', existing.name);
    const contactName = sentOr('contactName', existing.contact_name);
    const contactPhone = sentOr('contactPhone', existing.contact_phone);
    const contactEmail = sentOr('contactEmail', existing.contact_email);
    const address = sentOr('address', existing.address);
    const notes = sentOr('notes', existing.notes);

    // Same name rule as companies. Only checked when the name actually changes: a
    // database from before this check may already hold two suppliers with one name,
    // and editing either one's phone must not be refused over it.
    const nameChanged = !sameName(name, existing.name);
    const dupe = nameChanged ? findNameClash(supplierQueries.getAllIncludeInactive.all(), name, id) : null;
    if (nameConflictOr409(res, dupe, id, { entityLabel: 'supplier', nameLabel: 'name', isArchived: (row) => row.active === 0 })) {
      return;
    }

    // Only ticks that change something count: an id both added and removed cancels
    // out, adding one already linked or removing one not linked is a no-op.
    const oldTags = tagQueries.getForSupplier.all(id) || [];
    const oldTagIds = new Set(oldTags.map(t => t.id));
    const addRequested = new Set(uniqueIds(addServiceTagIds));
    const removeRequested = new Set(uniqueIds(removeServiceTagIds));
    const addIds = [...addRequested].filter(tid => !removeRequested.has(tid) && !oldTagIds.has(tid));
    const dropIds = [...removeRequested].filter(tid => !addRequested.has(tid) && oldTagIds.has(tid));
    const allTags = tagQueries.getByCategoryIncludeArchived.all('treatment') || [];
    if (addIds.some(tid => !allTags.some(t => t.id === tid))) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Track changes for audit
    const changes = diffFields(existing, [
      ['name', 'name', name],
      ['contact_name', 'contactName', contactName || null],
      ['contact_phone', 'contactPhone', contactPhone || null],
      ['contact_email', 'contactEmail', contactEmail || null],
      ['address', 'address', address || null],
      ['notes', 'notes', notes || null],
    ]);
    if (addIds.length > 0 || dropIds.length > 0) {
      const names = (list) => list.map(t => t.name).sort().join(', ') || null;
      const newTags = [
        ...oldTags.filter(t => !dropIds.includes(t.id)),
        ...addIds.map(tid => allTags.find(t => t.id === tid))
      ];
      changes.serviceTags = { from: names(oldTags), to: names(newTags) };
    }

    // Same all-or-nothing rule as create: the supplier row and its service changes
    // land together or not at all.
    db.transaction(() => {
      supplierQueries.update.run(
        name,
        contactName || null,
        contactPhone || null,
        contactEmail || null,
        address || null,
        notes || null,
        id
      );

      // Apply only the person's own ticks and unticks
      for (const tagId of dropIds) {
        tagQueries.removeFromSupplier.run(id, tagId);
      }
      for (const tagId of addIds) {
        tagQueries.addToSupplier.run(id, tagId);
      }

      // The rename must reach every part already carrying this supplier's name,
      // in the same all-or-nothing step as the supplier row itself.
      // Exact compare, not nameChanged: a capitals-only fix skips the duplicate
      // check above but must still reach the parts.
      if (name !== existing.name) {
        renameSupplierOnParts(id, name);
      }
    })();

    const supplier = getSupplierWithTags(id);

    if (Object.keys(changes).length > 0) {
      recordHistory('supplier', id, 'update', req.user.userId, actorName(req), changes, supplier);
    }

    res.json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to update supplier');
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// POST /api/suppliers/:id/service-tags - Add ONE service to a supplier (admin or manager)
// The job screen uses this when a part picks a supplier that doesn't yet list the
// part's treatment. It touches nothing else on the supplier: going through the
// full-record PUT above meant re-sending every contact field from whatever copy the
// job screen held, which reverted other people's edits (and, for a copy with the
// contact details blanked, wiped them). Already linked → success, nothing written.
router.post('/:id/service-tags', requireManagement, (req, res) => {
  try {
    const { id } = req.params;
    const { tagId } = req.body || {};

    const existing = findOr404(res, supplierQueries.getById.get(id), 'Supplier not found');
    if (!existing) return;
    const tag = typeof tagId === 'string' ? tagQueries.getById.get(tagId) : null;
    if (!tag || tag.category !== 'treatment') {
      return res.status(404).json({ error: 'Service not found' });
    }

    const oldTags = tagQueries.getForSupplier.all(id) || [];
    if (oldTags.some(t => t.id === tag.id)) {
      return res.json(getSupplierWithTags(id));
    }

    db.transaction(() => {
      tagQueries.addToSupplier.run(id, tag.id);
    })();

    const supplier = getSupplierWithTags(id);
    const names = (list) => list.map(t => t.name).sort().join(', ') || null;
    recordHistory('supplier', id, 'update', req.user.userId, actorName(req), {
      serviceTags: { from: names(oldTags), to: names(supplier.serviceTags) }
    }, supplier);

    res.json(supplier);
  } catch (err) {
    logger.error({ err }, 'Failed to add service to supplier');
    res.status(500).json({ error: 'Failed to add service to supplier' });
  }
});

// POST /api/suppliers/:id/deactivate - Archive supplier (admin or manager)
// Suppliers are never permanently deleted: jobs snapshot a supplier's id/name onto
// their treatments, so erasing a supplier would leave those jobs pointing at nothing.
// Archiving keeps the record (existing jobs stay valid) but drops it from the picker.
router.post('/:id/deactivate', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'supplier',
    load: () => getSupplierWithTags(id),
    notFound: 'Supplier not found',
    isArchived: (row) => !row.active,
    archive: true,
    write: (row) => supplierQueries.deactivate.run(row.id),
    respond: () => ({ success: true }),
    snapshot: (row) => ({ name: row.name })
  });
});

// POST /api/suppliers/:id/activate - Restore archived supplier (admin or manager)
router.post('/:id/activate', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'supplier',
    load: () => getSupplierWithTags(id),
    notFound: 'Supplier not found',
    isArchived: (row) => !row.active,
    archive: false,
    write: (row) => supplierQueries.activate.run(row.id),
    respond: () => ({ success: true }),
    snapshot: (row) => ({ name: row.name })
  });
});

module.exports = router;
