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

  -- Customers table
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    address TEXT,
    is_critical_qa INTEGER DEFAULT 0,
    notes TEXT,
    active INTEGER DEFAULT 1,
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

  -- Job cards table (comprehensive)
  CREATE TABLE IF NOT EXISTS jobcards (
    id TEXT PRIMARY KEY,
    job_number TEXT UNIQUE NOT NULL,
    card_type TEXT DEFAULT 'JOB_CARD',
    status TEXT DEFAULT 'OPEN',

    -- Customer reference
    customer_id TEXT,

    -- Contact override (per job - not printed, for internal use)
    contact_name TEXT,
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

    FOREIGN KEY (customer_id) REFERENCES customers(id),
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
  CREATE INDEX IF NOT EXISTS idx_jobcards_customer ON jobcards(customer_id);
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
  CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
  CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
`);

// Migration: Add missing columns to existing tables
// This handles the case where the database was created with an older schema
const migrations = [
  { table: 'jobcards', column: 'contact_name', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_phone', type: 'TEXT' },
  { table: 'jobcards', column: 'contact_email', type: 'TEXT' },
];

for (const migration of migrations) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all();
    const columnExists = columns.some(col => col.name === migration.column);
    if (!columnExists) {
      db.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.type}`);
      console.log(`Migration: Added column ${migration.column} to ${migration.table}`);
    }
  } catch (err) {
    // Column might already exist, ignore error
  }
}

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

