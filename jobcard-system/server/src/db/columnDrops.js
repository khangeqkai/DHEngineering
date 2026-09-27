const { db } = require('./connection');
const logger = require('../utils/logger');

// Columns dropped from existing tables — the mirror image of columnMigrations.js's
// add-missing-column list. Each entry is checked at every boot; a column already
// gone is a fast no-op, so this is safe to run on every startup, not just once.
const columnDrops = [
  // Moved to job_items.
  { table: 'jobcards', column: 'drawings_type' },
  { table: 'jobcards', column: 'customer_property' },
  { table: 'jobcards', column: 'job_type' },
  // No longer tracked (per-item files-status columns).
  { table: 'job_items', column: 'qa_files_status' },
  { table: 'job_items', column: 'job_files_status' },
  { table: 'job_items', column: 'customer_property_status' },
  // No longer tracked.
  { table: 'qa_levels', column: 'require_scanned_forms' },
  // Work blocks can no longer be marked "special" — special labour is now a
  // manually-entered costing line instead, so the per-block flag is gone.
  { table: 'time_entries', column: 'is_special_labour' },
  // Always written null, never read by the client.
  { table: 'suppliers', column: 'services' },
];

function dropDeadColumns() {
  for (const { table, column } of columnDrops) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (columns.some(c => c.name === column)) {
        db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
        logger.info({ table, column }, 'Migration: Dropped column');
      }
    } catch (err) {
      logger.error({ err, table, column }, 'Migration: Failed to drop column');
    }
  }
}

module.exports = { dropDeadColumns };
