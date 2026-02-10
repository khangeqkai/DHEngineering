const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'jobcard.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT,
    email TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Job cards table
  CREATE TABLE IF NOT EXISTS jobcards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
    notes TEXT,
    photos TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  -- Audit history table - tracks ALL changes
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    changes TEXT,
    snapshot TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Settings table
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for faster queries
  CREATE INDEX IF NOT EXISTS idx_jobcards_status ON jobcards(status);
  CREATE INDEX IF NOT EXISTS idx_jobcards_created_by ON jobcards(created_by);
  CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
`);

// Helper to record history
function recordHistory(entityType, entityId, action, userId, userName, changes, snapshot) {
  const stmt = db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    entityType,
    entityId,
    action,
    userId,
    userName,
    JSON.stringify(changes),
    JSON.stringify(snapshot)
  );
}

// User queries
const userQueries = {
  getById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getAll: db.prepare('SELECT id, username, role, name, email, active, created_at, updated_at FROM users ORDER BY created_at DESC'),
  getAllActive: db.prepare('SELECT id, username, role, name, email, active, created_at, updated_at FROM users WHERE active = 1 ORDER BY created_at DESC'),

  create: db.prepare(`
    INSERT INTO users (id, username, password, role, name, email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE users SET name = ?, email = ?, role = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  updatePassword: db.prepare(`
    UPDATE users SET password = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  deactivate: db.prepare(`
    UPDATE users SET active = 0, updated_at = datetime('now')
    WHERE id = ?
  `),

  activate: db.prepare(`
    UPDATE users SET active = 1, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM users WHERE id = ?')
};

// Jobcard queries
const jobcardQueries = {
  getById: db.prepare('SELECT * FROM jobcards WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM jobcards ORDER BY created_at DESC'),
  getByStatus: db.prepare('SELECT * FROM jobcards WHERE status = ? ORDER BY created_at DESC'),
  getByCreator: db.prepare('SELECT * FROM jobcards WHERE created_by = ? ORDER BY created_at DESC'),

  create: db.prepare(`
    INSERT INTO jobcards (id, title, description, status, customer_name, customer_phone, customer_email, notes, photos, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE jobcards SET title = ?, description = ?, status = ?, customer_name = ?, customer_phone = ?, customer_email = ?, notes = ?, photos = ?, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM jobcards WHERE id = ?')
};

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
  `)
};

module.exports = {
  db,
  recordHistory,
  userQueries,
  jobcardQueries,
  historyQueries
};
