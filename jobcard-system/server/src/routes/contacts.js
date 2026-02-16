const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateCreateContact, validateUpdateContact } = require('../middleware/validation');
const { contactQueries, recordHistory } = require('../db/database');

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
  createdAt: c.created_at,
  updatedAt: c.updated_at
});

// All routes require authentication
router.use(authenticate);

// GET /api/contacts - Get all contacts (admin only)
router.get('/', requireAdmin, (req, res) => {
  try {
    const contacts = contactQueries.getAll.all();
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

    const id = uuidv4();

    contactQueries.create.run(
      id,
      contactName,
      companyName || null,
      phone || null,
      email || null,
      address || null,
      notes || null
    );

    const contact = contactQueries.getById.get(id);

    // Record history
    recordHistory('contact', id, 'created', req.user.id, req.user.name || req.user.username, null, toApiFormat(contact));

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

    contactQueries.update.run(
      contactName,
      companyName || null,
      phone || null,
      email || null,
      address || null,
      notes || null,
      id
    );

    const contact = contactQueries.getById.get(id);

    // Record history
    recordHistory('contact', id, 'updated', req.user.id, req.user.name || req.user.username, req.body, toApiFormat(contact));

    res.json(toApiFormat(contact));
  } catch (err) {
    logger.error({ err }, 'Failed to update contact');
    res.status(500).json({ error: 'Failed to update contact' });
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

    contactQueries.unlinkJobcards.run(id);
    contactQueries.delete.run(id);

    recordHistory('contact', id, 'deleted', req.user.id, req.user.name || req.user.username, null, toApiFormat(existing));

    res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to delete contact');
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

module.exports = router;
