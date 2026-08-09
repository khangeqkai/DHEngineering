const { db } = require('../connection');

// User queries
const userQueries = {
  getById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getByUsername: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  getAll: db.prepare('SELECT id, username, role, name, email, phone, employee_id, active, created_at, updated_at FROM users ORDER BY name ASC'),
  getAllActive: db.prepare('SELECT id, username, role, name, email, phone, employee_id, active, created_at, updated_at FROM users WHERE active = 1 ORDER BY name ASC'),

  create: db.prepare(`
    INSERT INTO users (id, username, password, role, name, email, phone, employee_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE users SET name = ?, email = ?, phone = ?, employee_id = ?, role = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  updatePassword: db.prepare(`
    UPDATE users SET password = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  deactivate: db.prepare(`
    UPDATE users SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  activate: db.prepare(`
    UPDATE users SET active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  updateSessionToken: db.prepare(`
    UPDATE users SET session_token = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  // Live per-request auth state. Role is read here rather than from the token,
  // because a token is a snapshot taken at sign-in and roles change while
  // people are signed in.
  getAuthState: db.prepare('SELECT session_token AS sessionToken, active, role FROM users WHERE id = ?'),

  updateJobcardColumnOrder: db.prepare(`
    UPDATE users SET jobcard_column_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  updateJobcardHiddenColumns: db.prepare(`
    UPDATE users SET jobcard_hidden_columns = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `)
};

// Company queries — the company IS the customer. Its id is the permanent code
// stamped into its folder name on disk, so the name can change freely.
const companyQueries = {
  getById: db.prepare('SELECT * FROM companies WHERE id = ?'),
  // Pickers only see live customers; the admin list can opt in to archived ones.
  getAll: db.prepare('SELECT * FROM companies WHERE archived = 0 ORDER BY name ASC'),
  getAllIncludeArchived: db.prepare('SELECT * FROM companies ORDER BY archived ASC, name ASC'),

  // Company names are unique (case-insensitive) so two customers can never share
  // a name — which would make their job folders ambiguous on disk. Matches
  // archived customers too, since an archived customer still owns its folder.
  getByName: db.prepare('SELECT * FROM companies WHERE name = ? COLLATE NOCASE'),

  create: db.prepare(`
    INSERT INTO companies (id, name, address, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE companies
    SET name = ?, address = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  archive: db.prepare("UPDATE companies SET archived = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"),
  unarchive: db.prepare("UPDATE companies SET archived = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
};

// Contact queries — the people at a company. Every read carries the company's
// name alongside, since a person is never shown without the company they're at.
const CONTACT_SELECT = `
  SELECT c.*, co.name AS company_name, co.archived AS company_archived
  FROM contacts c JOIN companies co ON co.id = c.company_id
`;

const contactQueries = {
  getById: db.prepare(`${CONTACT_SELECT} WHERE c.id = ?`),
  // Everyone at one company. The archived people are kept out of pickers but the
  // admin list needs them, hence the two forms.
  getByCompany: db.prepare(`${CONTACT_SELECT} WHERE c.company_id = ? AND c.archived = 0 ORDER BY c.contact_name ASC`),
  getByCompanyIncludeArchived: db.prepare(`${CONTACT_SELECT} WHERE c.company_id = ? ORDER BY c.archived ASC, c.contact_name ASC`),

  create: db.prepare(`
    INSERT INTO contacts (id, company_id, contact_name, phone, email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE contacts
    SET contact_name = ?, phone = ?, email = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  archive: db.prepare("UPDATE contacts SET archived = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"),
  unarchive: db.prepare("UPDATE contacts SET archived = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
};

// Supplier queries (approved field deprecated - all suppliers are approved when added)
const supplierQueries = {
  getById: db.prepare('SELECT * FROM suppliers WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC'),
  getAllIncludeInactive: db.prepare('SELECT * FROM suppliers ORDER BY name ASC'),

  create: db.prepare(`
    INSERT INTO suppliers (id, name, contact_name, contact_phone, contact_email, address, services, approved, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE suppliers SET name = ?, contact_name = ?, contact_phone = ?, contact_email = ?, address = ?, services = ?, notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  deactivate: db.prepare(`UPDATE suppliers SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`),
  activate: db.prepare(`UPDATE suppliers SET active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
};

// Tag queries
const tagQueries = {
  getById: db.prepare('SELECT * FROM tags WHERE id = ?'),
  getByValue: db.prepare('SELECT * FROM tags WHERE category = ? AND value = ?'),
  getByName: db.prepare('SELECT * FROM tags WHERE category = ? AND name = ?'),
  // Active options only — drives the pickers ("what you can choose today").
  getByCategory: db.prepare('SELECT * FROM tags WHERE category = ? AND archived = 0 ORDER BY sort_order ASC, name ASC'),
  // Every option, archived included — drives save-validation and display lookups
  // ("what was chosen back then"). Active first so the admin "show archived" list reads naturally.
  getByCategoryIncludeArchived: db.prepare('SELECT * FROM tags WHERE category = ? ORDER BY archived ASC, sort_order ASC, name ASC'),
  getAll: db.prepare('SELECT * FROM tags ORDER BY category ASC, sort_order ASC, name ASC'),

  create: db.prepare(`
    INSERT INTO tags (id, category, name, value, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare('UPDATE tags SET name = ?, value = ? WHERE id = ?'),
  archive: db.prepare('UPDATE tags SET archived = 1 WHERE id = ?'),
  unarchive: db.prepare('UPDATE tags SET archived = 0 WHERE id = ?'),

  getMaxSortOrder: db.prepare('SELECT MAX(sort_order) as max_sort FROM tags WHERE category = ?'),
  updateSortOrder: db.prepare('UPDATE tags SET sort_order = ? WHERE id = ?'),

  // Count line items still referencing a tag value, per category. A value still
  // in use must not be renamed (a rename changes the value and would strand it).
  // treatments: JSON array of objects keyed by `value` — walk it with json_each.
  countItemsByTreatmentValue: db.prepare(`
    SELECT COUNT(*) as count FROM job_items
    WHERE treatments IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM json_each(job_items.treatments)
        WHERE json_extract(json_each.value, '$.value') = ?
      )
  `),
  // material / job_type: single value per line item — plain equality.
  countItemsByMaterialValue: db.prepare('SELECT COUNT(*) as count FROM job_items WHERE material = ?'),
  countItemsByJobTypeValue: db.prepare('SELECT COUNT(*) as count FROM job_items WHERE job_type = ?'),
  // drawings / customer_property: comma-joined list per line item — delimiter-padded
  // membership so "DH_CAD" doesn't match "DH_CAD_V2". Uses instr (literal substring
  // match) not LIKE, because tag values contain underscores and "_" is a LIKE
  // single-char wildcard — LIKE would over-count similar values. A NULL column makes
  // the concatenation NULL, so instr yields NULL and the row is excluded (correct).
  countItemsByDrawingsValue: db.prepare(`
    SELECT COUNT(*) as count FROM job_items
    WHERE instr(',' || drawings_type || ',', ',' || ? || ',') > 0
  `),
  countItemsByCustomerPropertyValue: db.prepare(`
    SELECT COUNT(*) as count FROM job_items
    WHERE instr(',' || customer_property || ',', ',' || ? || ',') > 0
  `),

  // Supplier tag operations (treatment tags for suppliers)
  getForSupplier: db.prepare(`
    SELECT t.* FROM tags t
    INNER JOIN supplier_service_tags sst ON t.id = sst.service_tag_id
    WHERE sst.supplier_id = ?
    ORDER BY t.sort_order ASC, t.name ASC
  `),

  addToSupplier: db.prepare(`
    INSERT OR IGNORE INTO supplier_service_tags (supplier_id, service_tag_id)
    VALUES (?, ?)
  `),

  removeFromSupplier: db.prepare(`
    DELETE FROM supplier_service_tags WHERE supplier_id = ? AND service_tag_id = ?
  `),

  clearSupplierTags: db.prepare(`
    DELETE FROM supplier_service_tags WHERE supplier_id = ?
  `),

  getSuppliersByTag: db.prepare(`
    SELECT s.* FROM suppliers s
    INNER JOIN supplier_service_tags sst ON s.id = sst.supplier_id
    WHERE sst.service_tag_id = ? AND s.active = 1
    ORDER BY s.name ASC
  `)
};

// Machine queries
const machineQueries = {
  getById: db.prepare('SELECT * FROM machines WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM machines WHERE active = 1 ORDER BY machine_number ASC'),
  getAllIncludeInactive: db.prepare('SELECT * FROM machines ORDER BY machine_number ASC'),
  // Uniqueness only matters among active machines: an archived machine keeps its
  // number for history, but that number is free to reuse on a new active machine.
  getActiveByNumber: db.prepare('SELECT * FROM machines WHERE machine_number = ? AND active = 1'),

  create: db.prepare(`
    INSERT INTO machines (id, machine_number, name, description, created_at)
    VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE machines SET machine_number = ?, name = ?, description = ?
    WHERE id = ?
  `),

  deactivate: db.prepare(`UPDATE machines SET active = 0 WHERE id = ?`),
  activate: db.prepare(`UPDATE machines SET active = 1 WHERE id = ?`)
};

module.exports = {
  userQueries,
  companyQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  tagQueries
};
