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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Contacts table (phone contacts style - each contact is standalone)
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    contact_name TEXT NOT NULL,
    company_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Suppliers table (for subcontracts)
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

  -- Service tags for suppliers (predefined + custom)
  CREATE TABLE IF NOT EXISTS service_tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    is_system INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Supplier service tags junction table
  CREATE TABLE IF NOT EXISTS supplier_service_tags (
    supplier_id TEXT NOT NULL,
    service_tag_id TEXT NOT NULL,
    PRIMARY KEY (supplier_id, service_tag_id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (service_tag_id) REFERENCES service_tags(id) ON DELETE CASCADE
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
    job_type TEXT,
    priority TEXT DEFAULT 'NONE',

    -- References
    po_number TEXT,
    quote_reference TEXT,

    -- Drawings & Property
    drawings_type TEXT,
    customer_property TEXT,

    -- Job Details
    description TEXT,

    -- Dates
    due_date TEXT,

    -- Repeat Job
    is_repeat_job INTEGER DEFAULT 0,
    repeat_job_reference TEXT,

    -- Treatment
    treatment_required TEXT,
    treatment_other TEXT,

    -- Internal Notes
    notes TEXT,

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
  CREATE TABLE IF NOT EXISTS job_items (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    item_number INTEGER NOT NULL,
    qty TEXT,
    description TEXT NOT NULL,
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

  -- Subcontracts
  CREATE TABLE IF NOT EXISTS subcontracts (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    date_sent TEXT,
    date_expected TEXT,
    date_received TEXT,
    notes TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  );

  -- Time entries
  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_number INTEGER,
    machine_number TEXT,
    qty TEXT,
    description TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,

    -- Special Ops
    equipment_checks_done INTEGER DEFAULT 0,
    measuring_verification_done INTEGER DEFAULT 0,
    first_off_inspection TEXT,
    first_off_inspection_notes TEXT,
    in_process_validation TEXT,
    in_process_validation_notes TEXT,

    -- Scrap Rate
    scrap_all_good INTEGER DEFAULT 1,
    scrap_recycle_inhouse_qty INTEGER DEFAULT 0,
    scrap_recycle_bin_qty INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
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

  -- Documents/Attachments
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    file_data TEXT,
    uploaded_by TEXT,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );

  -- QA Forms tracking
  CREATE TABLE IF NOT EXISTS qa_forms (
    id TEXT PRIMARY KEY,
    jobcard_id TEXT NOT NULL,
    form_code TEXT NOT NULL,
    form_name TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    printed_at TEXT,
    scanned_at TEXT,
    scanned_document_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jobcard_id) REFERENCES jobcards(id) ON DELETE CASCADE,
    FOREIGN KEY (scanned_document_id) REFERENCES documents(id)
  );

  -- Machines/Equipment list
  CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    machine_number TEXT UNIQUE NOT NULL,
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
  CREATE INDEX IF NOT EXISTS idx_documents_jobcard ON documents(jobcard_id);
  CREATE INDEX IF NOT EXISTS idx_qa_forms_jobcard ON qa_forms(jobcard_id);
  CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(contact_name);
  CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_name);
  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
  CREATE INDEX IF NOT EXISTS idx_supplier_service_tags_supplier ON supplier_service_tags(supplier_id);
  CREATE INDEX IF NOT EXISTS idx_supplier_service_tags_tag ON supplier_service_tags(service_tag_id);
