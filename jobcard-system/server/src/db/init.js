const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const {
  db,
  userQueries,
  recordHistory
} = require('./database');

// Run database migrations for existing databases
function runMigrations() {
  logger.info('Running migrations...');

  // Get existing columns in jobcards table
  const tableInfo = db.prepare("PRAGMA table_info(jobcards)").all();
  const existingColumns = tableInfo.map(col => col.name);

  // Migration: Add contact override fields to jobcards
  const contactColumns = ['contact_name', 'company_name', 'contact_phone', 'contact_email'];
  for (const col of contactColumns) {
    if (!existingColumns.includes(col)) {
      logger.info({ column: col }, 'Adding column to jobcards');
      db.exec(`ALTER TABLE jobcards ADD COLUMN ${col} TEXT`);
    }
  }

  // One-shot wipe of legacy time_entries (Task 6 — per-item timer rewrite).
  // CSV item_number rows are no longer supported; rather than splitting them,
  // we wipe and start fresh per the project's "no backward compat" rule.
  const wipeFlagKey = 'time_entries_per_item_wiped_at';
  const flag = db.prepare('SELECT value FROM settings WHERE key = ?').get(wipeFlagKey);
  if (!flag) {
    const result = db.prepare('DELETE FROM time_entries').run();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(wipeFlagKey, new Date().toISOString());
    logger.info({ deleted: result.changes }, 'Migration: Wiped legacy time_entries for per-item timer');
  }

  logger.info('Migrations complete');
}

async function initializeDatabase() {
  logger.info('Initializing database...');

  // Run migrations for existing databases
  runMigrations();

  // Check if admin user exists
  const adminUser = userQueries.getByUsername.get('admin');

  if (!adminUser) {
    const hashedPassword = await bcrypt.hash('1234', 10);
    const adminId = `user:${uuidv4()}`;

    userQueries.create.run(
      adminId,
      'admin',
      hashedPassword,
      'admin',
      'Administrator',
      'admin@dhengineering.com',
      null,
      'EMP001'
    );

    recordHistory('user', adminId, 'create', null, 'system', {
      username: { from: null, to: 'admin' },
      role: { from: null, to: 'admin' },
      name: { from: null, to: 'Administrator' }
    });

    logger.info('Created default admin user (username: admin)');
  } else {
    logger.info('Admin user already exists');
  }

  // Initialize default settings
  const settingsStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  settingsStmt.run('company_name', 'DH Engineering');
  settingsStmt.run('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  settingsStmt.run('job_number_prefix', '');
  settingsStmt.run('job_number_next', '');

  logger.info('Database initialization complete');
}

module.exports = { initializeDatabase };
