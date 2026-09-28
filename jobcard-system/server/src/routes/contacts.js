const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { validateCreateContact, validateUpdateContact } = require('../middleware/validation');
const { companyQueries, contactQueries, recordHistory, actorName } = require('../db/database');
const { diffFields } = require('../utils/historyChanges');
const { toContactApi: toApiFormat } = require('./customer-format');
const { setArchived } = require('../utils/archiveToggle');
const { findOr404 } = require('../utils/findOr404');
const { refuseField } = require('./name-conflict');

// A person has to carry something that says who they are or how to reach them.
// Any one of the three is enough — a front desk with only a phone number is a
// fair entry — but a person with none of them would be an "Unnamed" nobody offered
// on every new job (and picked for it automatically when they're the only one).
const BLANK_PERSON_MESSAGE = 'Enter a name, phone or email';
const isBlankPerson = (...values) => values.every(v => !v || !String(v).trim());

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

    if (isBlankPerson(contactName, phone, email)) {
      return refuseField(res, 400, 'contactName', BLANK_PERSON_MESSAGE);
    }

    const company = companyQueries.getById.get(companyId);
    if (!company) {
      return res.status(400).json({ error: 'Pick a company for this person first' });
    }
    if (company.archived) {
      return res.status(409).json({ error: 'That customer is archived. Restore it before adding people.' });
    }

    const id = uuidv4();
    contactQueries.create.run(id, companyId, contactName || null, phone || null, email || null);

    const contact = contactQueries.getById.get(id);
    recordHistory('contact', id, 'create', req.user.userId, actorName(req), {
      contactName: { from: null, to: contact.contact_name },
      companyName: { from: null, to: company.name },
      ...(contact.phone ? { phone: { from: null, to: contact.phone } } : {}),
      ...(contact.email ? { email: { from: null, to: contact.email } } : {})
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
    const existing = findOr404(res, contactQueries.getById.get(id), 'Contact not found');
    if (!existing) return;

    // A field left out of the request keeps the stored value; only a sent one
    // (blank included) replaces it. The person form sends only what was changed,
    // so an edit made elsewhere while it was open isn't put back from its older copy.
    const contactName = req.body.contactName === undefined ? existing.contact_name : req.body.contactName;
    const phone = req.body.phone === undefined ? existing.phone : req.body.phone;
    const email = req.body.email === undefined ? existing.email : req.body.email;

    if (isBlankPerson(contactName, phone, email)) {
      return refuseField(res, 400, 'contactName', BLANK_PERSON_MESSAGE);
    }

    const changes = diffFields(existing, [
      ['contact_name', 'contactName', contactName || null],
      ['phone', 'phone', phone || null],
      ['email', 'email', email || null],
    ]);

    contactQueries.update.run(contactName || null, phone || null, email || null, id);
    const contact = contactQueries.getById.get(id);

    if (Object.keys(changes).length > 0) {
      recordHistory('contact', id, 'update', req.user.userId, actorName(req), changes, toApiFormat(contact));
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
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'contact',
    load: () => contactQueries.getById.get(id),
    notFound: 'Contact not found',
    isArchived: (row) => Boolean(row.archived),
    archive: true,
    write: (row) => contactQueries.archive.run(row.id),
    respond: (row) => toApiFormat(row),
    snapshot: (row) => ({ companyName: row.company_name, contactName: row.contact_name })
  });
});

// POST /api/contacts/:id/unarchive - Bring a retired person back.
router.post('/:id/unarchive', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'contact',
    load: () => contactQueries.getById.get(id),
    notFound: 'Contact not found',
    isArchived: (row) => Boolean(row.archived),
    archive: false,
    write: (row) => contactQueries.unarchive.run(row.id),
    respond: (row) => toApiFormat(row),
    snapshot: (row) => ({ companyName: row.company_name, contactName: row.contact_name })
  });
});

module.exports = router;
