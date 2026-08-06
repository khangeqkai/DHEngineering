const { db } = require('../connection');

// History queries
const historyQueries = {
  getByEntity: db.prepare(`
    SELECT * FROM history
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
  `),

  getRecent: db.prepare(`
    SELECT * FROM history
    ORDER BY created_at DESC
    LIMIT ?
  `),

  getByUser: db.prepare(`
    SELECT * FROM history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),

  getByEntityType: db.prepare(`
    SELECT * FROM history
    WHERE entity_type = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `),

  countByEntityType: db.prepare(`
    SELECT COUNT(*) as count FROM history
    WHERE entity_type = ?
  `)
};

// Settings queries
const settingsQueries = {
  get: db.prepare('SELECT key, value FROM settings'),
  getByKey: db.prepare('SELECT value FROM settings WHERE key = ?'),
  upsert: db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `)
};

module.exports = {
  historyQueries,
  settingsQueries
};
