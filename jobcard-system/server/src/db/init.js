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
const { normalizeStoredTimestamps } = require('./normalizeTimestamps');
const { DEFAULT_VIC_PUBLIC_HOLIDAYS_2026 } = require('../utils/defaultHolidays');
const { COSTING_DEFAULTS } = require('../utils/costingDefaults');
const { DAYS: SCHEDULE_DAYS, DEFAULT_DAY } = require('../shared/overtimeSchedule');
const { runLegacyMigrations } = require('./legacyMigrations');

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

// Every one-time data conversion a database needs to be in the shape the rest of the
// app assumes: the timestamp normalisation, then every migration in legacyMigrations.js.
// This is the WHOLE conversion pass — a backup restore calls this same function
// (settings.js) rather than hand-picking which conversions to re-run, so a restore
// always ends in exactly the state a fresh restart would produce. A conversion
// missing from a hand-picked list is exactly how the overtime-hours bug happened.
function runStartupConversions() {
  // Fold any timestamp still stored in an old time-zone-less shape into ISO-8601 UTC, so
  // a stored moment always reads back as the instant it was recorded (see
  // normalizeTimestamps.js). Runs FIRST, before the migrations below, because some of
  // them READ stored moments and persist a figure derived from them — the archived-job
  // costing backfill splits work blocks into overtime tiers, and a job owns its costing
  // for good once written, so a block converted afterwards would leave a permanently
  // wrong labour total. Naturally idempotent, so it needs no run-once flag — that also
  // repairs a database restored from a backup taken before the change.
  try {
    db.transaction(normalizeStoredTimestamps)();
  } catch (err) {
    logger.error({ err }, 'Failed to convert stored timestamps to ISO-8601 UTC');
  }

  // Run the one-time conversions old databases and old backups still need.
  runLegacyMigrations();
}

async function initializeDatabase() {
  logger.info('Initializing database...');

  runStartupConversions();

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

  // Overtime defaults: an all-normal week (every hour bills at the base rate) so
  // existing/fresh installs behave exactly as before until an admin sets up blocks.
  const defaultSchedule = {};
  for (const d of SCHEDULE_DAYS) defaultSchedule[d] = DEFAULT_DAY;
  settingsStmt.run('labour_schedule', JSON.stringify(defaultSchedule));
  settingsStmt.run('labour_ot1_multiplier', String(COSTING_DEFAULTS.ot1Multiplier));
  settingsStmt.run('labour_ot2_multiplier', String(COSTING_DEFAULTS.ot2Multiplier));
  settingsStmt.run('labour_holiday_multiplier', String(COSTING_DEFAULTS.holidayMultiplier));
  // Ship the Victorian (VIC) 2026 public holidays as the starting list. Admins can
  // add or remove any of these on the Labour Rates & Overtime page.
  settingsStmt.run('labour_public_holidays', JSON.stringify(DEFAULT_VIC_PUBLIC_HOLIDAYS_2026));
  // Company-wide default hourly rate — the starting base rate for any job still on the
  // default. Seeded at 0 so behaviour matches the old "type it per job" flow until an
  // admin sets a real figure on the Labour Rates & Overtime page.
  settingsStmt.run('labour_default_rate', String(COSTING_DEFAULTS.labourDefaultRate));

  logger.info('Database initialization complete');
}

module.exports = { initializeDatabase, runStartupConversions };
