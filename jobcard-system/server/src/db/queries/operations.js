const { db } = require('../connection');

// Time entry queries
const timeEntryQueries = {
  // item_number here is the part's stored sort number (joined via its permanent id,
  // or null if the part was removed) — NOT its position on screen, since the sort
  // number keeps its gaps after a part is removed. The screen pairs these rows to
  // its parts by item_id and numbers them itself.
  getByJobcard: db.prepare(`
    SELECT te.*, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name, ji.item_number as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.jobcard_id = ?
    ORDER BY te.start_time DESC
  `),

  getById: db.prepare(`
    SELECT te.*, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name, ji.item_number as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.id = ?
  `),

  // criticalAtFinish is computed by the caller (timeEntryHelpers.js's
  // criticalAtFinishForWrite): null while the block has no finish time yet, else
  // decided once at the moment it first gets one and never recomputed after.
  create: db.prepare(`
    INSERT INTO time_entries (
      id, jobcard_id, user_id, item_id, machine_number, qty, description,
      start_time, end_time, critical_at_finish,
      scrap_bin_qty, scrap_recycle_qty,
      first_off_inspection, in_process_validation, measuring_equipment_verification,
      equipment_checks, equipment_checks_comments,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  // awaitingDetails is computed by the caller (jobcard-time-entries.js): cleared to 0
  // only by the worker's own stop-timer form save (detailsConfirmed) or by a resume
  // (the finish time being cleared) — a manager editing the block's fields no longer
  // ends the wait on its own, so invoicing can't slip through mid-form.
  // criticalAtFinish is likewise computed by the caller (criticalAtFinishForWrite) —
  // set once at first finish, kept as-is while it stays finished, cleared back to
  // NULL if the edit removes the finish time (a resume).
  update: db.prepare(`
    UPDATE time_entries SET
      user_id = ?, item_id = ?, machine_number = ?, qty = ?, description = ?,
      scrap_bin_qty = ?, scrap_recycle_qty = ?,
      first_off_inspection = ?, in_process_validation = ?,
      measuring_equipment_verification = ?, equipment_checks = ?, equipment_checks_comments = ?,
      start_time = ?, end_time = ?,
      critical_at_finish = ?,
      awaiting_details = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM time_entries WHERE id = ?'),

  // How many time entries are logged against a given line — used to block removing
  // a line that already carries recorded work.
  countByItemId: db.prepare('SELECT COUNT(*) as count FROM time_entries WHERE item_id = ?'),

  // How many timers are still running on a job — used to refuse marking a job
  // invoiced while a timer is running (a running block can't be confirmed away).
  countRunningByJobcard: db.prepare(
    'SELECT COUNT(*) as count FROM time_entries WHERE jobcard_id = ? AND end_time IS NULL'
  ),

  // How many blocks on a job were stopped by the stop route since the given moment
  // and are still marked awaiting_details — a worker's stop-timer form not yet
  // saved. Invoicing waits on these, because once the job is filed away the form's
  // save is refused and its pieces, scrap and inspection answers are lost. The
  // 30-minute window (applied by the caller) still frees a form someone walked
  // away from, rather than blocking the job for good. A hand-added block never
  // carries the flag (only the stop route sets it), so it never trips this.
  // The window runs from the finish, or from the worker's answer for a clock that stopped
  // itself (its finish can be far in the past while the form was only just opened). Both are
  // ISO-8601 UTC, so the string comparison is chronological. The caller passes the cutoff twice.
  countAwaitingDetailsByJobcard: db.prepare(
    'SELECT COUNT(*) as count FROM time_entries WHERE jobcard_id = ? AND awaiting_details = 1 AND (end_time >= ? OR finish_confirmed_at >= ?)'
  ),

  // Finished runs on this job that needed the Critical sign-off (critical_at_finish
  // = 1) but are still missing one of the four inspection answers — the invoicing
  // checkpoint warns and names these before filing the job away. Joins the worker's
  // name and the part's CURRENT 1-based position (counted from the job's parts, the
  // same way search.js does — the stored sort number keeps its gaps after a part is
  // removed) so the confirm can name each run without a second round trip.
  getMissingInspectionByJobcard: db.prepare(`
    SELECT te.id, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name, te.start_time, te.end_time,
      (CASE WHEN ji.id IS NOT NULL THEN (SELECT COUNT(*) FROM job_items p WHERE p.jobcard_id = ji.jobcard_id AND p.item_number <= ji.item_number) END) as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.jobcard_id = ? AND te.critical_at_finish = 1 AND te.end_time IS NOT NULL
      AND (te.first_off_inspection IS NULL OR te.in_process_validation IS NULL
        OR te.measuring_equipment_verification IS NULL OR te.equipment_checks IS NULL)
  `),

  // Whether this worker has started a MORE RECENT block than the given one, on any
  // job — used to confirm a block being resumed is the worker's own most recently
  // started run, not some older block they still happen to own.
  hasLaterStartByUser: db.prepare(
    'SELECT COUNT(*) as count FROM time_entries WHERE user_id = ? AND start_time > ?'
  ),

  // item_number is the part's CURRENT 1-based position (as above), because the
  // "timer running on job X, part N" message shows it as-is for another job.
  getActiveByUser: db.prepare(`
    SELECT te.*, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name, j.job_number,
      (CASE WHEN ji.id IS NOT NULL THEN (SELECT COUNT(*) FROM job_items p WHERE p.jobcard_id = ji.jobcard_id AND p.item_number <= ji.item_number) END) as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    JOIN jobcards j ON te.jobcard_id = j.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.user_id = ? AND te.end_time IS NULL
    ORDER BY te.start_time DESC
    LIMIT 1
  `),

  // Marks the block awaiting_details = 1 — the stop route is the one place that
  // opens a fill-in form nobody has saved yet; countAwaitingDetailsByJobcard below
  // reads this back, and the update statement above is what clears it. A stop
  // always gives the block its FIRST finish time (it only runs on an open timer),
  // so criticalAtFinish is always the freshly-decided value here, never a kept one.
  stop: db.prepare(`
    UPDATE time_entries SET end_time = ?, critical_at_finish = ?, awaiting_details = 1, auto_stop_exempt = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  // Every open block the roll may cut, with its worker's name — the forgotten-clock roll
  // (utils/timerPause.js) walks these. Hand-opened blocks (auto_stop_exempt) are left out. Oldest first so the work is deterministic.
  getAllOpen: db.prepare(`
    SELECT te.*, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE te.end_time IS NULL AND COALESCE(te.auto_stop_exempt, 0) = 0
    ORDER BY te.start_time ASC
  `),

  // Time the office opened by hand (management reopening a stopped block through the edit
  // form, or adding a block with no finish) is never cut by the roll: hand-entered time is
  // never touched. A clock started through Start, and a stop-form Resume, stay ordinary.
  // The exemption lasts only while the block is open: the stop statement resets it, so a later
  // resume is cuttable again. (Only an open block ever carries it, and the edit route refuses open blocks.)
  markAutoStopExempt: db.prepare('UPDATE time_entries SET auto_stop_exempt = 1 WHERE id = ?'),

  // Finish an open block automatically (a clock left running past the end of normal
  // hours). Not a stop: no fill-in form waits on it (awaiting_details 0), the description
  // is left alone, and the worker is asked when they really finished (finish_unconfirmed 1).
  // critical_at_finish is decided by the caller, as a real finish decides it.
  finishUnconfirmed: db.prepare(`
    UPDATE time_entries SET end_time = ?, finish_unconfirmed = 1, finish_confirmed_at = NULL, awaiting_details = 0, critical_at_finish = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND end_time IS NULL
  `),

  // A worker's automatically finished blocks still awaiting their answer, oldest first, with
  // the job number and the part's current 1-based position (the way getActiveByUser reports it).
  getUnconfirmedByUser: db.prepare(`
    SELECT te.*, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name, j.job_number,
      (CASE WHEN ji.id IS NOT NULL THEN (SELECT COUNT(*) FROM job_items p WHERE p.jobcard_id = ji.jobcard_id AND p.item_number <= ji.item_number) END) as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    JOIN jobcards j ON te.jobcard_id = j.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.user_id = ? AND te.finish_unconfirmed = 1 AND te.end_time IS NOT NULL
    ORDER BY te.start_time ASC
  `),

  countUnconfirmedByUser: db.prepare(
    'SELECT COUNT(*) as count FROM time_entries WHERE user_id = ? AND finish_unconfirmed = 1 AND end_time IS NOT NULL'
  ),

  // The same count without one block (reopening the flagged block itself clears its own flag).
  countUnconfirmedByUserExcluding: db.prepare(
    'SELECT COUNT(*) as count FROM time_entries WHERE user_id = ? AND id != ? AND finish_unconfirmed = 1 AND end_time IS NOT NULL'
  ),

  // The first block on a job awaiting its worker's answer, with that worker's name —
  // invoicing waits on it.
  getFirstUnconfirmedByJobcard: db.prepare(`
    SELECT te.id, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    WHERE te.jobcard_id = ? AND te.finish_unconfirmed = 1 AND te.end_time IS NOT NULL
    ORDER BY te.start_time ASC
    LIMIT 1
  `),

  // The worker's answer to an automatically finished block: the finish they gave (earlier,
  // later or the same), the flag cleared, the moment they answered, and the stop-form / Critical state the answer leaves it in.
  confirmFinish: db.prepare(`
    UPDATE time_entries SET end_time = ?, finish_unconfirmed = 0, finish_confirmed_at = ?, awaiting_details = ?, critical_at_finish = ?, description = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND finish_unconfirmed = 1
  `),

  // Management saving a block settles its unconfirmed finish (the office answering for an absent worker).
  clearUnconfirmed: db.prepare(`
    UPDATE time_entries SET finish_unconfirmed = 0 WHERE id = ?
  `),

  // A resume reopens the block, so the worker's earlier answer about its finish no longer stands.
  clearFinishConfirmedAt: db.prepare(`
    UPDATE time_entries SET finish_confirmed_at = NULL WHERE id = ?
  `),

  // The caller's own finished blocks whose stop form is still waiting (awaiting_details
  // = 1), oldest first, with the job number and the part's current 1-based position —
  // offered again at sign-in until saved, whatever the description says (a block drops out
  // when the worker's own save clears awaiting_details). Every such block counts, whether
  // the worker stopped it themselves and walked away or answered the forgotten-clock
  // question and then left the form. Blocks that finished before this behaviour shipped
  // had their mark cleared once by the startup conversion (clearStaleAwaitingDetails), so
  // an old abandoned form never comes back. An archived job's are left out: its form could
  // never be saved, so it would be offered forever.
  getUnfilledStopFormsByUser: db.prepare(`
    SELECT te.*, COALESCE(NULLIF(TRIM(u.name), ''), u.username) as user_name, j.job_number,
      (CASE WHEN ji.id IS NOT NULL THEN (SELECT COUNT(*) FROM job_items p WHERE p.jobcard_id = ji.jobcard_id AND p.item_number <= ji.item_number) END) as item_number
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    JOIN jobcards j ON te.jobcard_id = j.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.user_id = ? AND te.end_time IS NOT NULL AND te.finish_unconfirmed = 0
      AND te.awaiting_details = 1
      AND COALESCE(j.archived, 0) = 0
    ORDER BY te.start_time ASC
  `),

  // One-time conversion (legacyMigrations.js): blocks that finished before the given
  // moment and never went through the forgotten-clock question lose their stop-form
  // mark, so old abandoned forms are not all offered at once. Only touches rows still marked.
  clearStaleAwaitingDetails: db.prepare(`
    UPDATE time_entries SET awaiting_details = 0
    WHERE awaiting_details = 1 AND finish_confirmed_at IS NULL AND end_time IS NOT NULL AND end_time < ?
  `),

  // Marks a clock as started by a "still working" answer (see the continues_run column).
  markContinuesRun: db.prepare('UPDATE time_entries SET continues_run = 1 WHERE id = ?'),

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
  `),

  // The same for many jobs at once (ids as one JSON array), tagged with their job.
  getCompletedByJobcardIds: db.prepare(`
    SELECT jobcard_id, start_time, end_time
    FROM time_entries
    WHERE jobcard_id IN (SELECT value FROM json_each(?)) AND end_time IS NOT NULL
  `),

  // Every distinct machine-number string ever logged. machine_number is free
  // text that can hold several machines at once (e.g. "01, 02"), so it can't be
  // exactly matched or safely rewritten token-by-token for every format in the
  // wild — used to check whether a machine being renumbered has any logged work
  // before refusing the renumber outright (see machines.js). No date cut-off:
  // machine numbers are never reused in this workshop, and a run's start time
  // says nothing about which machine it names (picked at stop, or backdated).
  getDistinctMachineNumbers: db.prepare(`
    SELECT DISTINCT machine_number FROM time_entries
    WHERE machine_number IS NOT NULL AND machine_number != ''
  `)
};

// The ONE rule for "how far has this person read this job's comments": the greatest of
// their own read mark (alias r, from job_note_reads), the launch baseline
// (settings.comments_read_from, so comments that existed before the feature don't all
// arrive as unread) and the day their account was made (a new worker inherits no
// backlog). Each part is COALESCEd to '' because SQLite's multi-argument MAX returns
// NULL if any argument is NULL. All are UTC ISO strings, so they compare as text.
// Needs a named @userId parameter and the alias r in scope.
const SEEN_UP_TO_SQL = `MAX(
  COALESCE(r.seen_up_to, ''),
  COALESCE((SELECT value FROM settings WHERE key = 'comments_read_from'), ''),
  COALESCE((SELECT created_at FROM users WHERE id = @userId), '')
)`;

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

  delete: db.prepare('DELETE FROM job_notes WHERE id = ?'),

  // The author's name is copied onto each note at write time (so an old comment
  // still reads who wrote it even if that person later leaves), but that means a
  // rename leaves every past comment showing the old name unless it's kept in
  // sync — called from the user-update route whenever a name actually changes.
  updateAuthorNameByUserId: db.prepare('UPDATE job_notes SET user_name = ? WHERE user_id = ?'),

  // The moment of the newest comment on the job, or null when there are none.
  newestCreatedAt: db.prepare('SELECT MAX(created_at) AS newest FROM job_notes WHERE jobcard_id = ?'),

  // Moves a person's read mark forward, never back (an older PC's late reply can't
  // un-read what a newer one already cleared).
  markRead: db.prepare(`
    INSERT INTO job_note_reads (user_id, jobcard_id, seen_up_to)
    VALUES (@userId, @jobcardId, @seenUpTo)
    ON CONFLICT(user_id, jobcard_id) DO UPDATE SET seen_up_to = MAX(seen_up_to, excluded.seen_up_to)
  `),

  // This person's effective "seen up to" for one job — see SEEN_UP_TO_SQL.
  getSeenUpTo: db.prepare(`
    SELECT ${SEEN_UP_TO_SQL} AS seen_up_to
    FROM (SELECT 1)
    LEFT JOIN job_note_reads r ON r.user_id = @userId AND r.jobcard_id = @jobcardId
  `)
};

