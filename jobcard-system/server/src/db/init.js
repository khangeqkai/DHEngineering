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
  // CSV item_number rows can't be mapped onto the new per-item shape, so this
  // conversion clears them rather than folding them; it runs once (guarded by
  // the settings flag below) and is a no-op thereafter.
  const wipeFlagKey = 'time_entries_per_item_wiped_at';
  const flag = db.prepare('SELECT value FROM settings WHERE key = ?').get(wipeFlagKey);
  if (!flag) {
    const result = db.prepare('DELETE FROM time_entries').run();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(wipeFlagKey, new Date().toISOString());
    logger.info({ deleted: result.changes }, 'Migration: Wiped legacy time_entries for per-item timer');
  }

  // Special labour changed from an auto-tally of "special"-marked time blocks into a
  // manually-entered costing line. Those blocks are being unmarked, so their hours now
  // sit in the normal labour total. Any special hours stored on existing costings were
  // that same auto-tally — leaving them would double-count. Zero the stored special
  // hours/total ONCE (guarded by a settings flag) so the new manual line starts empty;
  // the rate an admin previously typed is left intact. Never re-runs, so it can't wipe
  // hours an admin enters later.
  const specialResetKey = 'special_labour_manual_reset_at';
  const specialFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(specialResetKey);
  if (!specialFlag) {
    const reset = db.prepare(
      'UPDATE job_costings SET labour_special_hours = 0, labour_special_total = 0'
    ).run();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(specialResetKey, new Date().toISOString());
    logger.info({ updated: reset.changes }, 'Migration: Reset stored special-labour hours for manual entry');
  }

  // Customers are archived, never deleted (track-and-trace) — add the flag to
  // databases created before this column existed.
  const contactCols = db.prepare("PRAGMA table_info(contacts)").all();
  if (!contactCols.some(c => c.name === 'archived')) {
    db.prepare('ALTER TABLE contacts ADD COLUMN archived INTEGER DEFAULT 0').run();
    logger.info('Migration: Added archived column to contacts');
  }

  // The 'TREATMENT' and 'ON_HOLD' statuses were removed and folded into
  // 'AWAITING_MATERIAL' (relabelled "Material/Treatment"). Convert any job still
  // parked on the old values so they display, sort, and save normally — otherwise
  // editing such a job would fail status validation.
  const foldStatuses = db.prepare(
    "UPDATE jobcards SET status = 'AWAITING_MATERIAL' WHERE status IN ('TREATMENT', 'ON_HOLD')"
  ).run();
  if (foldStatuses.changes > 0) {
    logger.info({ moved: foldStatuses.changes }, "Migration: Folded TREATMENT/ON_HOLD jobs into AWAITING_MATERIAL");
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
