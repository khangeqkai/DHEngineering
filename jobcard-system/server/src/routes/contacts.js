const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateCreateContact, validateUpdateContact } = require('../middleware/validation');
const { contactQueries, recordHistory } = require('../db/database');
const { ensureCompanyFolder, renameCompanyFolder } = require('../utils/folderCreation');

const router = express.Router();

// Helper to convert snake_case database row to camelCase API response
const toApiFormat = (c) => ({
  id: c.id,
  contactName: c.contact_name,
  companyName: c.company_name,
  phone: c.phone,
  email: c.email,
  address: c.address,
  notes: c.notes,
  archived: !!c.archived,
  createdAt: c.created_at,
  updatedAt: c.updated_at
});

// All routes require authentication
router.use(authenticate);

// GET /api/contacts - Get all contacts (admin only). Pass ?includeArchived=true
// to include archived customers (for the admin list's "Show archived" toggle).
router.get('/', requireAdmin, (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const contacts = includeArchived
      ? contactQueries.getAllIncludeArchived.all()
      : contactQueries.getAll.all();
    res.json(contacts.map(toApiFormat));
  } catch (err) {
    logger.error({ err }, 'Failed to get contacts');
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// GET /api/contacts/search - Search contacts by name or company (admin only)
router.get('/search', requireAdmin, (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    const searchTerm = `%${q}%`;
    const contacts = contactQueries.search.all(searchTerm, searchTerm);
    res.json(contacts.map(toApiFormat));
  } catch (err) {
    logger.error({ err }, 'Failed to search contacts');
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

// GET /api/contacts/:id - Get single contact (admin only)
router.get('/:id', requireAdmin, (req, res) => {
  try {
    const contact = contactQueries.getById.get(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to get contact');
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

// POST /api/contacts - Create new contact
router.post('/', requireAdmin, validateCreateContact, (req, res) => {
  try {
    const { contactName, companyName, phone, email, address, notes } = req.body;

    // Company names must be unique (case-insensitive) so each customer maps to
    // exactly one folder on disk. An archived customer still owns its name, so
    // tell the admin to restore it rather than leaving them at a dead end.
    const existingByName = contactQueries.getByCompanyName.get(companyName);
    if (existingByName) {
      return res.status(409).json({
        error: existingByName.archived
          ? 'A customer with this company name already exists in the archive. Restore it from the archived list instead.'
          : 'A customer with this company name already exists'
      });
    }

    const id = uuidv4();

    contactQueries.create.run(
      id,
      contactName || null,
      companyName,
      phone || null,
      email || null,
      address || null,
      notes || null
    );

    // Create the company folder on disk, stamped with this contact's permanent
    // id so it survives later company-name changes (fire-and-forget)
    ensureCompanyFolder(id, companyName);

    const contact = contactQueries.getById.get(id);

    // Record history
    const created = toApiFormat(contact);
    recordHistory('contact', id, 'create', req.user.userId, req.user.name || req.user.username, {
      contactName: { from: null, to: created.contactName },
      companyName: { from: null, to: created.companyName }
    });

    res.status(201).json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to create contact');
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', requireAdmin, validateUpdateContact, (req, res) => {
  try {
    const { id } = req.params;
    const { contactName, companyName, phone, email, address, notes } = req.body;

    const existing = contactQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Company names must be unique (case-insensitive) — reject if another
    // customer already uses this name. Point at the archive when the clashing
    // record is archived so the reason isn't hidden from view.
    const dupe = contactQueries.getByCompanyName.get(companyName);
    if (dupe && dupe.id !== id) {
      return res.status(409).json({
        error: dupe.archived
          ? 'A customer with this company name already exists in the archive. Restore it from the archived list instead.'
          : 'A customer with this company name already exists'
      });
    }

    // Track changes for audit
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    const changes = {};
    if (normalizeEmpty(contactName) !== normalizeEmpty(existing.contact_name)) changes.contactName = { from: existing.contact_name, to: contactName || null };
    if (normalizeEmpty(companyName) !== normalizeEmpty(existing.company_name)) changes.companyName = { from: existing.company_name, to: companyName };
    if (normalizeEmpty(phone) !== normalizeEmpty(existing.phone)) changes.phone = { from: existing.phone, to: phone || null };
    if (normalizeEmpty(email) !== normalizeEmpty(existing.email)) changes.email = { from: existing.email, to: email || null };
    if (normalizeEmpty(address) !== normalizeEmpty(existing.address)) changes.address = { from: existing.address, to: address || null };
    if (normalizeEmpty(notes) !== normalizeEmpty(existing.notes)) changes.notes = { from: existing.notes, to: notes || null };

    contactQueries.update.run(
      contactName || null,
      companyName,
      phone || null,
      email || null,
      address || null,
      notes || null,
      id
    );

    const contact = contactQueries.getById.get(id);

    // Company name changed → relabel the existing folder on disk, located by
    // the permanent code in its name so its job files follow the rename
    // instead of being stranded under the old name (fire-and-forget).
    if (changes.companyName && companyName) {
      renameCompanyFolder(id, existing.company_name, companyName);
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('contact', id, 'update', req.user.userId, req.user.name || req.user.username, changes, toApiFormat(contact));
    }

    res.json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to update contact');
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// POST /api/contacts/:id/archive - Archive a customer (admin only). Customers
// are never deleted (track-and-trace): archiving hides them from pickers but
// keeps the record, the link from their jobs, and their files on disk intact.
router.post('/:id/archive', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = contactQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    if (existing.archived) {
      return res.json(toApiFormat(existing));
    }

    contactQueries.archive.run(id);
    const contact = contactQueries.getById.get(id);

    recordHistory('contact', id, 'archive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Active', to: 'Archived' }
    });

    res.json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to archive contact');
    res.status(500).json({ error: 'Failed to archive contact' });
  }
});

// POST /api/contacts/:id/unarchive - Restore an archived customer (admin only).
router.post('/:id/unarchive', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = contactQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    if (!existing.archived) {
      return res.json(toApiFormat(existing));
    }

    contactQueries.unarchive.run(id);
    const contact = contactQueries.getById.get(id);

    recordHistory('contact', id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Archived', to: 'Active' }
    });

    res.json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to restore contact');
    res.status(500).json({ error: 'Failed to restore contact' });
  }
});

module.exports = router;
