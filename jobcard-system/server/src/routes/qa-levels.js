const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireManagement, isManagement } = require('../middleware/auth');
const { validateCreateQaLevel, validateUpdateQaLevel } = require('../middleware/validation');
const {
  qaLevelQueries,
  recordHistory,
  actorName
} = require('../db/database');
const { db } = require('../db/connection');
const { findOr404 } = require('../utils/findOr404');
const { findNameClash } = require('./name-conflict');
const { sameName } = require('../shared/names');

const router = express.Router();

function formatLevel(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/qa-levels - List all levels
router.get('/', authenticate, (req, res) => {
  try {
    const canManage = isManagement(req.user.role);

    const levels = qaLevelQueries.getAll.all();
    if (canManage) {
      res.json(levels.map(formatLevel));
    } else {
      // Non-management: just the id and name the job screen's picker needs
      res.json(levels.map(level => ({
        id: level.id,
        name: level.name
      })));
    }
  } catch (err) {
    logger.error({ err }, 'Get QA levels error');
    res.status(500).json({ error: 'Failed to get QA levels' });
  }
});

// GET /api/qa-levels/:id - Get one level (admin or manager)
router.get('/:id', authenticate, requireManagement, (req, res) => {
  try {
    const level = findOr404(res, qaLevelQueries.getById.get(req.params.id), 'QA level not found');
    if (!level) return;

    res.json(formatLevel(level));
  } catch (err) {
    logger.error({ err }, 'Get QA level error');
    res.status(500).json({ error: 'Failed to get QA level' });
  }
});

// POST /api/qa-levels - Create level (admin or manager)
router.post('/',
  authenticate,
  requireManagement,
  validateCreateQaLevel,
  (req, res) => {
    try {
      const { name } = req.body;
      const nameLower = name.trim().toLowerCase();

      // Check for duplicate name (capitals and repeated spaces ignored — the shared
      // sameName rule, so "High  Risk" can't sit beside "High Risk")
      const existing = findNameClash(qaLevelQueries.getAll.all(), name);
      if (existing) {
        return res.status(400).json({ error: 'A QA level with this name already exists' });
      }

      const id = `qa-level:${uuidv4()}`;

      qaLevelQueries.create.run(id, name.trim(), nameLower);

      recordHistory('qa_level', id, 'create', req.user.userId, actorName(req), {
        name: { from: null, to: name.trim() }
      });

      const created = qaLevelQueries.getById.get(id);
      res.status(201).json(formatLevel(created));
    } catch (err) {
      logger.error({ err }, 'Create QA level error');
      res.status(500).json({ error: 'Failed to create QA level' });
    }
  }
);

// PUT /api/qa-levels/:id - Update level (admin or manager)
router.put('/:id',
  authenticate,
  requireManagement,
  validateUpdateQaLevel,
  (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;

      const existing = findOr404(res, qaLevelQueries.getById.get(id), 'QA level not found');
      if (!existing) return;

      const nameLower = name.trim().toLowerCase();

      // Check for duplicate name (different record), by the same rule as create.
      // Only when the name really changes, so re-saving a level that already sits
      // beside a spacing-only twin from before this rule isn't refused.
      const duplicate = sameName(name, existing.name) ? null : findNameClash(qaLevelQueries.getAll.all(), name, id);
      if (duplicate) {
        return res.status(400).json({ error: 'A QA level with this name already exists' });
      }

      // Whether a job is Critical is read from its copied level name, and a rename
      // is copied onto every job already on the level. So moving a level onto or
      // off the name "Critical" while jobs use it would switch the inspection
      // checklist on or off for work that was quoted and done under the old rule.
      const wasCritical = existing.name.trim().toUpperCase() === 'CRITICAL';
      const willBeCritical = name.trim().toUpperCase() === 'CRITICAL';
      if (wasCritical !== willBeCritical && qaLevelQueries.countJobsByLevel.get(id).count > 0) {
        return res.status(400).json({
          error: wasCritical
            ? 'Jobs already on this level rely on its Critical inspection checks, so it can\'t be renamed away from "Critical".'
            : 'Jobs already use this level, so it can\'t be renamed to "Critical" — that would add inspection checks to work already done.'
        });
      }

      const changes = {};
      if (name.trim() !== existing.name) {
        changes.name = { from: existing.name, to: name.trim() };
      }

      // The level's row and every job already copied onto it are updated together:
      // a job's stored quality_level is that copy, and it must never be left
      // pointing at a name the level no longer has.
      const applyRename = db.transaction(() => {
        qaLevelQueries.update.run(name.trim(), nameLower, id);
        if (changes.name) {
          qaLevelQueries.renameOnJobs.run(name.trim().toUpperCase(), id);
        }
      });
      applyRename();

      if (Object.keys(changes).length > 0) {
        recordHistory('qa_level', id, 'update', req.user.userId, actorName(req), changes);
      }

      const updated = qaLevelQueries.getById.get(id);
      res.json(formatLevel(updated));
    } catch (err) {
      logger.error({ err }, 'Update QA level error');
      res.status(500).json({ error: 'Failed to update QA level' });
    }
  }
);

// DELETE /api/qa-levels/:id - Delete level (admin or manager, blocked if used)
router.delete('/:id', authenticate, requireManagement, (req, res) => {
  try {
    const { id } = req.params;

    const existing = findOr404(res, qaLevelQueries.getById.get(id), 'QA level not found');
    if (!existing) return;

    // Check if any jobs use this level
    const usage = qaLevelQueries.countJobsByLevel.get(id);
    if (usage.count > 0) {
      return res.status(400).json({
        error: `Cannot delete: ${usage.count} job card(s) use this QA level`
      });
    }

    qaLevelQueries.delete.run(id);

    recordHistory('qa_level', id, 'delete', req.user.userId, actorName(req), {
      name: { from: existing.name, to: null }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete QA level error');
    res.status(500).json({ error: 'Failed to delete QA level' });
  }
});

module.exports = router;
