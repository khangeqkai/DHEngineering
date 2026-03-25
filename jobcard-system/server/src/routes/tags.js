const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { tagQueries, recordHistory } = require('../db/database');

const router = express.Router();

const VALID_CATEGORIES = ['treatment', 'customer_property', 'drawings', 'job_type'];

function nameToValue(name) {
  return name.toUpperCase().replace(/[\s/]+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

function formatTag(t) {
  return {
    id: t.id,
    category: t.category,
    name: t.name,
    value: t.value,
    sortOrder: t.sort_order,
    createdAt: t.created_at
  };
}

// All routes require authentication
router.use(authenticate);

// GET /api/tags/categories - List available tag categories
router.get('/categories', (req, res) => {
  res.json(VALID_CATEGORIES.map(c => ({
    value: c,
    label: c.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  })));
});

// GET /api/tags - List tags, optional ?category=treatment
router.get('/', (req, res) => {
  try {
    const { category } = req.query;

    let tags;
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
      }
      tags = tagQueries.getByCategory.all(category);
    } else {
      tags = tagQueries.getAll.all();
    }

    res.json(tags.map(formatTag));
  } catch (err) {
    logger.error({ err }, 'Failed to get tags');
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// GET /api/tags/:id - Get single tag
router.get('/:id', requireAdmin, (req, res) => {
  try {
    const tag = tagQueries.getById.get(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    res.json(formatTag(tag));
  } catch (err) {
    logger.error({ err }, 'Failed to get tag');
    res.status(500).json({ error: 'Failed to get tag' });
  }
});

// POST /api/tags - Create new tag (admin only)
router.post('/', requireAdmin, (req, res) => {
  try {
    const { category, name } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category is required and must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const trimmedName = name.trim();
    const value = nameToValue(trimmedName);

    // Check if tag already exists in this category
    const existing = tagQueries.getByValue.get(category, value);
    if (existing) {
      return res.status(400).json({ error: 'Tag already exists in this category' });
    }

    const id = uuidv4();
    const maxSort = tagQueries.getMaxSortOrder.get(category);
    const sortOrder = (maxSort?.max_sort || 0) + 1;

    tagQueries.create.run(id, category, trimmedName, value, sortOrder);

    const tag = tagQueries.getById.get(id);
    recordHistory('tag', id, 'create', req.user.userId, req.user.name || req.user.username, {
      name: { from: null, to: tag.name },
      category: { from: null, to: tag.category }
    });

    res.status(201).json(formatTag(tag));
  } catch (err) {
    logger.error({ err }, 'Failed to create tag');
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// PUT /api/tags/:id - Update tag (admin only)
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const existing = tagQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const trimmedName = name.trim();
    const value = nameToValue(trimmedName);

    // Check for duplicate value in same category (different id)
    const duplicate = tagQueries.getByValue.get(existing.category, value);
    if (duplicate && duplicate.id !== id) {
      return res.status(400).json({ error: 'Another tag with this name already exists in this category' });
    }

    tagQueries.update.run(trimmedName, value, id);

    const changes = {};
    if (trimmedName !== existing.name) {
      changes.name = { from: existing.name, to: trimmedName };
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('tag', id, 'update', req.user.userId, req.user.name || req.user.username, changes);
    }

    res.json(formatTag(tagQueries.getById.get(id)));
  } catch (err) {
    logger.error({ err }, 'Failed to update tag');
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// DELETE /api/tags/:id - Delete tag (admin only, custom tags only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = tagQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    tagQueries.delete.run(id);
    recordHistory('tag', id, 'delete', req.user.userId, req.user.name || req.user.username, {
      name: { from: existing.name, to: null },
      category: { from: existing.category, to: null }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete tag');
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

module.exports = router;
