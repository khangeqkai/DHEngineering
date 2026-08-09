const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { validateCreateContact, validateUpdateContact } = require('../middleware/validation');
const { companyQueries, contactQueries, recordHistory } = require('../db/database');
const { toContactApi: toApiFormat } = require('./customer-format');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// A person is always read as part of their company (GET /companies?withPeople=true),
// so there is no list/search/get route here — only the writes.

// POST /api/contacts - Add a person at a company. The company must already exist;
// several people can sit under the same one, so nothing here has to be unique.
router.post('/', requireManagement, validateCreateContact, (req, res) => {
  try {
    const { companyId, contactName, phone, email } = req.body;

    const company = companyQueries.getById.get(companyId);
    if (!company) {
      return res.status(400).json({ error: 'Pick a company for this person first' });
    }

    const id = uuidv4();
    contactQueries.create.run(id, companyId, contactName || null, phone || null, email || null);

    const contact = contactQueries.getById.get(id);
    recordHistory('contact', id, 'create', req.user.userId, req.user.name || req.user.username, {
      contactName: { from: null, to: contact.contact_name },
      companyName: { from: null, to: company.name }
    });

    res.status(201).json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to create contact');
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Edit a person's own details. Which company they belong to
// is fixed: moving a person between companies would move who past jobs were taken
// for, so a person who has left starts a new record at the new company instead.
router.put('/:id', requireManagement, validateUpdateContact, (req, res) => {
  try {
    const { id } = req.params;
    const { contactName, phone, email } = req.body;

    const existing = contactQueries.getById.get(id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    const changes = {};
    if (normalizeEmpty(contactName) !== normalizeEmpty(existing.contact_name)) changes.contactName = { from: existing.contact_name, to: contactName || null };
    if (normalizeEmpty(phone) !== normalizeEmpty(existing.phone)) changes.phone = { from: existing.phone, to: phone || null };
    if (normalizeEmpty(email) !== normalizeEmpty(existing.email)) changes.email = { from: existing.email, to: email || null };

    contactQueries.update.run(contactName || null, phone || null, email || null, id);
    const contact = contactQueries.getById.get(id);

    if (Object.keys(changes).length > 0) {
      recordHistory('contact', id, 'update', req.user.userId, req.user.name || req.user.username, changes, toApiFormat(contact));
    }

    res.json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to update contact');
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// POST /api/contacts/:id/archive - Retire a person who has left. Never deleted:
// their jobs keep naming them, they just stop being offered on new work.
router.post('/:id/archive', requireManagement, (req, res) => {
  try {
    const { id } = req.params;
    const existing = contactQueries.getById.get(id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    if (existing.archived) return res.json(toApiFormat(existing));

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

// POST /api/contacts/:id/unarchive - Bring a retired person back.
router.post('/:id/unarchive', requireManagement, (req, res) => {
  try {
    const { id } = req.params;
    const existing = contactQueries.getById.get(id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    if (!existing.archived) return res.json(toApiFormat(existing));

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
