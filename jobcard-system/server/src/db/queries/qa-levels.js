const { db } = require('../connection');

// QA Level queries
const qaLevelQueries = {
  getAll: db.prepare('SELECT * FROM qa_levels ORDER BY name ASC'),
  getActive: db.prepare('SELECT id, name, is_active, require_scanned_forms FROM qa_levels WHERE is_active = 1 ORDER BY name ASC'),
  getById: db.prepare('SELECT * FROM qa_levels WHERE id = ?'),
  getByNameLower: db.prepare('SELECT * FROM qa_levels WHERE name_lower = ?'),

  create: db.prepare(`
    INSERT INTO qa_levels (id, name, name_lower, folder_path, is_active, require_scanned_forms, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE qa_levels SET name = ?, name_lower = ?, is_active = ?, require_scanned_forms = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM qa_levels WHERE id = ?'),

  // Check if any job cards use this level
  countJobsByLevel: db.prepare('SELECT COUNT(*) as count FROM jobcards WHERE qa_level_id = ?')
};

// QA Level Template queries
const qaLevelTemplateQueries = {
  getByLevel: db.prepare('SELECT * FROM qa_level_templates WHERE qa_level_id = ? ORDER BY display_name ASC'),
  getById: db.prepare('SELECT * FROM qa_level_templates WHERE id = ?'),

  create: db.prepare(`
    INSERT INTO qa_level_templates (id, qa_level_id, file_name, display_name, uploaded_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `),

  delete: db.prepare('DELETE FROM qa_level_templates WHERE id = ?')
};

module.exports = {
  qaLevelQueries,
  qaLevelTemplateQueries
};