`);

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
  { table: 'subcontracts', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'subcontracts', column: '_device_id', type: 'TEXT' },
  { table: 'time_entries', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'time_entries', column: '_device_id', type: 'TEXT' },
  { table: 'job_costings', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'job_costings', column: '_device_id', type: 'TEXT' },
  { table: 'qa_forms', column: '_version', type: 'INTEGER DEFAULT 1' },
  { table: 'qa_forms', column: '_device_id', type: 'TEXT' },
];

// Drop is_critical_qa column from contacts (QA level now lives on job cards only)
try {
  const contactCols = db.prepare('PRAGMA table_info(contacts)').all();
  const colNames = contactCols.map(col => col.name);
  if (colNames.includes('is_critical_qa')) {
    // Build column list preserving _version/_device_id if they exist
    const keepCols = ['id', 'contact_name', 'company_name', 'phone', 'email', 'address', 'notes', 'created_at', 'updated_at'];
    if (colNames.includes('_version')) keepCols.push('_version');
    if (colNames.includes('_device_id')) keepCols.push('_device_id');
    const colList = keepCols.join(', ');
    const colDefs = keepCols.map(c => {
      const info = contactCols.find(col => col.name === c);
      const dflt = info.dflt_value ? ` DEFAULT ${info.dflt_value}` : '';
      const notNull = info.notnull ? ' NOT NULL' : '';
      const pk = info.pk ? ' PRIMARY KEY' : '';
      return `${c} ${info.type || 'TEXT'}${pk}${notNull}${dflt}`;
    }).join(',\n        ');

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS contacts_new;
      CREATE TABLE contacts_new (
        ${colDefs}
      );
      INSERT INTO contacts_new (${colList}) SELECT ${colList} FROM contacts;
      DROP TABLE contacts;
      ALTER TABLE contacts_new RENAME TO contacts;
      CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(contact_name);
      CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_name);
    `);
    db.exec('PRAGMA foreign_keys = ON');
    logger.info('Migration: Removed is_critical_qa column from contacts');
  }
} catch (err) {
  db.exec('PRAGMA foreign_keys = ON');
  logger.error({ err }, 'Migration: Failed to remove is_critical_qa from contacts');
}

// Drop active column from contacts (no longer needed - contacts are simply deleted)
try {
  const contactCols2 = db.prepare('PRAGMA table_info(contacts)').all();
  const colNames2 = contactCols2.map(col => col.name);
  if (colNames2.includes('active')) {
    const keepCols = ['id', 'contact_name', 'company_name', 'phone', 'email', 'address', 'notes', 'created_at', 'updated_at'];
    if (colNames2.includes('_version')) keepCols.push('_version');
    if (colNames2.includes('_device_id')) keepCols.push('_device_id');
    const colList = keepCols.join(', ');
    const colDefs = keepCols.map(c => {
      const info = contactCols2.find(col => col.name === c);
      const dflt = info.dflt_value ? ` DEFAULT ${info.dflt_value}` : '';
      const notNull = info.notnull ? ' NOT NULL' : '';
      const pk = info.pk ? ' PRIMARY KEY' : '';
      return `${c} ${info.type || 'TEXT'}${pk}${notNull}${dflt}`;
    }).join(',\n        ');

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS contacts_new;
      CREATE TABLE contacts_new (
        ${colDefs}
      );
      INSERT INTO contacts_new (${colList}) SELECT ${colList} FROM contacts;
      DROP TABLE contacts;
      ALTER TABLE contacts_new RENAME TO contacts;
      CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(contact_name);
      CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_name);
    `);
    db.exec('PRAGMA foreign_keys = ON');
    logger.info('Migration: Removed active column from contacts');
  }
} catch (err) {
  db.exec('PRAGMA foreign_keys = ON');
  logger.error({ err }, 'Migration: Failed to remove active from contacts');
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

// Seed default service tags (based on TREATMENT_OPTIONS)
const defaultServiceTags = [
  'Heat Treatment',
  'Precision Grinding',
  'Anodise',
  'Electroplate',
  'Blasting',
  'Powdercoat',
  'Spraypaint',
  'Galvanise',
  'Specialised Coating'
];

const insertServiceTag = db.prepare(`
  INSERT OR IGNORE INTO service_tags (id, name, is_system, active)
  VALUES (?, ?, 1, 1)
`);

for (const tagName of defaultServiceTags) {
  try {
    const tagId = tagName.toLowerCase().replace(/\s+/g, '-');
    insertServiceTag.run(tagId, tagName);
  } catch (err) {
    // Tag might already exist, ignore
  }
}
