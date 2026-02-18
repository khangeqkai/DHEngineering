const { db } = require('../connection');

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

  getByIdWithSupplier: db.prepare(`
    SELECT s.*, sup.name as supplier_name
    FROM subcontracts s
    JOIN suppliers sup ON s.supplier_id = sup.id
    WHERE s.id = ?
  `),

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

module.exports = {
  subcontractQueries,
  timeEntryQueries,
  jobCostingQueries
};
