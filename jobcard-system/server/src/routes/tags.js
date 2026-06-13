const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { tagQueries, recordHistory } = require('../db/database');

const router = express.Router();

const VALID_CATEGORIES = ['treatment', 'customer_property', 'drawings', 'job_type', 'material'];

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
    archived: Boolean(t.archived),
    createdAt: t.created_at
  };
}

// Maps each category to the query that counts how many job line items still use a
// value. Used to block a value-changing rename while the option is in use (a rename
// would strand it). Archiving needs no such guard — old jobs keep resolving.
const USAGE_COUNT_BY_CATEGORY = {
  treatment: tagQueries.countItemsByTreatmentValue,
  material: tagQueries.countItemsByMaterialValue,
  job_type: tagQueries.countItemsByJobTypeValue,
  drawings: tagQueries.countItemsByDrawingsValue,
  customer_property: tagQueries.countItemsByCustomerPropertyValue
};

// All routes require authentication
router.use(authenticate);

// GET /api/tags/categories - List available tag categories
router.get('/categories', (req, res) => {
  res.json(VALID_CATEGORIES.map(c => ({
    value: c,
    label: c.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  })));
});

// GET /api/tags - List tags, optional ?category=treatment, optional ?includeArchived=true
router.get('/', (req, res) => {
  try {
    const { category } = req.query;
    const includeArchived = req.query.includeArchived === 'true';

    let tags;
    if (category) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
      }
      tags = includeArchived
        ? tagQueries.getByCategoryIncludeArchived.all(category)
        : tagQueries.getByCategory.all(category);
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

    // Symbol/emoji-only names strip down to an empty internal key, which would
    // collide with any other empty-key tag and never match a job line. Reject up front.
    if (!value) {
      return res.status(400).json({ error: 'Tag name must include at least one letter or number' });
    }

    // Check if tag already exists in this category. An archived match is the same
    // option a retired choice; bring it back (with the freshly typed name) rather
    // than inserting a duplicate that would hit the UNIQUE(category, value) rule.
    const existing = tagQueries.getByValue.get(category, value);
    if (existing) {
      if (existing.archived) {
        tagQueries.update.run(trimmedName, value, existing.id);
        tagQueries.unarchive.run(existing.id);
        const restored = tagQueries.getById.get(existing.id);
        recordHistory('tag', existing.id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
          status: { from: 'Archived', to: 'Active' }
        });
        return res.status(200).json(formatTag(restored));
      }
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

    // Symbol/emoji-only names strip down to an empty internal key, which would
    // collide with any other empty-key tag and never match a job line. Reject up front.
    if (!value) {
      return res.status(400).json({ error: 'Tag name must include at least one letter or number' });
    }

    // Check for duplicate value in same category (different id)
    const duplicate = tagQueries.getByValue.get(existing.category, value);
    if (duplicate && duplicate.id !== id) {
      return res.status(400).json({ error: 'Another tag with this name already exists in this category' });
    }

    // Jobs reference an option by its value, which is derived from the name.
    // A rename that changes the value would strand it on jobs already using it,
    // so block that — but allow display-only tweaks that map to the same value.
    if (value !== existing.value) {
      const usageQuery = USAGE_COUNT_BY_CATEGORY[existing.category];
      const usage = usageQuery ? usageQuery.get(existing.value) : { count: 0 };
      if (usage.count > 0) {
        return res.status(400).json({
          error: `Cannot rename: ${usage.count} job line item(s) still use the "${existing.name}" option`
        });
      }
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

// DELETE /api/tags/:id - Archive tag (admin only). We never hard-delete an option:
// jobs reference it by value, so removing the row would strand it on every job that
// used it. Archiving pulls it from the pickers for new work while keeping old jobs intact.
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = tagQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    if (existing.archived) {
      return res.json({ success: true });
    }

    tagQueries.archive.run(id);
    recordHistory('tag', id, 'archive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Active', to: 'Archived' }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to archive tag');
    res.status(500).json({ error: 'Failed to archive tag' });
  }
});

// POST /api/tags/:id/activate - Restore an archived tag (admin only)
router.post('/:id/activate', requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = tagQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    tagQueries.unarchive.run(id);
    recordHistory('tag', id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Archived', to: 'Active' }
    });

    res.json(formatTag(tagQueries.getById.get(id)));
  } catch (err) {
    logger.error({ err }, 'Failed to restore tag');
    res.status(500).json({ error: 'Failed to restore tag' });
  }
});

module.exports = router;
