const express = require('express');
const logger = require('../utils/logger');
const { authenticate, requireAdmin, requireManagement } = require('../middleware/auth');
const { historyQueries, db } = require('../db/database');

const router = express.Router();

// Get recent activity (admin only — the trail carries pricing changes, which
// managers are barred from seeing)
router.get('/', authenticate, requireAdmin, (req, res) => {
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

// Get activity by user (admin only)
router.get('/user/:userId', authenticate, requireAdmin, (req, res) => {
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

// Get activity by entity type (admin or manager — user/company/contact/supplier/
// machine history carries no pricing; managers manage these entities and see their logs)
router.get('/entity/:entityType', authenticate, requireManagement, (req, res) => {
  try {
    const allowedTypes = ['user', 'company', 'contact', 'supplier', 'machine'];
    // Comma-separated so one screen can show a combined trail — the Customers page
    // manages both the company and the people at it, and splitting their history
    // across two logs would hide "Jane became Janey" from whoever went looking.
    const types = String(req.params.entityType).split(',').map(t => t.trim()).filter(Boolean);
    if (types.length === 0 || types.some(t => !allowedTypes.includes(t))) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    const PAGE_SIZE = 50;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * PAGE_SIZE;

    const placeholders = types.map(() => '?').join(', ');
    const { count: total } = db
      .prepare(`SELECT COUNT(*) as count FROM history WHERE entity_type IN (${placeholders})`)
      .get(...types);
    const history = db
      .prepare(`SELECT * FROM history WHERE entity_type IN (${placeholders}) ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...types, PAGE_SIZE, offset);

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
