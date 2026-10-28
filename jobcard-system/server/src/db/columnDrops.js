const { v4: uuidv4 } = require('uuid');
const { db } = require('./connection');
const logger = require('../utils/logger');
const { quoteReferenceNotes } = require('./quoteReferenceFold');
const { repeatJobFold } = require('./repeatJobFold');
const { upgradeHeldBack } = require('./safetyCopy');

// Before the Quote Reference box's column goes, everything typed into it becomes a
// comment on its job (db/quoteReferenceFold.js), in the same transaction as the drop.
function foldQuoteReferences() {
  const jobs = db.prepare(
    "SELECT id, quote_reference, created_at FROM jobcards WHERE TRIM(COALESCE(quote_reference, '')) <> ''"
  ).all();
  const insert = db.prepare(
    'INSERT INTO job_notes (id, jobcard_id, user_id, user_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const notes = quoteReferenceNotes(jobs, () => `note:${uuidv4()}`);
  for (const n of notes) insert.run(n.id, n.jobcard_id, n.user_id, n.user_name, n.text, n.created_at);
  if (notes.length > 0) logger.info({ moved: notes.length }, 'Migration: Moved quote references into job comments');
}

// Before the Repeat Job tick's column goes, a tick with no previous job named becomes a
// comment on its job, and a reference left on an unticked job is cleared
// (db/repeatJobFold.js), in the same transaction as the drop.
function foldRepeatJobTicks() {
  const jobs = db.prepare('SELECT id, is_repeat_job, repeat_job_reference, created_at FROM jobcards').all();
  const { notes, clearReferenceIds } = repeatJobFold(jobs, () => `note:${uuidv4()}`);
  const insert = db.prepare(
    'INSERT INTO job_notes (id, jobcard_id, user_id, user_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const n of notes) insert.run(n.id, n.jobcard_id, n.user_id, n.user_name, n.text, n.created_at);
  const clear = db.prepare('UPDATE jobcards SET repeat_job_reference = NULL WHERE id = ?');
  for (const id of clearReferenceIds) clear.run(id);
  if (notes.length || clearReferenceIds.length) {
    logger.info({ ticksKept: notes.length, referencesCleared: clearReferenceIds.length }, 'Migration: Folded the Repeat Job tick into the previous-job reference');
  }
}

// Columns dropped from existing tables — the mirror image of columnMigrations.js's
// add-missing-column list. Each entry is checked at every boot; a column already
// gone is a fast no-op, so this is safe to run on every startup, not just once.
const columnDrops = [
  // Moved to job_items.
  { table: 'jobcards', column: 'drawings_type' },
  { table: 'jobcards', column: 'customer_property' },
  { table: 'jobcards', column: 'job_type' },
  // No longer tracked (per-item files-status columns).
  { table: 'job_items', column: 'qa_files_status' },
  { table: 'job_items', column: 'job_files_status' },
  { table: 'job_items', column: 'customer_property_status' },
  // Quality levels are now the two fixed values Standard/Critical
  // (server/src/shared/qualityLevels.js) — the admin-managed qa_levels table
  // this pointed at is dropped in schema.js, and jobcards.quality_level is the
  // only store left (see its own startup fold in legacyMigrations.js).
  { table: 'jobcards', column: 'qa_level_id' },
  // Work blocks can no longer be marked "special" — special labour is now a
  // manually-entered costing line instead, so the per-block flag is gone.
  { table: 'time_entries', column: 'is_special_labour' },
  // Always written null, never read by the client.
  { table: 'suppliers', column: 'services' },
  // Photos live as files in the job's folders; this JSON list was never sent or read.
  { table: 'jobcards', column: 'photos' },
  // The Quote Reference box was removed; what it held is kept as job comments first.
  // Held back (along with the status rename) when the boot's safety copy failed.
  { table: 'jobcards', column: 'quote_reference', foldFirst: foldQuoteReferences, upgrade: true },
  // The Repeat Job tick was removed: naming the previous job is what makes a repeat.
  // Never held back: the fold reads "no tick but a previous job named" as a leftover the
  // old screen hid, and nothing writes the tick any more — so a run with the column
  // still there would leave every previous job typed in during it looking like a
  // leftover, and the next start would clear them. It still gets the safety copy
  // whenever one can be written (safetyCopy.js counts the column as an upgrade).
  { table: 'jobcards', column: 'is_repeat_job', foldFirst: foldRepeatJobTicks },
];

function dropDeadColumns() {
  for (const { table, column, foldFirst, upgrade } of columnDrops) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (columns.some(c => c.name === column)) {
        if (upgrade && upgradeHeldBack()) continue;
        // What the column held is kept elsewhere, and the column dropped, together or not at all.
        db.transaction(() => {
          if (foldFirst) foldFirst();
          db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
        })();
        logger.info({ table, column }, 'Migration: Dropped column');
      }
    } catch (err) {
      logger.error({ err, table, column }, 'Migration: Failed to drop column');
    }
  }
}

module.exports = { dropDeadColumns };
