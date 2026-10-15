const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { db, tagQueries, recordHistory, actorName } = require('../db/database');
const { setArchived } = require('../utils/archiveToggle');
const { nameToValue } = require('../utils/tagSlug');
const { findOr404 } = require('../utils/findOr404');
const { sameName } = require('../shared/names');
const { refuseField } = require('./name-conflict');
const { splitAnswer } = require('../shared/lineItemAnswers');

const router = express.Router();

const VALID_CATEGORIES = ['treatment', 'customer_property', 'drawings', 'job_type', 'material'];

// The stored code drops decimal points, fractions, accents and other symbols, so two
// really different names can share one code ("M6 x 1.0" / "M6 x 10" both become
// M6_X_10). A code match only means "the same option" when the names are also the
// same (capitals and spacing ignored); otherwise the new name is refused, naming the
// option that already holds the code, rather than silently handing that one back.
function codeClashMessage(typedName, holder) {
  return holder.archived
    ? `"${typedName}" is too close to the archived option "${holder.name}". Use a name that differs in its letters or numbers, or turn on "Show archived" and restore that one.`
    : `"${typedName}" is too close to the existing option "${holder.name}". Use a name that differs in its letters or numbers.`;
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

// How many job line items still use a value, as a count. Used to block a value-changing
// rename while the option is in use (a rename would strand it). Archiving needs no such
// guard — old jobs keep resolving.
const countAnswerUses = (rows, value) => {
  const wanted = String(value).trim();
  return rows.filter(r => splitAnswer(r.answer).includes(wanted)).length;
};

// A part whose treatments won't parse is skipped (and logged) instead of failing the whole
// request — one damaged row must not make every treatment rename fail.
const countTreatmentUses = (value) => {
  let count = 0;
  for (const row of tagQueries.listTreatmentsContaining.all(value)) {
    let list;
    try {
      list = JSON.parse(row.treatments);
    } catch (err) {
      logger.warn({ err, itemId: row.id }, 'Skipped a part with unreadable treatments while checking if an option is in use');
      continue;
    }
    if (Array.isArray(list) && list.some(t => t && t.value === value)) count++;
  }
  return count;
};

const USAGE_COUNT_BY_CATEGORY = {
  treatment: countTreatmentUses,
  material: (value) => tagQueries.countItemsByMaterialValue.get(value).count,
  job_type: (value) => tagQueries.countItemsByJobTypeValue.get(value).count,
  drawings: (value) => countAnswerUses(tagQueries.listDrawingsContaining.all(String(value).trim()), value),
  customer_property: (value) => countAnswerUses(tagQueries.listCustomerPropertyContaining.all(String(value).trim()), value)
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
        return res.status(400).json({ error: 'That list of options doesn\'t exist. Reload the page and try again.' });
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
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment; if it keeps happening, tell the office.' });
  }
});

// GET /api/tags/:id - Get single tag
router.get('/:id', requireManagement, (req, res) => {
  try {
    const tag = findOr404(res, tagQueries.getById.get(req.params.id), "That option couldn't be found. It may have been removed.");
    if (!tag) return;
    res.json(formatTag(tag));
  } catch (err) {
    logger.error({ err }, 'Failed to get tag');
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment; if it keeps happening, tell the office.' });
  }
});

// POST /api/tags - Create new tag (admin or manager)
router.post('/', requireManagement, (req, res) => {
  try {
    const { category, name } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Pick which list this option belongs to.' });
    }

    if (typeof name !== 'string' || !name.trim()) {
      return refuseField(res, 400, 'name', 'Enter a name for this option.');
    }

    const trimmedName = name.trim();
    const value = nameToValue(trimmedName);

    // Symbol/emoji-only names strip down to an empty internal key, which would
    // collide with any other empty-key tag and never match a job line. Reject up front.
    if (!value) {
      return refuseField(res, 400, 'name', 'The name needs at least one letter or number.');
    }

    // Check if tag already exists in this category. Creating is idempotent: the same
    // name (capitals and spacing ignored) as an existing option just returns that
    // option instead of erroring, so "add on the spot" never makes a duplicate. An
    // archived match is brought back (with the freshly typed name); an active match
    // is returned as-is. Either way we return 200 (a genuinely new tag returns 201
    // below). A different name that only shares the code is refused.
    const existing = tagQueries.getByValue.get(category, value);
    if (existing && !sameName(existing.name, trimmedName)) {
      return refuseField(res, 400, 'name', codeClashMessage(trimmedName, existing));
    }
    if (existing) {
      if (existing.archived) {
        let restored;
        db.transaction(() => {
          tagQueries.update.run(trimmedName, value, existing.id);
          tagQueries.unarchive.run(existing.id);
          restored = tagQueries.getById.get(existing.id);
          const restoreChanges = { status: { from: 'Archived', to: 'Active' } };
          if (trimmedName !== existing.name) {
            restoreChanges.name = { from: existing.name, to: trimmedName };
          }
          recordHistory('tag', existing.id, 'unarchive', req.user.userId, actorName(req), restoreChanges,
            { name: restored.name, category: restored.category });
        })();
        return res.status(200).json(formatTag(restored));
      }
      return res.status(200).json(formatTag(existing));
    }

    const id = uuidv4();
    const maxSort = tagQueries.getMaxSortOrder.get(category);
    const sortOrder = (maxSort?.max_sort || 0) + 1;

    let tag;
    db.transaction(() => {
      tagQueries.create.run(id, category, trimmedName, value, sortOrder);

      tag = tagQueries.getById.get(id);
      recordHistory('tag', id, 'create', req.user.userId, actorName(req), {
        name: { from: null, to: tag.name },
        category: { from: null, to: tag.category }
      }, { name: tag.name, category: tag.category });
    })();

    res.status(201).json(formatTag(tag));
  } catch (err) {
    logger.error({ err }, 'Failed to create tag');
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment; if it keeps happening, tell the office.' });
  }
});