// Generate job number: JC-YYYYMMDD-XXX or QT-YYYYMMDD-XXX
function generateJobNumber(isQuote = false) {
  const prefix = isQuote ? 'QT' : 'JC';
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  // Get count of jobs created today
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM jobcards
    WHERE job_number LIKE ?
  `);
  const result = countStmt.get(`${prefix}-${dateStr}-%`);
  const nextNum = (result.count || 0) + 1;

  return `${prefix}-${dateStr}-${String(nextNum).padStart(3, '0')}`;
}

// User queries
const userQueries = {
  getById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getAll: db.prepare('SELECT id, username, role, name, email, phone, employee_id, active, created_at, updated_at FROM users ORDER BY name ASC'),
  getAllActive: db.prepare('SELECT id, username, role, name, email, phone, employee_id, active, created_at, updated_at FROM users WHERE active = 1 ORDER BY name ASC'),

  create: db.prepare(`
    INSERT INTO users (id, username, password, role, name, email, phone, employee_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE users SET name = ?, email = ?, phone = ?, employee_id = ?, role = ?, updated_at = datetime('now')
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

// Customer queries
const customerQueries = {
  getById: db.prepare('SELECT * FROM customers WHERE id = ?'),
  getByName: db.prepare('SELECT * FROM customers WHERE name = ?'),
  getAll: db.prepare('SELECT * FROM customers WHERE active = 1 ORDER BY name ASC'),
  getAllIncludeInactive: db.prepare('SELECT * FROM customers ORDER BY name ASC'),
  search: db.prepare('SELECT * FROM customers WHERE active = 1 AND name LIKE ? ORDER BY name ASC LIMIT 20'),

  create: db.prepare(`
    INSERT INTO customers (id, name, contact_name, contact_phone, contact_email, address, is_critical_qa, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE customers SET name = ?, contact_name = ?, contact_phone = ?, contact_email = ?, address = ?, is_critical_qa = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  deactivate: db.prepare(`UPDATE customers SET active = 0, updated_at = datetime('now') WHERE id = ?`),
  activate: db.prepare(`UPDATE customers SET active = 1, updated_at = datetime('now') WHERE id = ?`),
  delete: db.prepare('DELETE FROM customers WHERE id = ?')
};

// Supplier queries
const supplierQueries = {
  getById: db.prepare('SELECT * FROM suppliers WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM suppliers WHERE active = 1 AND approved = 1 ORDER BY name ASC'),
  getAllIncludeInactive: db.prepare('SELECT * FROM suppliers ORDER BY name ASC'),

  create: db.prepare(`
    INSERT INTO suppliers (id, name, contact_name, contact_phone, contact_email, address, services, approved, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE suppliers SET name = ?, contact_name = ?, contact_phone = ?, contact_email = ?, address = ?, services = ?, approved = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  deactivate: db.prepare(`UPDATE suppliers SET active = 0, updated_at = datetime('now') WHERE id = ?`),
  activate: db.prepare(`UPDATE suppliers SET active = 1, updated_at = datetime('now') WHERE id = ?`),
  delete: db.prepare('DELETE FROM suppliers WHERE id = ?')
};

// Machine queries
const machineQueries = {
  getById: db.prepare('SELECT * FROM machines WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM machines WHERE active = 1 ORDER BY machine_number ASC'),
  getByNumber: db.prepare('SELECT * FROM machines WHERE machine_number = ?'),

  create: db.prepare(`
    INSERT INTO machines (id, machine_number, name, description, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `),

  update: db.prepare(`
    UPDATE machines SET machine_number = ?, name = ?, description = ?
    WHERE id = ?
  `),

  deactivate: db.prepare(`UPDATE machines SET active = 0 WHERE id = ?`),
  delete: db.prepare('DELETE FROM machines WHERE id = ?')
};

// Jobcard queries
const jobcardQueries = {
  getById: db.prepare('SELECT * FROM jobcards WHERE id = ?'),
  getByJobNumber: db.prepare('SELECT * FROM jobcards WHERE job_number = ?'),

  getAll: db.prepare(`
    SELECT j.*, c.name as customer_name, c.is_critical_qa as customer_is_critical
    FROM jobcards j
    LEFT JOIN customers c ON j.customer_id = c.id
    WHERE j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getByStatus: db.prepare(`
    SELECT j.*, c.name as customer_name, c.is_critical_qa as customer_is_critical
    FROM jobcards j
    LEFT JOIN customers c ON j.customer_id = c.id
    WHERE j.status = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getArchived: db.prepare(`
    SELECT j.*, c.name as customer_name
    FROM jobcards j
    LEFT JOIN customers c ON j.customer_id = c.id
    WHERE j.archived = 1
    ORDER BY j.invoiced_date DESC
  `),

  getByCustomer: db.prepare(`
    SELECT j.*, c.name as customer_name
    FROM jobcards j
    LEFT JOIN customers c ON j.customer_id = c.id
    WHERE j.customer_id = ?
    ORDER BY j.created_at DESC
  `),

  getOverdue: db.prepare(`
    SELECT j.*, c.name as customer_name
    FROM jobcards j
    LEFT JOIN customers c ON j.customer_id = c.id
    WHERE j.due_date < date('now') AND j.status NOT IN ('DONE', 'INVOICED') AND j.archived = 0
    ORDER BY j.due_date ASC
  `),

  create: db.prepare(`
    INSERT INTO jobcards (
      id, job_number, card_type, status, customer_id,
      contact_name, contact_phone, contact_email,
      quality_level, job_type, priority, po_number, quote_reference,
      drawings_type, customer_property, description, due_date,
      is_repeat_job, repeat_job_reference, treatment_required, treatment_other,
      notes, photos, created_by, updated_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE jobcards SET
      card_type = ?, status = ?, customer_id = ?,
      contact_name = ?, contact_phone = ?, contact_email = ?,
      quality_level = ?, job_type = ?, priority = ?, po_number = ?, quote_reference = ?,
      drawings_type = ?, customer_property = ?, description = ?, due_date = ?,
      is_repeat_job = ?, repeat_job_reference = ?, treatment_required = ?, treatment_other = ?,
      notes = ?, photos = ?, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  updateStatus: db.prepare(`
    UPDATE jobcards SET status = ?, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  archive: db.prepare(`
    UPDATE jobcards SET archived = 1, invoiced_date = ?, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM jobcards WHERE id = ?')
};

// Job items queries
const jobItemQueries = {
  getByJobcard: db.prepare('SELECT * FROM job_items WHERE jobcard_id = ? ORDER BY item_number ASC'),
  getNextItemNumber: db.prepare('SELECT COALESCE(MAX(item_number), 0) + 1 as next FROM job_items WHERE jobcard_id = ?'),

  create: db.prepare(`
    INSERT INTO job_items (id, jobcard_id, item_number, qty, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE job_items SET qty = ?, description = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM job_items WHERE id = ?'),
  deleteByJobcard: db.prepare('DELETE FROM job_items WHERE jobcard_id = ?')
};

// Job assignees queries
const jobAssigneeQueries = {
  getByJobcard: db.prepare(`
    SELECT ja.*, u.name as user_name, u.username
    FROM job_assignees ja
    JOIN users u ON ja.user_id = u.id
    WHERE ja.jobcard_id = ?
    ORDER BY ja.assigned_at ASC
  `),

  create: db.prepare(`
    INSERT INTO job_assignees (id, jobcard_id, user_id, assigned_at)
    VALUES (?, ?, ?, datetime('now'))
  `),

  delete: db.prepare('DELETE FROM job_assignees WHERE id = ?'),
  deleteByJobcard: db.prepare('DELETE FROM job_assignees WHERE jobcard_id = ?'),
  deleteByJobcardAndUser: db.prepare('DELETE FROM job_assignees WHERE jobcard_id = ? AND user_id = ?')
};

// Subcontract queries
const subcontractQueries = {
  getByJobcard: db.prepare(`
    SELECT s.*, sup.name as supplier_name
    FROM subcontracts s
    JOIN suppliers sup ON s.supplier_id = sup.id
    WHERE s.jobcard_id = ?
    ORDER BY s.created_at DESC
  `),

  getById: db.prepare('SELECT * FROM subcontracts WHERE id = ?'),

  create: db.prepare(`
    INSERT INTO subcontracts (id, jobcard_id, supplier_id, date_sent, date_expected, notes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE subcontracts SET supplier_id = ?, date_sent = ?, date_expected = ?, date_received = ?, notes = ?, status = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM subcontracts WHERE id = ?')
};

// Time entry queries
const timeEntryQueries = {
  getByJobcard: db.prepare(`
    SELECT te.*, u.name as user_name
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE te.jobcard_id = ?
    ORDER BY te.start_time DESC
  `),

  getById: db.prepare('SELECT * FROM time_entries WHERE id = ?'),

  create: db.prepare(`
    INSERT INTO time_entries (
      id, jobcard_id, user_id, item_number, machine_number, qty, description,
      start_time, end_time,
      equipment_checks_done, measuring_verification_done,
      first_off_inspection, first_off_inspection_notes,
      in_process_validation, in_process_validation_notes,
      scrap_all_good, scrap_recycle_inhouse_qty, scrap_recycle_bin_qty,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE time_entries SET
      item_number = ?, machine_number = ?, qty = ?, description = ?,
      start_time = ?, end_time = ?,
      equipment_checks_done = ?, measuring_verification_done = ?,
      first_off_inspection = ?, first_off_inspection_notes = ?,
      in_process_validation = ?, in_process_validation_notes = ?,
      scrap_all_good = ?, scrap_recycle_inhouse_qty = ?, scrap_recycle_bin_qty = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM time_entries WHERE id = ?')
};

// Job costing queries
const jobCostingQueries = {
  getByJobcard: db.prepare('SELECT * FROM job_costings WHERE jobcard_id = ?'),

  createOrUpdate: db.prepare(`
    INSERT INTO job_costings (
      id, jobcard_id,
      labour_hours, labour_rate, labour_total,
      labour_special_hours, labour_special_rate, labour_special_total,
      materials_cost, materials_profit_percent, materials_total,
      subcontractor_cost, subcontractor_profit_percent, subcontractor_total,
      grand_total, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(jobcard_id) DO UPDATE SET
      labour_hours = excluded.labour_hours,
      labour_rate = excluded.labour_rate,
      labour_total = excluded.labour_total,
      labour_special_hours = excluded.labour_special_hours,
      labour_special_rate = excluded.labour_special_rate,
      labour_special_total = excluded.labour_special_total,
      materials_cost = excluded.materials_cost,
      materials_profit_percent = excluded.materials_profit_percent,
      materials_total = excluded.materials_total,
      subcontractor_cost = excluded.subcontractor_cost,
      subcontractor_profit_percent = excluded.subcontractor_profit_percent,
      subcontractor_total = excluded.subcontractor_total,
      grand_total = excluded.grand_total,
      updated_at = datetime('now')
  `),

  delete: db.prepare('DELETE FROM job_costings WHERE jobcard_id = ?')
};

// Document queries
const documentQueries = {
  getByJobcard: db.prepare('SELECT id, jobcard_id, filename, file_type, file_size, uploaded_by, uploaded_at FROM documents WHERE jobcard_id = ? ORDER BY uploaded_at DESC'),
  getById: db.prepare('SELECT * FROM documents WHERE id = ?'),

  create: db.prepare(`
    INSERT INTO documents (id, jobcard_id, filename, file_type, file_size, file_data, uploaded_by, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `),

  delete: db.prepare('DELETE FROM documents WHERE id = ?')
};

// QA Forms queries
const qaFormQueries = {
  getByJobcard: db.prepare('SELECT * FROM qa_forms WHERE jobcard_id = ? ORDER BY form_code ASC'),
  getById: db.prepare('SELECT * FROM qa_forms WHERE id = ?'),

  getOutstandingForCritical: db.prepare(`
    SELECT qf.* FROM qa_forms qf
    JOIN jobcards j ON qf.jobcard_id = j.id
    JOIN customers c ON j.customer_id = c.id
    WHERE qf.jobcard_id = ? AND c.is_critical_qa = 1 AND qf.status != 'SCANNED'
  `),

  create: db.prepare(`
    INSERT INTO qa_forms (id, jobcard_id, form_code, form_name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE qa_forms SET status = ?, printed_at = ?, scanned_at = ?, scanned_document_id = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM qa_forms WHERE id = ?')
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

// Settings queries
const settingsQueries = {
  get: db.prepare('SELECT key, value FROM settings'),
  getByKey: db.prepare('SELECT value FROM settings WHERE key = ?'),
  upsert: db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `)
};

// Settings helper functions
function getSettings() {
  const rows = settingsQueries.get.all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

function updateSettings(settingsObj) {
  const updateMany = db.transaction((settings) => {
    for (const [key, value] of Object.entries(settings)) {
      settingsQueries.upsert.run(key, value);
    }
  });
  updateMany(settingsObj);
}

module.exports = {
  db,
  recordHistory,
  generateJobNumber,
  userQueries,
  customerQueries,
  supplierQueries,
  machineQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  timeEntryQueries,
  jobCostingQueries,
  documentQueries,
  qaFormQueries,
  historyQueries,
  settingsQueries,
  getSettings,
  updateSettings
};
