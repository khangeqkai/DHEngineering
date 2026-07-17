const express = require('express');
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { historyQueries } = require('../db/database');

const router = express.Router();

// Get recent activity (admin or manager)
router.get('/', authenticate, requireManagement, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const history = historyQueries.getRecent.all(limit);

    res.json(history.map(h => ({
      id: h.id,
      entityType: h.entity_type,
      entityId: h.entity_id,
      action: h.action,
      userId: h.user_id,
      userName: h.user_name,
      changes: h.changes ? JSON.parse(h.changes) : null,
      snapshot: h.snapshot ? JSON.parse(h.snapshot) : null,
      createdAt: h.created_at
    })));
  } catch (err) {
    logger.error({ err }, 'Get history error');
    res.status(500).json({ error: 'Failed to get activity history' });
  }
});

// Get activity by user (admin or manager)
router.get('/user/:userId', authenticate, requireManagement, (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const history = historyQueries.getByUser.all(req.params.userId, limit);

    res.json(history.map(h => ({
      id: h.id,
      entityType: h.entity_type,
      entityId: h.entity_id,
      action: h.action,
      userId: h.user_id,
      userName: h.user_name,
      changes: h.changes ? JSON.parse(h.changes) : null,
      snapshot: h.snapshot ? JSON.parse(h.snapshot) : null,
      createdAt: h.created_at
    })));
  } catch (err) {
    logger.error({ err }, 'Get user history error');
    res.status(500).json({ error: 'Failed to get user activity' });
  }
});

// Get activity by entity type (admin or manager)
router.get('/entity/:entityType', authenticate, requireManagement, (req, res) => {
  try {
    const allowedTypes = ['user', 'contact', 'supplier', 'machine'];
    const { entityType } = req.params;
    if (!allowedTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    const PAGE_SIZE = 50;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * PAGE_SIZE;

    const { count: total } = historyQueries.countByEntityType.get(entityType);
    const history = historyQueries.getByEntityType.all(entityType, PAGE_SIZE, offset);

    res.json({
      data: history.map(h => ({
        id: h.id,
        entityType: h.entity_type,
        entityId: h.entity_id,
        action: h.action,
        userId: h.user_id,
        userName: h.user_name,
        changes: h.changes ? JSON.parse(h.changes) : null,
        snapshot: h.snapshot ? JSON.parse(h.snapshot) : null,
        createdAt: h.created_at
      })),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (err) {
    logger.error({ err }, 'Get entity type history error');
    res.status(500).json({ error: 'Failed to get entity activity' });
  }
});

module.exports = router;
