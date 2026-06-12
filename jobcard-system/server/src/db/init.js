const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
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

  // Customers are archived, never deleted (track-and-trace) — add the flag to
  // databases created before this column existed.
  const contactCols = db.prepare("PRAGMA table_info(contacts)").all();
  if (!contactCols.some(c => c.name === 'archived')) {
    db.prepare('ALTER TABLE contacts ADD COLUMN archived INTEGER DEFAULT 0').run();
    logger.info('Migration: Added archived column to contacts');
  }

  logger.info('Migrations complete');
}

// If a backup restore was interrupted, leftover "__restore_staging" / "__restore_old"
// folders may sit beside the job folders. Surface this so an admin can review them.
function checkInterruptedRestore() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('job_folders_base');
    const base = row && row.value;
    if (!base) return;
    const staging = path.join(path.dirname(base), `${path.basename(base)}__restore_staging`);
    const old = path.join(path.dirname(base), `${path.basename(base)}__restore_old`);
    if (fs.existsSync(staging) || fs.existsSync(old)) {
      logger.warn(
        { staging, old },
        'A previous backup restore may have been interrupted — leftover restore folders found beside the job folders. Review them manually.'
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to check for interrupted restore');
  }
}

async function initializeDatabase() {
  logger.info('Initializing database...');

  // Run migrations for existing databases
  runMigrations();

  // Warn if a previous restore was left half-finished
  checkInterruptedRestore();

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
