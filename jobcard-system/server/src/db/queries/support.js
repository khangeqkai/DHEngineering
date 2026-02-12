const { db } = require('../connection');

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

module.exports = {
  documentQueries,
  qaFormQueries,
  historyQueries,
  settingsQueries
};
