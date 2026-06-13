const { db } = require('./connection');
const logger = require('../utils/logger');

// Create tables
db.exec(`
  -- Users table (employees)
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    name TEXT,
    email TEXT,
    phone TEXT,
    employee_id TEXT,
    active INTEGER DEFAULT 1,
    session_token TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Contacts table (phone contacts style - each contact is standalone)
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    contact_name TEXT,
    company_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Suppliers table (linked to per-line-item treatments via treatments JSON)
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    address TEXT,
    services TEXT,
    approved INTEGER DEFAULT 1,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Tags table (dynamic dropdown/multi-select options)
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, value)
  );
  CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);

  -- Supplier service tags junction table (references tags table)
  CREATE TABLE IF NOT EXISTS supplier_service_tags (
    supplier_id TEXT NOT NULL,
    service_tag_id TEXT NOT NULL,
    PRIMARY KEY (supplier_id, service_tag_id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (service_tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  -- Job cards table (comprehensive)
  CREATE TABLE IF NOT EXISTS jobcards (
    id TEXT PRIMARY KEY,
    job_number TEXT UNIQUE NOT NULL,
    card_type TEXT DEFAULT 'JOB_CARD',
    status TEXT DEFAULT 'OPEN',

    -- Contact reference (phone contacts style)
    contact_id TEXT,

    -- Contact override (per job - editable copy of contact info)
    contact_name TEXT,
    company_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,

    -- Quality & Classification
    quality_level TEXT DEFAULT 'STANDARD',
    priority TEXT DEFAULT 'NONE',

    -- References
    po_number TEXT,
    quote_reference TEXT,

    -- Job Details
    description TEXT,

    -- Dates
    due_date TEXT,

    -- Repeat Job
    is_repeat_job INTEGER DEFAULT 0,
    repeat_job_reference TEXT,

    -- Photos stored as JSON array
    photos TEXT,

    -- Invoice tracking
    invoiced_date TEXT,
    archived INTEGER DEFAULT 0,

    -- Audit fields
    created_by TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  -- Job line items
  -- treatments column: JSON array of objects with shape:
  --   { value, otherText, supplierId, supplierName, dateSent, dateExpected, dateReceived, status, notes }
  -- drawings_type / customer_property: comma-separated tag values per line item
  CREATE TABLE IF NOT EXISTS job_items (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    item_number INTEGER NOT NULL,
    qty TEXT,
    description TEXT NOT NULL,
    job_type TEXT,
    material TEXT,
    treatments TEXT,
    drawings_type TEXT,
    customer_property TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE
  );

  -- Job assignees (many-to-many)
  CREATE TABLE IF NOT EXISTS job_assignees (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(jobcard_id, user_id)
  );

  -- Time entries
  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    -- Recorded work points to a line by its stable id, not its position number,
    -- so editing/reordering a job's lines never moves the work onto another line.
    item_id TEXT,
    machine_number TEXT,
    qty TEXT,
    description TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    scrap_qty INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (item_id) REFERENCES job_items(id) ON DELETE SET NULL
  );

  -- Job costings (admin only)
  CREATE TABLE IF NOT EXISTS job_costings (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT UNIQUE NOT NULL,

    labour_hours REAL DEFAULT 0,
    labour_rate REAL DEFAULT 0,
    labour_total REAL DEFAULT 0,

    labour_special_hours REAL DEFAULT 0,
    labour_special_rate REAL DEFAULT 0,
    labour_special_total REAL DEFAULT 0,

    materials_cost REAL DEFAULT 0,
    materials_profit_percent REAL DEFAULT 100,
    materials_total REAL DEFAULT 0,

    subcontractor_cost REAL DEFAULT 0,
    subcontractor_profit_percent REAL DEFAULT 0,
    subcontractor_total REAL DEFAULT 0,

    grand_total REAL DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE
  );

  -- Machines/Equipment list
  CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    -- Uniqueness is enforced in the route layer among ACTIVE machines only, so an
    -- archived machine keeps its number for history while that number is free to
    -- reuse on a new active machine. A DB-wide UNIQUE here would block that reuse.
    machine_number TEXT NOT NULL,
    name TEXT,
    description TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Audit history table
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
  CREATE INDEX IF NOT EXISTS idx_jobcards_job_number ON jobcards(job_number);
  CREATE INDEX IF NOT EXISTS idx_jobcards_contact ON jobcards(contact_id);
  CREATE INDEX IF NOT EXISTS idx_jobcards_due_date ON jobcards(due_date);
  CREATE INDEX IF NOT EXISTS idx_jobcards_created_by ON jobcards(created_by);
  CREATE INDEX IF NOT EXISTS idx_jobcards_archived ON jobcards(archived);
  CREATE INDEX IF NOT EXISTS idx_job_items_jobcard ON job_items(jobcard_id);
  CREATE INDEX IF NOT EXISTS idx_job_assignees_jobcard ON job_assignees(jobcard_id);
  CREATE INDEX IF NOT EXISTS idx_time_entries_jobcard ON time_entries(jobcard_id);
  CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(contact_name);
  CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_name);
  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
  CREATE INDEX IF NOT EXISTS idx_supplier_service_tags_supplier ON supplier_service_tags(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_supplier_service_tags_tag ON supplier_service_tags(service_tag_id);

  -- Job notes (append-only shift communication)
  CREATE TABLE IF NOT EXISTS job_notes (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_job_notes_jobcard ON job_notes(jobcard_id);

  -- Index for finding active timers (time entries with no end_time)
  CREATE INDEX IF NOT EXISTS idx_time_entries_active ON time_entries(user_id, end_time);

  -- QA Levels (admin-managed quality levels)
  CREATE TABLE IF NOT EXISTS qa_levels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_lower TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- QA Level Templates (PDF templates per level)
  CREATE TABLE IF NOT EXISTS qa_level_templates (
    id TEXT PRIMARY KEY,
    qa_level_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (qa_level_id) REFERENCES qa_levels(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_qa_level_templates_level ON qa_level_templates(qa_level_id);
`);

