const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { serviceTagQueries, recordHistory } = require('../db/database');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/service-tags - Get all service tags
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const tags = includeInactive
      ? serviceTagQueries.getAllIncludeInactive.all()
      : serviceTagQueries.getAll.all();
    res.json(tags);
  } catch (err) {
    logger.error({ err }, 'Failed to get service tags');
    res.status(500).json({ error: 'Failed to get service tags' });
  }
});

// GET /api/service-tags/:id - Get single service tag
router.get('/:id', (req, res) => {
  try {
    const tag = serviceTagQueries.getById.get(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: 'Service tag not found' });
    }
    res.json(tag);
  } catch (err) {
    logger.error({ err }, 'Failed to get service tag');
    res.status(500).json({ error: 'Failed to get service tag' });
  }
});

// POST /api/service-tags - Create new service tag (admin only)
router.post('/', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const trimmedName = name.trim();

    // Check if tag already exists
    const existing = serviceTagQueries.getByName.get(trimmedName);
    if (existing) {
      // If it exists but inactive, reactivate it
      if (!existing.active) {
        serviceTagQueries.activate.run(existing.id);
        const reactivated = serviceTagQueries.getById.get(existing.id);
        return res.json(reactivated);
      }
      return res.status(400).json({ error: 'Service tag already exists' });
    }

    const id = uuidv4();
    serviceTagQueries.create.run(id, trimmedName, 0); // is_system = 0 for custom tags

    const tag = serviceTagQueries.getById.get(id);
    recordHistory('service_tag', id, 'created', req.user.userId, req.user.name || req.user.username, null, tag);

    res.status(201).json(tag);
  } catch (err) {
    logger.error({ err }, 'Failed to create service tag');
    res.status(500).json({ error: 'Failed to create service tag' });
  }
});

// PUT /api/service-tags/:id - Update service tag (admin only, custom tags only)
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const existing = serviceTagQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Service tag not found' });
    }

    if (existing.is_system) {
      return res.status(400).json({ error: 'Cannot modify system tags' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    serviceTagQueries.update.run(name.trim(), id);
    const tag = serviceTagQueries.getById.get(id);

    const changes = {};
    if (name.trim() !== existing.name) {
      changes.name = { from: existing.name, to: name.trim() };
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('service_tag', id, 'updated', req.user.userId, req.user.name || req.user.username, changes, tag);
    }

    res.json(tag);
  } catch (err) {
    logger.error({ err }, 'Failed to update service tag');
    res.status(500).json({ error: 'Failed to update service tag' });
  }
});

// DELETE /api/service-tags/:id - Delete service tag (admin only, custom tags only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = serviceTagQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Service tag not found' });
    }

    if (existing.is_system) {
      return res.status(400).json({ error: 'Cannot delete system tags' });
    }

    serviceTagQueries.delete.run(id);
    recordHistory('service_tag', id, 'deleted', req.user.userId, req.user.name || req.user.username, null, existing);

    res.json({ message: 'Service tag deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to delete service tag');
    res.status(500).json({ error: 'Failed to delete service tag' });
  }
});

module.exports = router;
