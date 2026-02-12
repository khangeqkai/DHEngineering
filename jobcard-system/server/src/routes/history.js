const express = require('express');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { historyQueries } = require('../db/database');

const router = express.Router();

// Get recent activity (admin only)
router.get('/', authenticate, requireRole('admin'), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
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

// Get activity by user (admin only)
router.get('/user/:userId', authenticate, requireRole('admin'), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
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

module.exports = router;
