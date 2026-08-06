const { db } = require('./connection');
const logger = require('../utils/logger');
const { officeTimeZone, wallClockToIso } = require('../utils/officeTime');

// Timestamps used to be written with SQLite's datetime('now'), which produces
// "YYYY-MM-DD HH:MM:SS" in UTC with no time-zone marker. JavaScript reads a string in
// that shape as LOCAL time, so every stored moment displayed shifted by the machine's
// UTC offset (a 09:40 comment in Melbourne showed as 23:40). Everything is now written
// as full ISO-8601 UTC ("YYYY-MM-DDTHH:MM:SS.sssZ"), which reads back as the exact
// instant it was recorded.
//
// The columns that carry a stored moment. Bare calendar dates (jobcards.due_date) are
// deliberately absent — they are a day, not an instant, and are 10 characters anyway.
const TIMESTAMP_COLUMNS = {
  users: ['created_at', 'updated_at'],
  contacts: ['created_at', 'updated_at'],
  suppliers: ['created_at', 'updated_at'],
  tags: ['created_at'],
  jobcards: ['created_at', 'updated_at', 'invoiced_date'],
  job_items: ['created_at', 'updated_at'],
  job_assignees: ['assigned_at'],
  time_entries: ['created_at', 'updated_at', 'start_time', 'end_time'],
  job_costings: ['created_at', 'updated_at'],
  machines: ['created_at', 'updated_at'],
  history: ['created_at'],
  settings: ['updated_at'],
  job_notes: ['created_at'],
  qa_levels: ['created_at', 'updated_at'],
  qa_level_templates: ['uploaded_at']
};

// A work block's start/finish time is the one moment the app never wrote with SQL — it
// comes from the person's own clock. Before the write path was unified, a hand-typed
// time was stored exactly as the on-screen picker gave it: a bare local wall-clock
// reading with no time-zone marker ("YYYY-MM-DDTHH:MM", sometimes with seconds). That
// shape can't just be stamped "Z" like the ones above, because the reading is local,
// not UTC — it has to be read against the office's own time zone first. A block with
// one end in this shape and the other in UTC measures hours that are wrong by the
// office's offset, which is what the labour cost is billed on.
const WALL_CLOCK_COLUMNS = {
  time_entries: ['start_time', 'end_time']
};

function columnsOf(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

// Rewrite any stored moment still in the old bare shape into ISO-8601 UTC. The stored
// clock reading is already UTC, so it only needs the "T" separator and the "Z" marker.
// Idempotent: a converted value is 24 characters long and no longer matches the
// 19-character bare shape, so a second run finds nothing and is a no-op. Safe to call
// inside an open transaction (it opens none of its own).
function normalizeStoredTimestamps() {
  let converted = 0;

  for (const [table, columns] of Object.entries(TIMESTAMP_COLUMNS)) {
    const present = columnsOf(table);
    for (const column of columns) {
      if (!present.includes(column)) continue;
      const result = db.prepare(
        `UPDATE ${table}
            SET ${column} = replace(${column}, ' ', 'T') || '.000Z'
          WHERE ${column} IS NOT NULL
            AND length(${column}) = 19
            AND substr(${column}, 11, 1) = ' '`
      ).run();
      converted += result.changes;
    }
  }

  // Zone-less wall-clock work times. Matched on the "T" separator with no zone marker
  // and a length of exactly 16 or 19 — no zone-carrying shape is either length, so a
  // converted 24-character value can never be picked up again.
  const timeZone = officeTimeZone();
  for (const [table, columns] of Object.entries(WALL_CLOCK_COLUMNS)) {
    const present = columnsOf(table);
    for (const column of columns) {
      if (!present.includes(column)) continue;
      const rows = db.prepare(
        `SELECT id, ${column} AS value FROM ${table}
          WHERE ${column} IS NOT NULL
            AND substr(${column}, 11, 1) = 'T'
            AND length(${column}) IN (16, 19)`
      ).all();
      if (rows.length === 0) continue;
      const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
      for (const row of rows) {
        const iso = wallClockToIso(row.value, timeZone);
        if (!iso) continue;
        update.run(iso, row.id);
        converted += 1;
      }
    }
  }

  if (converted > 0) {
    logger.info({ converted, timeZone }, 'Converted stored timestamps to ISO-8601 UTC');
  }
  return converted;
}

module.exports = { normalizeStoredTimestamps };
