const { db } = require('../connection');

// Time entry queries
const timeEntryQueries = {
  getByJobcard: db.prepare(`
    SELECT te.*, u.name as user_name
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE te.jobcard_id = ?
    ORDER BY te.start_time DESC
  `),

  getById: db.prepare(`
    SELECT te.*, u.name as user_name
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE te.id = ?
  `),

  create: db.prepare(`
    INSERT INTO time_entries (
      id, jobcard_id, user_id, item_number, machine_number, qty, description,
      start_time, end_time,
      is_special_labour, scrap_qty,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE time_entries SET
      item_number = ?, machine_number = ?, qty = ?, description = ?, scrap_qty = ?,
      start_time = ?, end_time = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM time_entries WHERE id = ?'),

  getActiveByUser: db.prepare(`
    SELECT te.*, u.name as user_name, j.job_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    JOIN jobcards j ON te.jobcard_id = j.id
    WHERE te.user_id = ? AND te.end_time IS NULL
    ORDER BY te.start_time DESC
    LIMIT 1
  `),

  stop: db.prepare(`
    UPDATE time_entries SET end_time = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  toggleSpecialLabour: db.prepare(`
    UPDATE time_entries SET is_special_labour = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  getHoursByJobcard: db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(is_special_labour, 0) = 0 THEN (julianday(end_time) - julianday(start_time)) * 24 ELSE 0 END), 0) as labour_hours,
      COALESCE(SUM(CASE WHEN COALESCE(is_special_labour, 0) = 1 THEN (julianday(end_time) - julianday(start_time)) * 24 ELSE 0 END), 0) as labour_special_hours
    FROM time_entries WHERE jobcard_id = ? AND end_time IS NOT NULL
  `)
};

// Job note queries
const jobNoteQueries = {
  getByJobcard: db.prepare(`
    SELECT * FROM job_notes
    WHERE jobcard_id = ?
    ORDER BY created_at ASC
  `),

  create: db.prepare(`
    INSERT INTO job_notes (id, jobcard_id, user_id, user_name, text, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `),

  getById: db.prepare('SELECT * FROM job_notes WHERE id = ?'),

  delete: db.prepare('DELETE FROM job_notes WHERE id = ?')
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

module.exports = {
  timeEntryQueries,
  jobNoteQueries,
  jobCostingQueries
};
