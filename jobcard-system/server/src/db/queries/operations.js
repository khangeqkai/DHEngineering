const { db } = require('../connection');

// Time entry queries
const timeEntryQueries = {
  // item_number is derived from the line's CURRENT position via its stable id, so
  // it always reflects where the line sits now (or null if the line was removed).
  getByJobcard: db.prepare(`
    SELECT te.*, u.name as user_name, ji.item_number as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.jobcard_id = ?
    ORDER BY te.start_time DESC
  `),

  getById: db.prepare(`
    SELECT te.*, u.name as user_name, ji.item_number as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.id = ?
  `),

  create: db.prepare(`
    INSERT INTO time_entries (
      id, jobcard_id, user_id, item_id, machine_number, qty, description,
      start_time, end_time,
      scrap_bin_qty, scrap_recycle_qty,
      first_off_inspection, in_process_validation, measuring_equipment_verification,
      equipment_checks, equipment_checks_comments,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE time_entries SET
      user_id = ?, item_id = ?, machine_number = ?, qty = ?, description = ?,
      scrap_bin_qty = ?, scrap_recycle_qty = ?,
      first_off_inspection = ?, in_process_validation = ?,
      measuring_equipment_verification = ?, equipment_checks = ?, equipment_checks_comments = ?,
      start_time = ?, end_time = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM time_entries WHERE id = ?'),

  // How many time entries are logged against a given line — used to block removing
  // a line that already carries recorded work.
  countByItemId: db.prepare('SELECT COUNT(*) as count FROM time_entries WHERE item_id = ?'),

  getActiveByUser: db.prepare(`
    SELECT te.*, u.name as user_name, j.job_number, ji.item_number as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    JOIN jobcards j ON te.jobcard_id = j.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.user_id = ? AND te.end_time IS NULL
    ORDER BY te.start_time DESC
    LIMIT 1
  `),

  stop: db.prepare(`
    UPDATE time_entries SET end_time = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  getHoursByJobcard: db.prepare(`
    SELECT
      COALESCE(SUM((julianday(end_time) - julianday(start_time)) * 24), 0) as labour_hours
    FROM time_entries WHERE jobcard_id = ? AND end_time IS NOT NULL
  `),

  // Per-entry start/end for completed blocks — used to split logged time into
  // overtime tiers by when the work happened (the single SUM above can't do that).
  getCompletedByJobcard: db.prepare(`
    SELECT start_time, end_time
    FROM time_entries WHERE jobcard_id = ? AND end_time IS NOT NULL
  `)
};

// Job note queries
const jobNoteQueries = {
  // Newest first — the comment thread reads top-down like a feed, so the latest
  // word on the job is the first thing seen. rowid breaks ties for two comments
  // written in the same millisecond.
  getByJobcard: db.prepare(`
    SELECT * FROM job_notes
    WHERE jobcard_id = ?
    ORDER BY created_at DESC, rowid DESC
  `),

  create: db.prepare(`
    INSERT INTO job_notes (id, jobcard_id, user_id, user_name, text, created_at)
    VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  getById: db.prepare('SELECT * FROM job_notes WHERE id = ?'),

  delete: db.prepare('DELETE FROM job_notes WHERE id = ?')
};

// Latest comment per job card, in one pass — the job list shows it as a column,
// so fetching per row would be one query per visible job. Ranks each job's
// comments by the same order the thread uses (created_at DESC, rowid DESC) and
// keeps the top one, so the column can never show a different comment than the
// one sitting at the top of the thread when two share a timestamp.
function getLatestNotesForJobcards(jobcardIds) {
  if (jobcardIds.length === 0) return {};
  const placeholders = jobcardIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT jobcard_id, text, user_name, created_at FROM (
      SELECT jobcard_id, text, user_name, created_at,
             ROW_NUMBER() OVER (
               PARTITION BY jobcard_id ORDER BY created_at DESC, rowid DESC
             ) AS rn
      FROM job_notes
      WHERE jobcard_id IN (${placeholders})
    ) WHERE rn = 1
  `).all(...jobcardIds);
  const map = {};
  for (const row of rows) map[row.jobcard_id] = row;
  return map;
}

// Job costing queries
const jobCostingQueries = {
  getByJobcard: db.prepare('SELECT * FROM job_costings WHERE jobcard_id = ?'),

  // Named parameters (not positional): the row has many value columns, so binding by
  // name removes any chance of a silent column-shift bug when the shape changes.
  createOrUpdate: db.prepare(`
    INSERT INTO job_costings (
      id, jobcard_id,
      labour_hours, labour_hours_override, labour_rate, labour_total,
      labour_ot1_hours, labour_ot1_override, labour_ot1_total,
      labour_ot2_hours, labour_ot2_override, labour_ot2_total,
      labour_holiday_hours, labour_holiday_override, labour_holiday_total,
      labour_ot1_multiplier, labour_ot2_multiplier, labour_holiday_multiplier,
      labour_ot1_multiplier_override, labour_ot2_multiplier_override,
      labour_schedule, labour_public_holidays, labour_timezone,
      labour_base_ot1_multiplier, labour_base_ot2_multiplier, labour_base_holiday_multiplier,
      labour_special_hours, labour_special_rate, labour_special_total, labour_special_description,
      materials_cost, materials_profit_percent, materials_total, materials_description,
      subcontractor_cost, subcontractor_profit_percent, subcontractor_total, subcontractor_description,
      grand_total, created_at, updated_at
    )
    VALUES (
      @id, @jobcard_id,
      @labour_hours, @labour_hours_override, @labour_rate, @labour_total,
      @labour_ot1_hours, @labour_ot1_override, @labour_ot1_total,
      @labour_ot2_hours, @labour_ot2_override, @labour_ot2_total,
      @labour_holiday_hours, @labour_holiday_override, @labour_holiday_total,
      @labour_ot1_multiplier, @labour_ot2_multiplier, @labour_holiday_multiplier,
      @labour_ot1_multiplier_override, @labour_ot2_multiplier_override,
      @labour_schedule, @labour_public_holidays, @labour_timezone,
      @labour_base_ot1_multiplier, @labour_base_ot2_multiplier, @labour_base_holiday_multiplier,
      @labour_special_hours, @labour_special_rate, @labour_special_total, @labour_special_description,
      @materials_cost, @materials_profit_percent, @materials_total, @materials_description,
      @subcontractor_cost, @subcontractor_profit_percent, @subcontractor_total, @subcontractor_description,
      @grand_total, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
    ON CONFLICT(jobcard_id) DO UPDATE SET
      labour_hours = excluded.labour_hours,
      labour_hours_override = excluded.labour_hours_override,
      labour_rate = excluded.labour_rate,
      labour_total = excluded.labour_total,
      labour_ot1_hours = excluded.labour_ot1_hours,
      labour_ot1_override = excluded.labour_ot1_override,
      labour_ot1_total = excluded.labour_ot1_total,
      labour_ot2_hours = excluded.labour_ot2_hours,
      labour_ot2_override = excluded.labour_ot2_override,
      labour_ot2_total = excluded.labour_ot2_total,
      labour_holiday_hours = excluded.labour_holiday_hours,
      labour_holiday_override = excluded.labour_holiday_override,
      labour_holiday_total = excluded.labour_holiday_total,
      labour_ot1_multiplier = excluded.labour_ot1_multiplier,
      labour_ot2_multiplier = excluded.labour_ot2_multiplier,
      labour_holiday_multiplier = excluded.labour_holiday_multiplier,
      labour_ot1_multiplier_override = excluded.labour_ot1_multiplier_override,
      labour_ot2_multiplier_override = excluded.labour_ot2_multiplier_override,
      labour_schedule = excluded.labour_schedule,
      labour_public_holidays = excluded.labour_public_holidays,
      labour_timezone = excluded.labour_timezone,
      labour_base_ot1_multiplier = excluded.labour_base_ot1_multiplier,
      labour_base_ot2_multiplier = excluded.labour_base_ot2_multiplier,
      labour_base_holiday_multiplier = excluded.labour_base_holiday_multiplier,
      labour_special_hours = excluded.labour_special_hours,
      labour_special_rate = excluded.labour_special_rate,
      labour_special_total = excluded.labour_special_total,
      labour_special_description = excluded.labour_special_description,
      materials_cost = excluded.materials_cost,
      materials_profit_percent = excluded.materials_profit_percent,
      materials_total = excluded.materials_total,
      materials_description = excluded.materials_description,
      subcontractor_cost = excluded.subcontractor_cost,
      subcontractor_profit_percent = excluded.subcontractor_profit_percent,
      subcontractor_total = excluded.subcontractor_total,
      subcontractor_description = excluded.subcontractor_description,
      grand_total = excluded.grand_total,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `),

  delete: db.prepare('DELETE FROM job_costings WHERE jobcard_id = ?')
};

module.exports = {
  timeEntryQueries,
  jobNoteQueries,
  getLatestNotesForJobcards,
  jobCostingQueries
};
