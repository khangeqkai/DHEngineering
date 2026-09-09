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
    ORDER BY created_at DESC, rowid DESC
    LIMIT ? OFFSET ?
  `),

  // The Start's own entry for one work block, found by the block's start time — Start
  // writes that same value into the block and into this entry. Read when a start/stop
  // tap is discarded, to put back the status move the Start made.
  getStartTimer: db.prepare(`
    SELECT changes FROM history
    WHERE entity_type = 'jobcard' AND entity_id = ? AND action = 'start_timer'
      AND json_extract(changes, '$.timer.to') = ?
    LIMIT 1
  `),

  getByUser: db.prepare(`
    SELECT * FROM history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
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
