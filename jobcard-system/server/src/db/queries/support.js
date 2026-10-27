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

// The name of the record a trail row is about, looked up by the row's entity id when
// the trail is read: NULL when the record is gone (or the entry is not about a record
// — a job has its number instead, settings and backups have no row). Read as `h`. The
// Activity Log words an entry with it ("changed Acme Fasteners' phone"), and the
// search below matches typed text against it.
const HISTORY_RECORD_NAME_SQL = `(CASE h.entity_type
  WHEN 'user' THEN (SELECT COALESCE(NULLIF(u.name, ''), u.username) FROM users u WHERE u.id = h.entity_id)
  WHEN 'company' THEN (SELECT co.name FROM companies co WHERE co.id = h.entity_id)
  WHEN 'contact' THEN (SELECT CASE WHEN COALESCE(c.contact_name, '') = '' THEN cc.name ELSE c.contact_name || ' at ' || cc.name END
                         FROM contacts c JOIN companies cc ON cc.id = c.company_id WHERE c.id = h.entity_id)
  WHEN 'supplier' THEN (SELECT s.name FROM suppliers s WHERE s.id = h.entity_id)
  WHEN 'machine' THEN (SELECT CASE WHEN COALESCE(m.name, '') = '' THEN m.machine_number ELSE m.machine_number || ' ' || m.name END
                         FROM machines m WHERE m.id = h.entity_id)
  WHEN 'tag' THEN (SELECT t.name FROM tags t WHERE t.id = h.entity_id)
END)`;

// The Activity Log's filter, over the subquery above (rows read as `h`, with job_number
// and record_name). Named parameters; NULL means "do not filter on this".
const HISTORY_FILTER_SQL = `
  (@userId IS NULL OR h.user_id = @userId)
  AND (@kind IS NULL
    OR (@kind = 'jobs' AND h.entity_type = 'jobcard')
    OR (@kind = 'customers' AND h.entity_type IN ('company', 'contact'))
    OR (@kind = 'suppliers' AND h.entity_type = 'supplier')
    OR (@kind = 'users' AND h.entity_type = 'user' AND h.action NOT IN ('login', 'logout', 'pin_change_failed'))
    OR (@kind = 'equipment' AND h.entity_type = 'machine')
    OR (@kind = 'options' AND h.entity_type = 'tag')
    OR (@kind = 'settings' AND h.entity_type = 'settings')
    OR (@kind = 'signins' AND (h.entity_type = 'auth' OR (h.entity_type = 'user' AND h.action IN ('login', 'logout', 'pin_change_failed'))))
    OR (@kind = 'backups' AND h.entity_type = 'system'))
  AND (@fromAt IS NULL OR h.created_at >= @fromAt)
  AND (@toAt IS NULL OR h.created_at <= @toAt)
  AND (@like IS NULL
    OR h.user_name LIKE @like ESCAPE '\\'
    OR h.changes LIKE @like ESCAPE '\\'
    OR h.changes LIKE @jsonLike ESCAPE '\\'
    OR h.job_number LIKE @like ESCAPE '\\'
    OR h.record_name LIKE @like ESCAPE '\\')`;

// History queries
const historyQueries = {
  // The one trail-entry insert recordHistory runs (helpers.js) — prepared once here,
  // not on every save.
  insert: db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),
  getByEntity: db.prepare(`
    SELECT * FROM history
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC, id DESC
  `),

  // One page of the Activity Log, filtered. Every filter is optional (NULL = no filter),
  // so the one prepared statement serves every combination — see routes/history.js for
  // what each parameter means. `kind` is the record-type dropdown's key; sign-ins are
  // the auth entries plus a person's own login/logout/failed PIN change, and "users"
  // is everything else recorded against a user. `like`/`jsonLike` are already
  // wildcarded and escaped (backslash). Ordered newest first, id breaking ties so a
  // page boundary never repeats or skips entries sharing a timestamp.
  searchPage: db.prepare(`
    SELECT * FROM (
      SELECT h.*, ${HISTORY_JOB_NUMBER_SQL} AS job_number, ${HISTORY_RECORD_NAME_SQL} AS record_name
      FROM history h
    ) h
    WHERE ${HISTORY_FILTER_SQL}
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT @limit OFFSET @offset
  `),
  searchCount: db.prepare(`
    SELECT COUNT(*) AS count FROM (
      SELECT h.*, ${HISTORY_JOB_NUMBER_SQL} AS job_number, ${HISTORY_RECORD_NAME_SQL} AS record_name
      FROM history h
    ) h
    WHERE ${HISTORY_FILTER_SQL}
  `),

  getByUser: db.prepare(`
    SELECT h.*, ${HISTORY_JOB_NUMBER_SQL} AS job_number, ${HISTORY_RECORD_NAME_SQL} AS record_name FROM history h
    WHERE user_id = ?
    ORDER BY created_at DESC, h.id DESC
    LIMIT ?
  `),

  // Every deleted job's own number, from its delete trail entry — the
  // deleted-numbers half of highestUsedJobNumber (db/helpers.js). A deleted
  // job's number is never reused, so its own history entry is the only record
  // of it once the job row itself is gone.
  // Backup restore: moves the trail's AUTOINCREMENT counter up to the highest restored id.
  setSequence: db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'history'"),
  getDeletedJobNumbers: db.prepare(
    "SELECT json_extract(changes, '$.jobNumber.from') AS job_number FROM history WHERE entity_type = 'jobcard' AND action = 'delete'"
  )
};

// Settings queries
const settingsQueries = {
  get: db.prepare('SELECT key, value FROM settings'),
  getByKey: db.prepare('SELECT value FROM settings WHERE key = ?'),
  deleteByKey: db.prepare('DELETE FROM settings WHERE key = ?'),
  upsert: db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `)
};

module.exports = {
  HISTORY_JOB_NUMBER_SQL,
  HISTORY_RECORD_NAME_SQL,
  historyQueries,
  settingsQueries
};