// Enforce "at most one open (running) timer per user" at the database level, so a
// rapid double-tap or two devices can never create a hidden second timer. Before
// adding the unique index, close any pre-existing duplicate open timers left by
// the old code path (keep the most recent per user, stamp the rest with their
// own start time as the finish so they show zero duration). On a fresh database
// this is a no-op.
try {
  db.exec(`
    UPDATE time_entries
    SET end_time = start_time, updated_at = datetime('now')
    WHERE end_time IS NULL
      AND id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY user_id ORDER BY start_time DESC
          ) AS rn
          FROM time_entries WHERE end_time IS NULL
        ) WHERE rn = 1
      );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_one_active
      ON time_entries(user_id) WHERE end_time IS NULL;
  `);
} catch (err) {
  logger.error({ err }, 'Migration: Failed to enforce one-active-timer-per-user');
}

// Migration: Add missing columns to existing tables
// This handles the case where the database was created with an older schema
const migrations = [
  { table: 'jobcards', column: 'contact_name', type: 'TEXT' },
  { table: 'jobcards', column: 'company_name', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_phone', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_email', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_id', type: 'TEXT' },
  // Sync-related columns for offline-first support
  { table: 'contacts', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'contacts', column: '_device_id', type: 'TEXT' },
  { table: 'suppliers', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'suppliers', column: '_device_id', type: 'TEXT' },
  { table: 'users', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'users', column: '_device_id', type: 'TEXT' },
  { table: 'machines', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'machines', column: '_device_id', type: 'TEXT' },
  { table: 'machines', column: 'updated_at', type: 'TEXT' },
  { table: 'jobcards', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'jobcards', column: '_device_id', type: 'TEXT' },
  { table: 'job_items', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'job_items', column: '_device_id', type: 'TEXT' },
  { table: 'time_entries', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'time_entries', column: '_device_id', type: 'TEXT' },
  { table: 'job_costings', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'job_costings', column: '_device_id', type: 'TEXT' },
  { table: 'users', column: 'session_token', type: 'TEXT' },
  { table: 'jobcards', column: 'qa_level_id', type: 'TEXT' },
  { table: 'time_entries', column: 'is_special_labour', type: 'INTEGER DEFAULT 0' },
  { table: 'time_entries', column: 'scrap_qty', type: 'INTEGER DEFAULT 0' },
  { table: 'time_entries', column: 'item_id', type: 'TEXT' },
  { table: 'job_items', column: 'material', type: 'TEXT' },
  { table: 'job_items', column: 'job_type', type: 'TEXT' },
  { table: 'job_items', column: 'drawings_type', type: 'TEXT' },
  { table: 'job_items', column: 'customer_property', type: 'TEXT' },
  { table: 'tags', column: 'archived', type: 'INTEGER DEFAULT 0' },
  { table: 'users', column: 'jobcard_column_order', type: 'TEXT' },
];

// Drop drawings_type / customer_property from jobcards (now live on job_items)
try {
  const jcCols = db.prepare('PRAGMA table_info(jobcards)').all();
  for (const dead of ['drawings_type', 'customer_property']) {
    if (jcCols.some(c => c.name === dead)) {
      db.exec(`ALTER TABLE jobcards DROP COLUMN ${dead}`);
      logger.info({ column: dead }, 'Migration: Dropped column from jobcards (moved to job_items)');
    }
  }
} catch (err) {
  logger.error({ err }, 'Migration: Failed to drop drawings/property columns from jobcards');
}

// Drop job_type column from jobcards (now lives on job_items)
try {
  const cols = db.prepare('PRAGMA table_info(jobcards)').all();
  if (cols.some(c => c.name === 'job_type')) {
    db.exec('ALTER TABLE jobcards DROP COLUMN job_type');
    logger.info('Migration: Dropped job_type column from jobcards');
  }
} catch (err) {
  logger.error({ err }, 'Migration: Failed to drop job_type from jobcards');
}

// Drop per-item files-status columns from job_items (no longer tracked)
try {
  const itemCols = db.prepare('PRAGMA table_info(job_items)').all();
  for (const dead of ['qa_files_status', 'job_files_status', 'customer_property_status']) {
    if (itemCols.some(c => c.name === dead)) {
      db.exec(`ALTER TABLE job_items DROP COLUMN ${dead}`);
      logger.info({ column: dead }, 'Migration: Dropped column from job_items');
    }
  }
} catch (err) {
  logger.error({ err }, 'Migration: Failed to drop files-status columns from job_items');
}

// Drop require_scanned_forms from qa_levels (no longer tracked)
try {
  const qaCols = db.prepare('PRAGMA table_info(qa_levels)').all();
  if (qaCols.some(c => c.name === 'require_scanned_forms')) {
    db.exec('ALTER TABLE qa_levels DROP COLUMN require_scanned_forms');
    logger.info('Migration: Dropped require_scanned_forms column from qa_levels');
  }
} catch (err) {
  logger.error({ err }, 'Migration: Failed to drop require_scanned_forms from qa_levels');
}

// Drop legacy qa_forms + documents tables (replaced by disk-first folders)
try {
  db.exec('DROP TABLE IF EXISTS qa_forms');
  db.exec('DROP TABLE IF EXISTS documents');
  logger.info('Migration: Dropped legacy qa_forms and documents tables');
} catch (err) {
  logger.error({ err }, 'Migration: Failed to drop qa_forms/documents tables');
}

// Drop legacy QA columns from time_entries (QA workflow moved to paper forms)
try {
  const teCols = db.prepare('PRAGMA table_info(time_entries)').all();
  const deadCols = [
    'equipment_checks_done',
    'measuring_verification_done',
    'first_off_inspection',
    'first_off_inspection_notes',
    'in_process_validation',
    'in_process_validation_notes',
    'scrap_all_good',
    'scrap_recycle_inhouse_qty',
    'scrap_recycle_bin_qty'
  ];
  for (const dead of deadCols) {
    if (teCols.some(c => c.name === dead)) {
      db.exec(`ALTER TABLE time_entries DROP COLUMN ${dead}`);
      logger.info({ column: dead }, 'Migration: Dropped legacy QA column from time_entries');
    }
  }
} catch (err) {
  logger.error({ err }, 'Migration: Failed to drop legacy QA columns from time_entries');
}

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

// Indexes on migration-added columns must come after the migrations above so the
// column exists (on an existing DB the CREATE TABLE block is skipped).
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_tags_archived ON tags(category, archived)');
} catch (err) {
  logger.error({ err }, 'Migration: Failed to create idx_tags_archived');
}

// Seed default tags
require('./seed-tags');

