const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { tagQueries, recordHistory, actorName } = require('../db/database');
const { setArchived } = require('../utils/archiveToggle');
const { nameToValue } = require('../utils/tagSlug');
const { findOr404 } = require('../utils/findOr404');
const { sameName } = require('../shared/names');

const router = express.Router();

const VALID_CATEGORIES = ['treatment', 'customer_property', 'drawings', 'job_type', 'material'];

// The stored code drops decimal points, fractions, accents and other symbols, so two
// really different names can share one code ("M6 x 1.0" / "M6 x 10" both become
// M6_X_10). A code match only means "the same option" when the names are also the
// same (capitals and spacing ignored); otherwise the new name is refused, naming the
// option that already holds the code, rather than silently handing that one back.
function codeClashMessage(typedName, holder) {
  return holder.archived
    ? `"${typedName}" would be stored the same as the retired option "${holder.name}". Use a name that differs in its letters or numbers, or turn on "Show archived" and restore that one.`
    : `"${typedName}" would be stored the same as the existing option "${holder.name}". Use a name that differs in its letters or numbers.`;
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
router.get('/:id', requireManagement, (req, res) => {
  try {
    const tag = findOr404(res, tagQueries.getById.get(req.params.id), 'Tag not found');
    if (!tag) return;
    res.json(formatTag(tag));
  } catch (err) {
    logger.error({ err }, 'Failed to get tag');
    res.status(500).json({ error: 'Failed to get tag' });
  }
});

// POST /api/tags - Create new tag (admin or manager)
router.post('/', requireManagement, (req, res) => {
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

    // Check if tag already exists in this category. Creating is idempotent: the same
    // name (capitals and spacing ignored) as an existing option just returns that
    // option instead of erroring, so "add on the spot" never makes a duplicate. An
    // archived match is brought back (with the freshly typed name); an active match
    // is returned as-is. Either way we return 200 (a genuinely new tag returns 201
    // below). A different name that only shares the code is refused.
    const existing = tagQueries.getByValue.get(category, value);
    if (existing && !sameName(existing.name, trimmedName)) {
      return res.status(400).json({ error: codeClashMessage(trimmedName, existing) });
    }
    if (existing) {
      if (existing.archived) {
        tagQueries.update.run(trimmedName, value, existing.id);
        tagQueries.unarchive.run(existing.id);
        const restored = tagQueries.getById.get(existing.id);
        const restoreChanges = { status: { from: 'Archived', to: 'Active' } };
        if (trimmedName !== existing.name) {
          restoreChanges.name = { from: existing.name, to: trimmedName };
        }
        recordHistory('tag', existing.id, 'unarchive', req.user.userId, actorName(req), restoreChanges);
        return res.status(200).json(formatTag(restored));
      }
      return res.status(200).json(formatTag(existing));
    }

    const id = uuidv4();
    const maxSort = tagQueries.getMaxSortOrder.get(category);
    const sortOrder = (maxSort?.max_sort || 0) + 1;

    tagQueries.create.run(id, category, trimmedName, value, sortOrder);

    const tag = tagQueries.getById.get(id);
    recordHistory('tag', id, 'create', req.user.userId, actorName(req), {
      name: { from: null, to: tag.name },
      category: { from: null, to: tag.category }
    });

    res.status(201).json(formatTag(tag));
  } catch (err) {
    logger.error({ err }, 'Failed to create tag');
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// PUT /api/tags/:id - Update tag (admin or manager)
router.put('/:id', requireManagement, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const existing = findOr404(res, tagQueries.getById.get(id), 'Tag not found');
    if (!existing) return;

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

    // Check for duplicate value in same category (different id). getByValue
    // returns archived rows too, so an invisible retired option can collide.
    // Point the admin to the archived list instead of dead-ending on a flat
    // "already exists" error they can't see or resolve.
    const duplicate = tagQueries.getByValue.get(existing.category, value);
    if (duplicate && duplicate.id !== id) {
      if (!sameName(duplicate.name, trimmedName)) {
        return res.status(400).json({ error: codeClashMessage(trimmedName, duplicate) });
      }
      if (duplicate.archived) {
        return res.status(400).json({
          error: `A retired option named "${duplicate.name}" already uses this name. Turn on "Show archived" and restore it instead of renaming.`
        });
      }
      return res.status(400).json({ error: `Another option, "${duplicate.name}", already has this name in this category` });
    }

    // Jobs reference an option by its value, which is derived from the name.
    // A rename that changes the value would strand it on jobs already using it,
    // and one that keeps the value but really changes the name ("M6 x 1.0" →
    // "M6 x 10") would relabel every job using it — so block both while jobs use
    // it, allowing only capitals/spacing tweaks of the same name.
    if (value !== existing.value || !sameName(trimmedName, existing.name)) {
      const usageQuery = USAGE_COUNT_BY_CATEGORY[existing.category];
      const usage = usageQuery ? usageQuery.get(existing.value) : { count: 0 };
      if (usage.count > 0) {
        return res.status(400).json({
          error: `Cannot rename: ${usage.count} job part(s) still use the "${existing.name}" option`
        });
      }
    }

    tagQueries.update.run(trimmedName, value, id);

    const changes = {};
    if (trimmedName !== existing.name) {
      changes.name = { from: existing.name, to: trimmedName };
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('tag', id, 'update', req.user.userId, actorName(req), changes);
    }

    res.json(formatTag(tagQueries.getById.get(id)));
  } catch (err) {
    logger.error({ err }, 'Failed to update tag');
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// DELETE /api/tags/:id - Archive tag (admin or manager). We never hard-delete an option:
// jobs reference it by value, so removing the row would strand it on every job that
// used it. Archiving pulls it from the pickers for new work while keeping old jobs intact.
router.delete('/:id', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'tag',
    load: () => tagQueries.getById.get(id),
    notFound: 'Tag not found',
    isArchived: (row) => Boolean(row.archived),
    archive: true,
    write: (row) => tagQueries.archive.run(row.id),
    respond: () => ({ success: true }),
    snapshot: (row) => ({ name: row.name })
  });
});

// POST /api/tags/:id/activate - Restore an archived tag (admin or manager)
router.post('/:id/activate', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'tag',
    load: () => tagQueries.getById.get(id),
    notFound: 'Tag not found',
    isArchived: (row) => Boolean(row.archived),
    archive: false,
    write: (row) => tagQueries.unarchive.run(row.id),
    respond: (row) => formatTag(row),
    snapshot: (row) => ({ name: row.name })
  });
});

module.exports = router;
