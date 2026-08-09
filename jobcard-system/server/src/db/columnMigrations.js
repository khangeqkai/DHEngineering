const { db } = require('./connection');
const logger = require('../utils/logger');

// Migration: Add missing columns to existing tables
// This handles the case where the database was created with an older schema
const migrations = [
  { table: 'jobcards', column: 'contact_name', type: 'TEXT' },
  { table: 'jobcards', column: 'company_name', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_phone', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_email', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_id', type: 'TEXT' },
  { table: 'jobcards', column: 'company_id', type: 'TEXT' },
  // Customers are archived, never deleted. Added here (before the companies/people
  // conversion below) so that conversion can always read the flag across.
  { table: 'contacts', column: 'archived', type: 'INTEGER DEFAULT 0' },
  { table: 'machines', column: 'updated_at', type: 'TEXT' },
  // Special labour (manually-entered costing line). Present in the CREATE TABLE, but
  // databases created before these columns existed need them added, or the costing
  // insert/update prepared statement fails to build at startup.
  { table: 'job_costings', column: 'labour_hours_override', type: 'REAL' },
  { table: 'job_costings', column: 'labour_special_hours', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_special_rate', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_special_total', type: 'REAL DEFAULT 0' },
  // Overtime tiers (present in CREATE TABLE; added here for existing databases, or
  // the costing insert/update prepared statement fails to build at startup).
  { table: 'job_costings', column: 'labour_ot1_hours', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_ot1_override', type: 'REAL' },
  { table: 'job_costings', column: 'labour_ot1_total', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_ot2_hours', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_ot2_override', type: 'REAL' },
  { table: 'job_costings', column: 'labour_ot2_total', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_holiday_hours', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_holiday_override', type: 'REAL' },
  { table: 'job_costings', column: 'labour_holiday_total', type: 'REAL DEFAULT 0' },
  { table: 'job_costings', column: 'labour_ot1_multiplier', type: 'REAL DEFAULT 1.5' },
  { table: 'job_costings', column: 'labour_ot2_multiplier', type: 'REAL DEFAULT 2' },
  { table: 'job_costings', column: 'labour_holiday_multiplier', type: 'REAL DEFAULT 2.5' },
  { table: 'job_costings', column: 'labour_ot1_multiplier_override', type: 'REAL' },
  { table: 'job_costings', column: 'labour_ot2_multiplier_override', type: 'REAL' },
  // Per-job captured overtime rules (present in CREATE TABLE; added here for existing
  // databases). A job computes its costing from these, not from live settings, so a
  // later change to the company overtime rules never moves an already-created job.
  { table: 'job_costings', column: 'labour_schedule', type: 'TEXT' },
  { table: 'job_costings', column: 'labour_public_holidays', type: 'TEXT' },
  { table: 'job_costings', column: 'labour_timezone', type: 'TEXT' },
  { table: 'job_costings', column: 'labour_base_ot1_multiplier', type: 'REAL' },
  { table: 'job_costings', column: 'labour_base_ot2_multiplier', type: 'REAL' },
  { table: 'job_costings', column: 'labour_base_holiday_multiplier', type: 'REAL' },
  // Free-text note on each manual cost line (what the cost covers).
  { table: 'job_costings', column: 'labour_special_description', type: 'TEXT' },
  { table: 'job_costings', column: 'materials_description', type: 'TEXT' },
  { table: 'job_costings', column: 'subcontractor_description', type: 'TEXT' },
  { table: 'users', column: 'session_token', type: 'TEXT' },
  { table: 'jobcards', column: 'qa_level_id', type: 'TEXT' },
  { table: 'time_entries', column: 'scrap_bin_qty', type: 'INTEGER DEFAULT 0' },
  { table: 'time_entries', column: 'scrap_recycle_qty', type: 'INTEGER DEFAULT 0' },
  { table: 'time_entries', column: 'first_off_inspection', type: 'INTEGER' },
  { table: 'time_entries', column: 'in_process_validation', type: 'INTEGER' },
  { table: 'time_entries', column: 'measuring_equipment_verification', type: 'INTEGER' },
  { table: 'time_entries', column: 'equipment_checks', type: 'INTEGER' },
  { table: 'time_entries', column: 'equipment_checks_comments', type: 'TEXT' },
  { table: 'time_entries', column: 'item_id', type: 'TEXT' },
  { table: 'job_items', column: 'material', type: 'TEXT' },
  { table: 'job_items', column: 'job_type', type: 'TEXT' },
  { table: 'job_items', column: 'drawings_type', type: 'TEXT' },
  { table: 'job_items', column: 'customer_property', type: 'TEXT' },
  { table: 'tags', column: 'archived', type: 'INTEGER DEFAULT 0' },
  { table: 'users', column: 'jobcard_column_order', type: 'TEXT' },
  { table: 'users', column: 'jobcard_hidden_columns', type: 'TEXT' },
  // Per-level switch: when on, a completed quality form must be scanned back before
  // invoicing (drives the missing-quality-form warning). Off = print-only level.
  { table: 'qa_levels', column: 'requires_returned_form', type: 'INTEGER DEFAULT 0' },
];

function addMissingColumns() {
  for (const migration of migrations) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all();
      const columnExists = columns.some(col => col.name === migration.column);
      if (!columnExists) {
        db.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.type}`);
        logger.info({ table: migration.table, column: migration.column }, 'Migration: Added column');
      }
    } catch (err) {
      // Column might already exist, ignore error
    }
  }
}

module.exports = { addMissingColumns };
