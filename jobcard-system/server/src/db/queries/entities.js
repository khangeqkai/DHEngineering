const { db } = require('../connection');

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

// Contact queries (phone contacts style - each contact is standalone)
const contactQueries = {
  getById: db.prepare('SELECT * FROM contacts WHERE id = ?'),
  getByName: db.prepare('SELECT * FROM contacts WHERE contact_name = ?'),
  getAll: db.prepare('SELECT * FROM contacts ORDER BY contact_name ASC'),

  // Search by contact name OR company name
  search: db.prepare(`
    SELECT * FROM contacts
    WHERE contact_name LIKE ? OR company_name LIKE ?
    ORDER BY contact_name ASC
    LIMIT 20
  `),

  create: db.prepare(`
    INSERT INTO contacts (id, contact_name, company_name, phone, email, address, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE contacts
    SET contact_name = ?, company_name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM contacts WHERE id = ?')
};

// Supplier queries (approved field deprecated - all suppliers are approved when added)
const supplierQueries = {
  getById: db.prepare('SELECT * FROM suppliers WHERE id = ?'),
  getAll: db.prepare('SELECT * FROM suppliers WHERE active = 1 ORDER BY name ASC'),
  getAllIncludeInactive: db.prepare('SELECT * FROM suppliers ORDER BY name ASC'),

  create: db.prepare(`
    INSERT INTO suppliers (id, name, contact_name, contact_phone, contact_email, address, services, approved, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE suppliers SET name = ?, contact_name = ?, contact_phone = ?, contact_email = ?, address = ?, services = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM suppliers WHERE id = ?')
};

// Service tag queries
const serviceTagQueries = {
  getById: db.prepare('SELECT * FROM service_tags WHERE id = ?'),
  getByName: db.prepare('SELECT * FROM service_tags WHERE name = ?'),
  getAll: db.prepare('SELECT * FROM service_tags WHERE active = 1 ORDER BY is_system DESC, name ASC'),
  getAllIncludeInactive: db.prepare('SELECT * FROM service_tags ORDER BY is_system DESC, name ASC'),

  create: db.prepare(`
    INSERT INTO service_tags (id, name, is_system, active, created_at)
    VALUES (?, ?, ?, 1, datetime('now'))
  `),

  update: db.prepare(`UPDATE service_tags SET name = ? WHERE id = ?`),
  deactivate: db.prepare(`UPDATE service_tags SET active = 0 WHERE id = ?`),
  activate: db.prepare(`UPDATE service_tags SET active = 1 WHERE id = ?`),
  delete: db.prepare('DELETE FROM service_tags WHERE id = ?'),

  // Get tags for a supplier
  getForSupplier: db.prepare(`
    SELECT st.* FROM service_tags st
    INNER JOIN supplier_service_tags sst ON st.id = sst.service_tag_id
    WHERE sst.supplier_id = ? AND st.active = 1
    ORDER BY st.name ASC
  `),

  // Add tag to supplier
  addToSupplier: db.prepare(`
    INSERT OR IGNORE INTO supplier_service_tags (supplier_id, service_tag_id)
    VALUES (?, ?)
  `),

  // Remove tag from supplier
  removeFromSupplier: db.prepare(`
    DELETE FROM supplier_service_tags WHERE supplier_id = ? AND service_tag_id = ?
  `),

  // Clear all tags from supplier
  clearSupplierTags: db.prepare(`
    DELETE FROM supplier_service_tags WHERE supplier_id = ?
  `),

  // Get suppliers by service tag
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

module.exports = {
  userQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  serviceTagQueries
};
