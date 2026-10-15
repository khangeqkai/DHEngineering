const express = require('express');
const logger = require('../utils/logger');
const { authenticate, requirePermission, requireManagement } = require('../middleware/auth');
const { historyQueries, db } = require('../db/database');
const { readEntries } = require('./jobcard-helpers');
const { officeDayStart, officeDayEnd } = require('../utils/officeTime');

const router = express.Router();

const KINDS = ['jobs', 'customers', 'suppliers', 'users', 'equipment', 'options', 'settings', 'signins', 'backups'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// One trail row as the API sends it. recordName is the record's current name (null when
// the record is gone or the entry is not about one); the screens word the entry from it.
function shapeEntry(h, read) {
  return {
    id: h.id,
    entityType: h.entity_type,
    entityId: h.entity_id,
    // A job's entries also name the job (HISTORY_JOB_NUMBER_SQL) — null otherwise.
    jobNumber: h.job_number ?? null,
    recordName: h.record_name ?? null,
    action: h.action,
    userId: h.user_id,
    userName: h.user_name,
    changes: read.changes,
    snapshot: read.snapshot,
    createdAt: h.created_at
  };
}

// Typed text as a LIKE pattern (wildcards in it are literal).
const likeOf = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

// Get a page of the activity trail (admin only — the trail carries pricing changes,
// which managers are barred from seeing). Query: page (1-based), pageSize (default 50,
// max 200), userId, entityType (a KINDS key — the record-type dropdown), from / to
// (calendar days, read on the office clock, both ends included), q (typed text matched
// against who did it, the job number, the record's name and the stored changes).
// Answers { items, total, page, pageSize }.
router.get('/', authenticate, requirePermission('activityTrail'), (req, res) => {
  try {
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const kind = req.query.entityType ? String(req.query.entityType) : null;
    if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: 'That kind of record isn\'t recognised. Pick one from the list.' });
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return res.status(400).json({ error: 'Enter real dates for the activity filter.' });
    const q = req.query.q ? String(req.query.q).trim() : '';

    const filter = {
      userId: req.query.userId ? String(req.query.userId) : null,
      kind,
      fromAt: from ? officeDayStart(from) : null,
      toAt: to ? officeDayEnd(to) : null,
      like: q ? likeOf(q) : null,
      jsonLike: q ? likeOf(JSON.stringify(q).slice(1, -1)) : null
    };
    const { count: total } = historyQueries.searchCount.get(filter);
    const rows = historyQueries.searchPage.all({ ...filter, limit: pageSize, offset: (page - 1) * pageSize });

    // total counts every matching row, including any whose stored details are damaged
    // (readEntries skips those and logs them), so a page can come back one short.
    res.json({ items: readEntries(rows, shapeEntry, '/'), total, page, pageSize });
  } catch (err) {
    logger.error({ err }, 'Get history error');
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment; if it keeps happening, tell the office.' });
  }
});

// Get activity by user (admin only)
router.get('/user/:userId', authenticate, requirePermission('activityTrail'), (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const history = historyQueries.getByUser.all(req.params.userId, limit);

    res.json(readEntries(history, shapeEntry, '/user/:userId'));
  } catch (err) {
    logger.error({ err }, 'Get user history error');
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment; if it keeps happening, tell the office.' });
  }
});

// Get activity by entity type (admin or manager — user/company/contact/supplier/
// machine/tag history carries no pricing; managers manage these entities and see their logs)
router.get('/entity/:entityType', authenticate, requireManagement, (req, res) => {
  try {
    const allowedTypes = ['user', 'company', 'contact', 'supplier', 'machine', 'tag'];
    // Comma-separated so one screen can show a combined trail — the Customers page
    // manages both the company and the people at it, and splitting their history
    // across two logs would hide "Jane became Janey" from whoever went looking.
    const types = String(req.params.entityType).split(',').map(t => t.trim()).filter(Boolean);
    if (types.length === 0 || types.some(t => !allowedTypes.includes(t))) {
      return res.status(400).json({ error: 'That kind of record isn\'t recognised. Reload the page and try again.' });
    }

    const PAGE_SIZE = 50;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * PAGE_SIZE;

    const placeholders = types.map(() => '?').join(', ');
    const { count: total } = db
      .prepare(`SELECT COUNT(*) as count FROM history WHERE entity_type IN (${placeholders})`)
      .get(...types);
    const history = db
      .prepare(`SELECT * FROM history WHERE entity_type IN (${placeholders}) ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...types, PAGE_SIZE, offset);

    res.json({
      data: readEntries(history, (h, read) => ({
        id: h.id,
        entityType: h.entity_type,
        entityId: h.entity_id,
        action: h.action,
        userId: h.user_id,
        userName: h.user_name,
        changes: read.changes,
        snapshot: read.snapshot,
        createdAt: h.created_at
      }), '/entity'),
      total,
      page,
      totalPages: Math.ceil(total / PAGE_SIZE)
    });
  } catch (err) {
    logger.error({ err }, 'Get entity type history error');
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a moment; if it keeps happening, tell the office.' });
  }
});

module.exports = router;
