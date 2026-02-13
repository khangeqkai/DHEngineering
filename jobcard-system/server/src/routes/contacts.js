const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateCreateContact, validateUpdateContact } = require('../middleware/validation');
const { contactQueries, recordHistory } = require('../db/database');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/contacts - Get all contacts
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const contacts = includeInactive
      ? contactQueries.getAllIncludeInactive.all()
      : contactQueries.getAll.all();
    res.json(contacts);
  } catch (err) {
    logger.error({ err }, 'Failed to get contacts');
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// GET /api/contacts/search - Search contacts by name or company
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    const searchTerm = `%${q}%`;
    const contacts = contactQueries.search.all(searchTerm, searchTerm);
    res.json(contacts);
  } catch (err) {
    logger.error({ err }, 'Failed to search contacts');
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

// GET /api/contacts/:id - Get single contact
router.get('/:id', (req, res) => {
  try {
    const contact = contactQueries.getById.get(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(contact);
  } catch (err) {
    logger.error({ err }, 'Failed to get contact');
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

// POST /api/contacts - Create new contact
router.post('/', validateCreateContact, (req, res) => {
  try {
    const { contact_name, company_name, phone, email, address, is_critical_qa, notes } = req.body;

    const id = uuidv4();

    contactQueries.create.run(
      id,
      contact_name,
      company_name || null,
      phone || null,
      email || null,
      address || null,
      is_critical_qa ? 1 : 0,
      notes || null
    );

    const contact = contactQueries.getById.get(id);

    // Record history
    recordHistory('contact', id, 'created', req.user.id, req.user.name || req.user.username, null, contact);

    res.status(201).json(contact);
  } catch (err) {
    logger.error({ err }, 'Failed to create contact');
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', validateUpdateContact, (req, res) => {
  try {
    const { id } = req.params;
    const { contact_name, company_name, phone, email, address, is_critical_qa, notes } = req.body;

    const existing = contactQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contactQueries.update.run(
      contact_name,
      company_name || null,
      phone || null,
      email || null,
      address || null,
      is_critical_qa ? 1 : 0,
      notes || null,
      id
    );

    const contact = contactQueries.getById.get(id);

    // Record history
    recordHistory('contact', id, 'updated', req.user.id, req.user.name || req.user.username, req.body, contact);

    res.json(contact);
  } catch (err) {
    logger.error({ err }, 'Failed to update contact');
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// POST /api/contacts/:id/deactivate - Deactivate contact
router.post('/:id/deactivate', (req, res) => {
  try {
    const { id } = req.params;

    const existing = contactQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contactQueries.deactivate.run(id);
    const contact = contactQueries.getById.get(id);

    recordHistory('contact', id, 'deactivated', req.user.id, req.user.name || req.user.username, null, contact);

    res.json(contact);
  } catch (err) {
    logger.error({ err }, 'Failed to deactivate contact');
    res.status(500).json({ error: 'Failed to deactivate contact' });
  }
});

// POST /api/contacts/:id/activate - Activate contact
router.post('/:id/activate', (req, res) => {
  try {
    const { id } = req.params;

    const existing = contactQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contactQueries.activate.run(id);
    const contact = contactQueries.getById.get(id);

    recordHistory('contact', id, 'activated', req.user.id, req.user.name || req.user.username, null, contact);

    res.json(contact);
  } catch (err) {
    logger.error({ err }, 'Failed to activate contact');
    res.status(500).json({ error: 'Failed to activate contact' });
  }
});

// DELETE /api/contacts/:id - Delete contact (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = contactQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contactQueries.delete.run(id);

    recordHistory('contact', id, 'deleted', req.user.id, req.user.name || req.user.username, null, existing);

    res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to delete contact');
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

module.exports = router;
