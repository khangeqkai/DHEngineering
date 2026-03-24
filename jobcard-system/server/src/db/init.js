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
  const contactColumns = ['contact_name', 'contact_phone', 'contact_email'];
  for (const col of contactColumns) {
    if (!existingColumns.includes(col)) {
      logger.info({ column: col }, 'Adding column to jobcards');
      db.exec(`ALTER TABLE jobcards ADD COLUMN ${col} TEXT`);
    }
  }

  // Migration: Normalize job_type values (replace underscores with spaces, uppercase)
  const jobTypeRows = db.prepare("SELECT id, job_type FROM jobcards WHERE INSTR(job_type, '_') > 0").all();
  if (jobTypeRows.length > 0) {
    const updateJobType = db.prepare("UPDATE jobcards SET job_type = ? WHERE id = ?");
    for (const row of jobTypeRows) {
      const normalized = row.job_type.replace(/_/g, ' ').toUpperCase();
      if (normalized !== row.job_type) {
        updateJobType.run(normalized, row.id);
        logger.info({ id: row.id, from: row.job_type, to: normalized }, 'Normalized job_type');
      }
    }
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

  logger.info('Database initialization complete');
}

module.exports = { initializeDatabase };
