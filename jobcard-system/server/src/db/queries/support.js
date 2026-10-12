const { db } = require('../connection');

// The job number a trail row belongs to, for a row read as `h`. The trail stores only
// the job's internal id; the number is looked up when the trail is read, from the job
// itself or — for a job since deleted — from the number its own delete (or create)
// entry recorded. NULL for anything that isn't a job. Shared by the Activity Log reads
// below and the activity search (routes/search.js), which also matches typed text
// against it, so a job's later status/comment/timer entries are findable by number.
const HISTORY_JOB_NUMBER_SQL = `(CASE WHEN h.entity_type = 'jobcard' THEN COALESCE(
  (SELECT jn.job_number FROM jobcards jn WHERE jn.id = h.entity_id),
  (SELECT COALESCE(json_extract(hj.changes, '$.jobNumber.from'), json_extract(hj.changes, '$.jobNumber.to'))
     FROM history hj
    WHERE hj.entity_type = 'jobcard' AND hj.entity_id = h.entity_id AND hj.action IN ('delete', 'create')
    ORDER BY hj.id DESC LIMIT 1)
) END)`;

// History queries
const historyQueries = {
  getByEntity: db.prepare(`
    SELECT * FROM history
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
  `),

  getRecent: db.prepare(`
    SELECT h.*, ${HISTORY_JOB_NUMBER_SQL} AS job_number FROM history h
    ORDER BY created_at DESC, h.rowid DESC
    LIMIT ? OFFSET ?
  `),

  // Cursor page for the Activity Log's "export all" — walks the trail strictly older
  // than the last row the caller already has, instead of OFFSET (whose cost grows with
  // the square of the trail as the offset grows). id is included as a tie-breaker so
  // rows sharing one created_at timestamp are never skipped or doubled across pages.
  getBeforeCursor: db.prepare(`
    SELECT h.*, ${HISTORY_JOB_NUMBER_SQL} AS job_number FROM history h
    WHERE created_at < ? OR (created_at = ? AND id < ?)
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `),

  // The Start's own entry for one work block, found by the block's start time — Start
  // writes that same value into the block and into this entry. Read when a start/stop
  // tap is discarded, to put back the status move the Start made.
  getStartTimer: db.prepare(`
    SELECT changes FROM history
    WHERE entity_type = 'jobcard' AND entity_id = ? AND action = 'start_timer'
      AND json_extract(changes, '$.timer.to') = ?
    LIMIT 1
  `),

  getByUser: db.prepare(`
    SELECT h.*, ${HISTORY_JOB_NUMBER_SQL} AS job_number FROM history h
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `),

  // Every deleted job's own number, from its delete trail entry — the
  // deleted-numbers half of highestUsedJobNumber (db/helpers.js). A deleted
  // job's number is never reused, so its own history entry is the only record
  // of it once the job row itself is gone.
  getDeletedJobNumbers: db.prepare(
    "SELECT json_extract(changes, '$.jobNumber.from') AS job_number FROM history WHERE entity_type = 'jobcard' AND action = 'delete'"
  )
};

// Settings queries
const settingsQueries = {
  get: db.prepare('SELECT key, value FROM settings'),
  getByKey: db.prepare('SELECT value FROM settings WHERE key = ?'),
  upsert: db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `)
};

module.exports = {
  HISTORY_JOB_NUMBER_SQL,
  historyQueries,
  settingsQueries
};