// Unread comment count per job for one person, in one pass for every listed job.
// Same rule as the single-job value (SEEN_UP_TO_SQL) and never counts their own
// comments. Jobs with nothing unread are absent from the map.
function getUnreadNoteCountsForJobcards(jobcardIds, userId) {
  if (jobcardIds.length === 0) return {};
  const rows = db.prepare(`
    SELECT n.jobcard_id AS jobcard_id, COUNT(*) AS unread
    FROM job_notes n
    LEFT JOIN job_note_reads r ON r.user_id = @userId AND r.jobcard_id = n.jobcard_id
    WHERE n.jobcard_id IN (SELECT value FROM json_each(@ids))
      AND n.user_id != @userId
      AND n.created_at > ${SEEN_UP_TO_SQL}
    GROUP BY n.jobcard_id
  `).all({ userId, ids: JSON.stringify(jobcardIds) });
  const map = {};
  for (const row of rows) map[row.jobcard_id] = row.unread;
  return map;
}

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

  // The rows for many jobs in one read — the id list is passed as one JSON array, so
  // the statement is fixed and the list can be any length. Workshop Statistics prices
  // every invoiced job in its range with this rather than one read per job.
  getByJobcardIds: db.prepare(
    'SELECT * FROM job_costings WHERE jobcard_id IN (SELECT value FROM json_each(?))'
  ),

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
  `)
};

module.exports = {
  timeEntryQueries,
  jobNoteQueries,
  getLatestNotesForJobcards,
  getUnreadNoteCountsForJobcards,
  jobCostingQueries
};
