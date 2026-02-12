const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateCreateCustomer, validateUpdateCustomer } = require('../middleware/validation');
const { customerQueries, recordHistory } = require('../db/database');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/customers - Get all customers
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const customers = includeInactive
      ? customerQueries.getAllIncludeInactive.all()
      : customerQueries.getAll.all();
    res.json(customers);
  } catch (err) {
    logger.error({ err }, 'Failed to get customers');
    res.status(500).json({ error: 'Failed to get customers' });
  }
});

// GET /api/customers/search - Search customers by name
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }
    const customers = customerQueries.search.all(`%${q}%`);
    res.json(customers);
  } catch (err) {
    logger.error({ err }, 'Failed to search customers');
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// GET /api/customers/:id - Get single customer
router.get('/:id', (req, res) => {
  try {
    const customer = customerQueries.getById.get(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
  } catch (err) {
    logger.error({ err }, 'Failed to get customer');
    res.status(500).json({ error: 'Failed to get customer' });
  }
});

// POST /api/customers - Create new customer
router.post('/', validateCreateCustomer, (req, res) => {
  try {
    const { name, contact_name, contact_phone, contact_email, address, is_critical_qa, notes } = req.body;

    const id = uuidv4();

    customerQueries.create.run(
      id,
      name,
      contact_name || null,
      contact_phone || null,
      contact_email || null,
      address || null,
      is_critical_qa ? 1 : 0,
      notes || null
    );

    const customer = customerQueries.getById.get(id);

    // Record history
    recordHistory('customer', id, 'created', req.user.id, req.user.name || req.user.username, null, customer);

    res.status(201).json(customer);
  } catch (err) {
    logger.error({ err }, 'Failed to create customer');
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT /api/customers/:id - Update customer
router.put('/:id', validateUpdateCustomer, (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_name, contact_phone, contact_email, address, is_critical_qa, notes } = req.body;

    const existing = customerQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customerQueries.update.run(
      name,
      contact_name || null,
      contact_phone || null,
      contact_email || null,
      address || null,
      is_critical_qa ? 1 : 0,
      notes || null,
      id
    );

    const customer = customerQueries.getById.get(id);

    // Record history
    recordHistory('customer', id, 'updated', req.user.id, req.user.name || req.user.username, req.body, customer);

    res.json(customer);
  } catch (err) {
    logger.error({ err }, 'Failed to update customer');
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// POST /api/customers/:id/deactivate - Deactivate customer
router.post('/:id/deactivate', (req, res) => {
  try {
    const { id } = req.params;

    const existing = customerQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customerQueries.deactivate.run(id);
    const customer = customerQueries.getById.get(id);

    recordHistory('customer', id, 'deactivated', req.user.id, req.user.name || req.user.username, null, customer);

    res.json(customer);
  } catch (err) {
    logger.error({ err }, 'Failed to deactivate customer');
    res.status(500).json({ error: 'Failed to deactivate customer' });
  }
});

// POST /api/customers/:id/activate - Activate customer
router.post('/:id/activate', (req, res) => {
  try {
    const { id } = req.params;

    const existing = customerQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customerQueries.activate.run(id);
    const customer = customerQueries.getById.get(id);

    recordHistory('customer', id, 'activated', req.user.id, req.user.name || req.user.username, null, customer);

    res.json(customer);
  } catch (err) {
    logger.error({ err }, 'Failed to activate customer');
    res.status(500).json({ error: 'Failed to activate customer' });
  }
});

// DELETE /api/customers/:id - Delete customer (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = customerQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    customerQueries.delete.run(id);

    recordHistory('customer', id, 'deleted', req.user.id, req.user.name || req.user.username, null, existing);

    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to delete customer');
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

module.exports = router;
