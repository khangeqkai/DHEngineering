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

module.exports = {
  userQueries,
  customerQueries,
  supplierQueries,
  machineQueries
};