// PUT /api/tags/:id - Update tag (admin or manager)
router.put('/:id', requireManagement, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const existing = findOr404(res, tagQueries.getById.get(id), "That option couldn't be found. It may have been removed.");
    if (!existing) return;

    if (typeof name !== 'string' || !name.trim()) {
      return refuseField(res, 400, 'name', 'Enter a name for this option.');
    }

    const trimmedName = name.trim();
    const value = nameToValue(trimmedName);

    // Symbol/emoji-only names strip down to an empty internal key, which would
    // collide with any other empty-key tag and never match a job line. Reject up front.
    if (!value) {
      return refuseField(res, 400, 'name', 'The name needs at least one letter or number.');
    }

    // Check for duplicate value in same category (different id). getByValue
    // returns archived rows too, so an invisible retired option can collide.
    // Point the admin to the archived list instead of dead-ending on a flat
    // "already exists" error they can't see or resolve.
    const duplicate = tagQueries.getByValue.get(existing.category, value);
    if (duplicate && duplicate.id !== id) {
      if (!sameName(duplicate.name, trimmedName)) {
        return refuseField(res, 400, 'name', codeClashMessage(trimmedName, duplicate));
      }
      if (duplicate.archived) {
        return refuseField(res, 400, 'name',
          `An archived option called "${duplicate.name}" already has this name. Turn on "Show archived" and restore it, or choose a different name.`);
      }
      return refuseField(res, 400, 'name', `Another option, "${duplicate.name}", already has this name in this list. Choose a different name.`);
    }

    // Jobs reference an option by its value, which is derived from the name.
    // A rename that changes the value would strand it on jobs already using it,
    // and one that keeps the value but really changes the name ("M6 x 1.0" →
    // "M6 x 10") would relabel every job using it — so block both while jobs use
    // it, allowing only capitals/spacing tweaks of the same name.
    if (value !== existing.value || !sameName(trimmedName, existing.name)) {
      const usageCounter = USAGE_COUNT_BY_CATEGORY[existing.category];
      const usageCount = usageCounter ? usageCounter(existing.value) : 0;
      if (usageCount > 0) {
        return refuseField(res, 400, 'name',
          `This option can't be renamed because ${usageCount} job part${usageCount === 1 ? ' still uses' : 's still use'} "${existing.name}". Add a new option instead.`);
      }
    }

    const changes = {};
    if (trimmedName !== existing.name) {
      changes.name = { from: existing.name, to: trimmedName };
    }

    db.transaction(() => {
      tagQueries.update.run(trimmedName, value, id);

      if (Object.keys(changes).length > 0) {
        recordHistory('tag', id, 'update', req.user.userId, actorName(req), changes,
          { name: trimmedName, category: existing.category });
      }
    })();

    res.json(formatTag(tagQueries.getById.get(id)));
  } catch (err) {
    logger.error({ err }, 'Failed to update tag');
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment; if it keeps happening, tell the office.' });
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
    notFound: "That option couldn't be found. It may have been removed.",
    isArchived: (row) => Boolean(row.archived),
    archive: true,
    write: (row) => tagQueries.archive.run(row.id),
    respond: () => ({ success: true }),
    snapshot: (row) => ({ name: row.name, category: row.category })
  });
});

// POST /api/tags/:id/activate - Restore an archived tag (admin or manager)
router.post('/:id/activate', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'tag',
    load: () => tagQueries.getById.get(id),
    notFound: "That option couldn't be found. It may have been removed.",
    isArchived: (row) => Boolean(row.archived),
    archive: false,
    write: (row) => tagQueries.unarchive.run(row.id),
    respond: (row) => formatTag(row),
    snapshot: (row) => ({ name: row.name, category: row.category })
  });
});

module.exports = router;
