const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const {
  db,
  userQueries,
  settingsQueries,
  recordHistory
} = require('./database');
const { normalizeStoredTimestamps } = require('./normalizeTimestamps');
const { computeLiveCosting, persistCosting } = require('../utils/costingCompute');
const { DEFAULT_VIC_PUBLIC_HOLIDAYS_2026 } = require('../utils/defaultHolidays');

// Canonicalise one day's blocks to whole-hour boundaries using the SAME cycle
// semantics the schedule editor and the minute-splitter use: build the 24 hourly
// tiers (each hour classified at its top-of-hour minute; the hours before the earliest
// block wrap to the last block's tier), then fold that back into a compact block list
// with a block at each hour whose tier differs from the hour before it. Legacy data
// could hold sub-hour starts (e.g. 14:30) the new hour-grid can't show; this snaps the
// stored data to match what's shown and billed. Whole-hour data passes through unchanged.
function scheduleDayToWholeHours(day) {
  const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
  const sorted = (Array.isArray(day) ? day : [])
    .filter(b => b && /^\d{2}:\d{2}$/.test(b.start))
    .map(b => ({ start: b.start, tier: ['normal', 'ot1', 'ot2'].includes(b.tier) ? b.tier : 'normal' }))
    .sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.length === 0) return [{ start: '00:00', tier: 'normal' }];
  const wrapTier = sorted[sorted.length - 1].tier;
  const grid = new Array(24);
  for (let h = 0; h < 24; h++) {
    const m = h * 60;
    let tier = wrapTier;
    for (const b of sorted) { if (toMin(b.start) <= m) tier = b.tier; else break; }
    grid[h] = tier;
  }
  const blocks = [];
  for (let h = 0; h < 24; h++) {
    if (grid[h] !== grid[(h + 23) % 24]) blocks.push({ start: hourLabel(h), tier: grid[h] });
  }
  if (blocks.length === 0) blocks.push({ start: '00:00', tier: grid[0] });
  return blocks;
}

// Run database migrations for existing databases
// Good pieces on a work block are stored as whole numbers (see wholeQty in
// timeEntryHelpers). Fold anything saved before that rule into the same shape wholeQty
// would store today: text with no leading number ("abc", "") → NULL (nothing recorded),
// "2.5" → "2", "-2" → "0". Idempotent: a whole number already round-trips unchanged
// and is skipped by the WHERE, and a NULL is never touched. Runs on every boot and
// at the end of a backup restore, so a pre-rule backup can't bring half-pieces back.
function foldGoodPiecesToWhole() {
  const qtyBlank = db.prepare(`
    UPDATE time_entries SET qty = NULL
    WHERE qty IS NOT NULL AND TRIM(qty) NOT GLOB '[-+0-9]*'
  `).run();
  const qtyFix = db.prepare(`
    UPDATE time_entries SET qty = CAST(MAX(0, CAST(qty AS INTEGER)) AS TEXT)
    WHERE qty IS NOT NULL AND qty != CAST(MAX(0, CAST(qty AS INTEGER)) AS TEXT)
  `).run();
  if (qtyBlank.changes + qtyFix.changes > 0) logger.info({ blanked: qtyBlank.changes, rounded: qtyFix.changes }, 'Migration: Folded good-piece counts to whole numbers');
}

// The print-flavoured trail entries were renamed when building a packet stopped counting
// as printing it. Before that, `jobCardPrinted` was written by the on-screen *preview* and
// `jobCardPacketPrinted` by merely *building* a bundle — neither meant paper. Those names
// now mean a real print, so entries recorded under the old meaning have to be renamed for
// what they actually were, or the trail shows old previews and builds as genuine prints
// with no way to tell them apart.
//
// Bounded by a cutover moment, NOT guarded by a done-once flag. A flag can go missing — a
// pass that failed, or a restore that wipes settings — and an unbounded second pass then
// relabels genuine prints as previews: the audit record is destroyed while the job keeps
// its print tick, so the tick and the trail disagree. Bounded, the pass is idempotent by
// construction and safe to run on every boot and at the end of a restore.
const PRINT_NAMING_CUTOVER_KEY = 'print_naming_cutover_at';

// The moment this install first ran the code that writes the new names — the boundary
// between "old name, wrong meaning" and "new name, real print". Stored on first use,
// never recomputed, and a restore keeps the earlier of ours and the backup's, so the
// marker travels with the data instead of belonging to the machine.
//
// A missing marker cannot be reconstructed from the trail: the rename stamps new names
// onto old rows while keeping their original dates, so the earliest new-name entry is
// the oldest legacy preview, not the cutover. Dating the cutover from that would push it
// back far enough to rename nothing — or, guessed the other way, rename genuine prints.
// So a trail that already carries a live-written new name is left alone (null = rename
// nothing) and the gap is logged. With no such entry there is nothing to lose: this is a
// first run here, or a restored pre-change backup, and now is the true boundary.
function printNamingCutover() {
  const stored = settingsQueries.getByKey.get(PRINT_NAMING_CUTOVER_KEY);
  if (stored && stored.value) return stored.value;
  // `jobCardPreviewed` only: `packetBuilt` is written by the rename alone, so its
  // presence proves nothing about whether the new code ever ran here.
  const newNameWritten = db.prepare(`
    SELECT 1 FROM history
     WHERE entity_type = 'jobcard' AND changes LIKE '%"jobCardPreviewed":%'
     LIMIT 1
  `).get();
  if (newNameWritten) {
    logger.warn('Print-naming cutover marker is missing but the trail already carries new names — leaving the print trail untouched rather than renaming genuine prints');
    return null;
  }
  const cutover = new Date().toISOString();
  settingsQueries.upsert.run(PRINT_NAMING_CUTOVER_KEY, cutover);
  return cutover;
}

// Rename only the print-flavoured trail entries recorded before the cutover. Runs on every
// boot and at the end of a backup restore, so a pre-change backup can't bring the old
// meaning back and sit there until someone restarts.
function renameLegacyPrintTrail() {
  // One transaction so the two renames land together (nested harmlessly under the
  // restore's own transaction, which better-sqlite3 runs as a savepoint).
  const rename = db.transaction(() => {
    const cutover = printNamingCutover();
    // No cutover means we can't tell old entries from new ones; renaming blind would
    // cost the audit record, so nothing is touched.
    if (!cutover) return { cutover: null, previews: 0, builds: 0 };
    // Keys are matched with their leading quote, so "jobCardPacketPrinted" can never be hit
    // by the "jobCardPrinted" pass. An undated row is left alone: mislabelling one costs a
    // word, renaming a genuine print costs the audit record.
    const previews = db.prepare(`
      UPDATE history
         SET changes = REPLACE(changes, '"jobCardPrinted":', '"jobCardPreviewed":')
       WHERE entity_type = 'jobcard' AND created_at < ? AND changes LIKE '%"jobCardPrinted":%'
    `).run(cutover);
    const builds = db.prepare(`
      UPDATE history
         SET changes = REPLACE(changes, '"jobCardPacketPrinted":', '"packetBuilt":')
       WHERE entity_type = 'jobcard' AND created_at < ? AND changes LIKE '%"jobCardPacketPrinted":%'
    `).run(cutover);
    return { cutover, previews: previews.changes, builds: builds.changes };
  });
  const renamed = rename();
  if (renamed.previews + renamed.builds > 0) {
    logger.info(renamed, 'Migration: Renamed pre-cutover print trail entries to preview/build');
  }
}

// A part's number (item_number) is a sort order the server owns, not its identity —
// its permanent id is. Before this change a new part's number was `existingItems.length
// + 1` (computed outside any transaction) and deleting a part renumbered the survivors
// 1..n; a database from before this change can therefore hold duplicate numbers (two
// parts added at once both counted the same existing rows) or, less likely, an
// inconsistency left by an interrupted renumber. Neither is possible going forward —
// new parts take MAX(item_number) + 1 inside the same transaction as their insert, and
// deletes no longer renumber anyone — but existing data needs folding onto a clean
// ordering once. Naturally idempotent (like foldGoodPiecesToWhole above): a job whose
// item_numbers already run 1..n in order is left untouched, so a second pass — or every
// later boot — finds nothing to fix and does nothing. No done-once flag needed.
function cleanUpDuplicateItemNumbering() {
  // item_number is a sort order the server owns. Nothing renumbers on delete any
  // more, so GAPS ARE EXPECTED AND MUST BE LEFT ALONE — this runs on every boot,
  // and closing a job's gaps here would silently shuffle its part numbers every
  // time the app restarted, which is the very instability this change removed.
  //
  // The one thing that genuinely needs repairing is a DUPLICATE number, which the
  // old count-based numbering could produce when two people added a part to the
  // same job at the same moment. A job holding one is already inconsistent, so it
  // is folded onto a clean 1..n; a job that merely has gaps is skipped untouched.
  // Naturally idempotent: once a job has no duplicates it is never rewritten again.
  const jobIds = db.prepare('SELECT DISTINCT jobcard_id FROM job_items').all().map(r => r.jobcard_id);
  const setNumber = db.prepare('UPDATE job_items SET item_number = ? WHERE id = ?');
  const renumberJob = db.transaction((rows) => {
    rows.forEach((row, idx) => {
      const wanted = idx + 1;
      if (row.item_number !== wanted) {
        setNumber.run(wanted, row.id);
      }
    });
  });

  let jobsFixed = 0;
  for (const jobcardId of jobIds) {
    // Order by the existing number first (so the job keeps its current relative
    // order), then by when the row was created as a stable tie-break between two
    // parts sharing a number.
    const rows = db.prepare(
      'SELECT id, item_number FROM job_items WHERE jobcard_id = ? ORDER BY item_number ASC, created_at ASC, id ASC'
    ).all(jobcardId);
    const hasDuplicates = new Set(rows.map(r => r.item_number)).size !== rows.length;
    if (!hasDuplicates) continue;
    renumberJob(rows);
    jobsFixed++;
  }
  if (jobsFixed > 0) {
    logger.info({ jobsFixed }, 'Migration: Folded duplicate job item numbers onto a clean per-job ordering');
  }
}

function runMigrations() {
  logger.info('Running migrations...');

  // idx_history_user (user_id) and idx_history_entity (entity_type, entity_id) are
  // superseded by idx_history_user_created (user_id, created_at) and
  // idx_history_entity_created (entity_type, entity_id, created_at) in schema.js, which
  // cover the same lookups plus their ORDER BY created_at. Drop the old ones from an
  // existing database — naturally idempotent, no settings flag needed.
  db.exec('DROP INDEX IF EXISTS idx_history_user');
  db.exec('DROP INDEX IF EXISTS idx_history_entity');

  // One-shot wipe of legacy time_entries (Task 6 — per-item timer rewrite).
  // CSV item_number rows can't be mapped onto the new per-item shape, so this
  // conversion clears them rather than folding them; it runs once (guarded by
  // the settings flag below) and is a no-op thereafter.
  const wipeFlagKey = 'time_entries_per_item_wiped_at';
  const flag = db.prepare('SELECT value FROM settings WHERE key = ?').get(wipeFlagKey);
  if (!flag) {
    const result = db.prepare('DELETE FROM time_entries').run();
    settingsQueries.upsert.run(wipeFlagKey, new Date().toISOString());
    logger.info({ deleted: result.changes }, 'Migration: Wiped legacy time_entries for per-item timer');
  }

  foldGoodPiecesToWhole();
  cleanUpDuplicateItemNumbering();

  // Clearing a job's due date used to save an empty string instead of "no date",
  // which a due-before search reads as earlier than every real day. Fold those
  // into NULL. Naturally idempotent (a second run finds none).
  const clearedDueDates = db.prepare("UPDATE jobcards SET due_date = NULL WHERE due_date = ''").run();
  if (clearedDueDates.changes > 0) {
    logger.info({ fixed: clearedDueDates.changes }, 'Migration: Stored cleared due dates as no date');
  }

  // A quality level's form file on disk IS the record, so two records naming the same file
  // share one file: removing either takes the file away and every job on that level then
  // refuses to save. Uploading a duplicate name is now refused, but existing databases may
  // already hold such pairs — keep the newest of each and drop the rest. Naturally
  // idempotent (a second run finds no duplicates).
  const dedupedTemplates = db.prepare(`
    DELETE FROM qa_level_templates WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM qa_level_templates GROUP BY qa_level_id, file_name
    )
  `).run();
  if (dedupedTemplates.changes > 0) {
    logger.info({ removed: dedupedTemplates.changes }, 'Migration: Removed duplicate QA form records sharing one file');
  }

  // Special labour changed from an auto-tally of "special"-marked time blocks into a
  // manually-entered costing line. Those blocks are being unmarked, so their hours now
  // sit in the normal labour total. Any special hours stored on existing costings were
  // that same auto-tally — leaving them would double-count. Zero the stored special
  // hours/total ONCE (guarded by a settings flag) so the new manual line starts empty;
  // the rate an admin previously typed is left intact. Never re-runs, so it can't wipe
  // hours an admin enters later.
  const specialResetKey = 'special_labour_manual_reset_at';
  const specialFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(specialResetKey);
  if (!specialFlag) {
    const reset = db.prepare(
      'UPDATE job_costings SET labour_special_hours = 0, labour_special_total = 0'
    ).run();
    settingsQueries.upsert.run(specialResetKey, new Date().toISOString());
    logger.info({ updated: reset.changes }, 'Migration: Reset stored special-labour hours for manual entry');
  }

  // Overtime tiers changed what a hand-typed labour-hours override means. Before, the
  // auto-tally was ALL logged time, so an admin's override meant "bill this many total
  // hours". Now the tally is split into normal + overtime tiers, and the override
  // applies only to the normal tier while the overtime tiers are added on top — so an
  // old override would double-count once overtime windows are configured. Clear the
  // stored override ONCE (guarded by a settings flag) on jobs that aren't invoiced yet,
  // so they fall back to the new auto-split; already-invoiced jobs are left untouched so a
  // billed total never moves on its own. Never re-runs, so it can't wipe an override an
  // admin types later.
  const otOverrideResetKey = 'labour_hours_override_reset_at';
  const otOverrideFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(otOverrideResetKey);
  if (!otOverrideFlag) {
    const reset = db.prepare(
      `UPDATE job_costings SET labour_hours_override = NULL
       WHERE jobcard_id IN (SELECT id FROM jobcards WHERE archived = 0)`
    ).run();
    settingsQueries.upsert.run(otOverrideResetKey, new Date().toISOString());
    logger.info({ updated: reset.changes }, 'Migration: Cleared stale labour-hours overrides for overtime split');
  }

  // The 'TREATMENT' and 'ON_HOLD' statuses were removed and folded into
  // 'AWAITING_MATERIAL' (relabelled "Material/Treatment"). Convert any job still
  // parked on the old values so they display, sort, and save normally — otherwise
  // editing such a job would fail status validation.
  const foldStatuses = db.prepare(
    "UPDATE jobcards SET status = 'AWAITING_MATERIAL' WHERE status IN ('TREATMENT', 'ON_HOLD')"
  ).run();
  if (foldStatuses.changes > 0) {
    logger.info({ moved: foldStatuses.changes }, "Migration: Folded TREATMENT/ON_HOLD jobs into AWAITING_MATERIAL");
  }

  // The weekly overtime schedule is now edited on an hour-by-hour paint grid. The old
  // editor allowed sub-hour block starts (e.g. 14:30), which the grid can't represent —
  // it would show such a boundary at the next whole hour while the minute-splitter still
  // billed the partial hour at the old tier, so screen and billing diverged. Snap every
  // stored day to whole-hour boundaries ONCE (guarded by a settings flag) so what's shown
  // matches what's billed. Whole-hour schedules are unchanged, so this is a no-op for
  // them and never re-runs. Uses the same cycle semantics as the editor/splitter.
  const scheduleSnapKey = 'labour_schedule_whole_hours_at';
  const scheduleSnapFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(scheduleSnapKey);
  if (!scheduleSnapFlag) {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('labour_schedule');
      if (row && row.value) {
        const sched = JSON.parse(row.value);
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const out = {};
        let changed = false;
        for (const d of days) {
          const before = sched?.[d];
          const after = scheduleDayToWholeHours(before);
          out[d] = after;
          if (JSON.stringify(after) !== JSON.stringify(before)) changed = true;
        }
        if (changed) {
          db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(out), 'labour_schedule');
          logger.info('Migration: Snapped labour schedule block starts to whole hours');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Migration: Failed to snap labour schedule to whole hours');
    }
    settingsQueries.upsert.run(scheduleSnapKey, new Date().toISOString());
  }

  // Old jobs invoiced before per-job rule ownership may have no costing row at all.
  // Without a row, viewing one recomputes from live settings and would track a later
  // rate/schedule change instead of staying put. Give every rowless archived job a stored
  // row — computeLiveCosting captures today's rate/rules onto the row (best available;
  // the originals were never recorded), so from then on the job owns them. Any DB that
  // has archived jobs already has its settings, so the captured rate is the current
  // company rate, not 0. New jobs always get a costing row at creation, so nothing new
  // ever needs this. No settings flag guards this block — the query itself (any
  // archived job still missing a row) is the idempotence guard, which means a job that
  // failed to backfill on an earlier boot (a locked file, a bad rate, …) is retried on
  // every boot until it succeeds, instead of being marked "done" despite failing. A
  // stored `archived_costing_backfill_at` row from an older version of this migration
  // is harmless and left alone; nothing reads it any more.
  const rowless = db.prepare(
    'SELECT id FROM jobcards WHERE archived = 1 AND id NOT IN (SELECT jobcard_id FROM job_costings)'
  ).all();
  let stamped = 0;
  for (const { id } of rowless) {
    try {
      persistCosting(computeLiveCosting(id, null));
      stamped++;
    } catch (err) {
      logger.error({ err, jobcardId: id }, 'Migration: Failed to backfill costing row for archived job');
    }
  }
  if (stamped > 0) {
    logger.info({ stamped }, 'Migration: Backfilled costing rows for archived jobs');
  }

  // Seed the Victorian (VIC) 2026 public holidays onto existing databases that never
  // had a holiday list. Runs ONCE (guarded) and only fills the list when it is still
  // empty, so an admin who already added or cleared their own holidays is never
  // overwritten. New installs get the same list from the default-settings block above.
  const vicHolidaysKey = 'vic_2026_holidays_seeded_at';
  const vicHolidaysFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(vicHolidaysKey);
  if (!vicHolidaysFlag) {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('labour_public_holidays');
      let current = [];
      try { current = JSON.parse(row && row.value ? row.value : '[]'); } catch { current = []; }
      const isEmpty = !Array.isArray(current) || current.length === 0;
      if (isEmpty) {
        settingsQueries.upsert.run('labour_public_holidays', JSON.stringify(DEFAULT_VIC_PUBLIC_HOLIDAYS_2026));
        logger.info('Migration: Seeded Victorian 2026 public holidays');
      }
      settingsQueries.upsert.run(vicHolidaysKey, new Date().toISOString());
    } catch (err) {
      logger.error({ err }, 'Migration: Failed to seed Victorian public holidays');
    }
  }

  // Per-job overtime-rule ownership. Overtime rules (schedule, holidays, timezone, base
  // multipliers) used to be read live from settings on every costing compute, so changing
  // them moved every existing job. Now each job owns its own captured copy — but existing
  // jobs never recorded theirs. Stamp every costing row that hasn't captured its rules yet
  // with TODAY's company rules as its own copy (the originals are unrecoverable — best
  // available), so from then on the job owns them and a later settings change never moves
  // it. This runs ONCE (guarded) and is idempotent (a row that already has rules is
  // skipped). Every job created afterwards owns its rules from creation.
  const otOwnershipKey = 'overtime_ownership_at';
  const otOwnershipFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(otOwnershipKey);
  if (!otOwnershipFlag) {
    try {
      const getS = (k) => {
        const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k);
        return r ? r.value : null;
      };
      const params = {
        schedule: getS('labour_schedule'),
        holidays: getS('labour_public_holidays'),
        timezone: getS('timezone') || 'UTC',
        ot1: Number(getS('labour_ot1_multiplier')) || 1.5,
        ot2: Number(getS('labour_ot2_multiplier')) || 2,
        hol: Number(getS('labour_holiday_multiplier')) || 2.5
      };
      const stampRules = db.prepare(
        `UPDATE job_costings SET
           labour_schedule = @schedule,
           labour_public_holidays = @holidays,
           labour_timezone = @timezone,
           labour_base_ot1_multiplier = @ot1,
           labour_base_ot2_multiplier = @ot2,
           labour_base_holiday_multiplier = @hol
         WHERE labour_schedule IS NULL`
      ).run(params);
      logger.info(
        { stamped: stampRules.changes },
        'Migration: Captured per-job overtime rules onto existing costing rows'
      );
      // Mark done only after the capture actually succeeded, so a failure retries on the
      // next boot instead of leaving old rows on live settings. The UPDATE only touches
      // un-captured rows, so a retry is a safe no-op for rows already stamped.
      settingsQueries.upsert.run(otOwnershipKey, new Date().toISOString());
    } catch (err) {
      logger.error({ err }, 'Migration: Failed to capture per-job overtime rules');
    }
  }

  // A trail label isn't worth refusing to boot over, so a failure here is logged and the
  // app carries on — safe now that the pass is bounded: the retry next boot renames the
  // same pre-cutover rows and nothing else.
  try {
    renameLegacyPrintTrail();
    // The done-once flag that used to guard that rename is dead — the cutover marker
    // replaced it. Drop it so the settings table doesn't carry two markers for one job.
    db.prepare("DELETE FROM settings WHERE key = 'history_print_names_converted_at'").run();
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to rename pre-cutover print trail entries');
  }

  logger.info('Migrations complete');
}

// If a backup restore was interrupted, leftover "__restore_staging" / "__restore_old"
// folders may sit beside the job folders. Surface this so an admin can review them.
function checkInterruptedRestore() {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('job_folders_base');
    const base = row && row.value;
    if (!base) return;
    const staging = path.join(path.dirname(base), `${path.basename(base)}__restore_staging`);
    const old = path.join(path.dirname(base), `${path.basename(base)}__restore_old`);
    if (fs.existsSync(staging) || fs.existsSync(old)) {
      logger.warn(
        { staging, old },
        'A previous backup restore may have been interrupted — leftover restore folders found beside the job folders. Review them manually.'
      );
    }
  } catch (err) {
    logger.error({ err }, 'Failed to check for interrupted restore');
  }
}

async function initializeDatabase() {
  logger.info('Initializing database...');

  // Fold any timestamp still stored in an old time-zone-less shape into ISO-8601 UTC, so
  // a stored moment always reads back as the instant it was recorded (see
  // normalizeTimestamps.js). Runs FIRST, before the migrations below, because some of
  // them READ stored moments and persist a figure derived from them — the archived-job
  // costing backfill splits work blocks into overtime tiers, and a job owns its costing
  // for good once written, so a block converted afterwards would leave a permanently
  // wrong labour total. Naturally idempotent, so it needs no run-once flag — that also
  // repairs a database restored from a backup taken before the change.
  try {
    db.transaction(normalizeStoredTimestamps)();
  } catch (err) {
    logger.error({ err }, 'Failed to convert stored timestamps to ISO-8601 UTC');
  }

  // Run migrations for existing databases
  runMigrations();

  // Warn if a previous restore was left half-finished
  checkInterruptedRestore();

  // Check if admin user exists
  const adminUser = userQueries.getByUsername.get('admin');

  if (!adminUser) {
    const hashedPassword = await bcrypt.hash('1234', 10);
    const adminId = `user:${uuidv4()}`;

    userQueries.create.run(
      adminId,
      'admin',
      hashedPassword,
      'admin',
      'Administrator',
      'admin@dhengineering.com',
      null,
      'EMP001'
    );

    recordHistory('user', adminId, 'create', null, 'system', {
      username: { from: null, to: 'admin' },
      role: { from: null, to: 'admin' },
      name: { from: null, to: 'Administrator' }
    });

    logger.info('Created default admin user (username: admin)');
  } else {
    logger.info('Admin user already exists');
  }

  // Initialize default settings
  const settingsStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  settingsStmt.run('company_name', 'DH Engineering');
  settingsStmt.run('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  settingsStmt.run('job_number_prefix', '');
  settingsStmt.run('job_number_next', '');

  // Overtime defaults: an all-normal week (every hour bills at the base rate) so
  // existing/fresh installs behave exactly as before until an admin sets up blocks.
  const allNormalDay = [{ start: '00:00', tier: 'normal' }];
  const defaultSchedule = {};
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) defaultSchedule[d] = allNormalDay;
  settingsStmt.run('labour_schedule', JSON.stringify(defaultSchedule));
  settingsStmt.run('labour_ot1_multiplier', '1.5');
  settingsStmt.run('labour_ot2_multiplier', '2');
  settingsStmt.run('labour_holiday_multiplier', '2.5');
  // Ship the Victorian (VIC) 2026 public holidays as the starting list. Admins can
  // add or remove any of these on the Labour Rates & Overtime page.
  settingsStmt.run('labour_public_holidays', JSON.stringify(DEFAULT_VIC_PUBLIC_HOLIDAYS_2026));
  // Company-wide default hourly rate — the starting base rate for any job still on the
  // default. Seeded at 0 so behaviour matches the old "type it per job" flow until an
  // admin sets a real figure on the Labour Rates & Overtime page.
  settingsStmt.run('labour_default_rate', '0');

  logger.info('Database initialization complete');
}

module.exports = { initializeDatabase, foldGoodPiecesToWhole, cleanUpDuplicateItemNumbering, renameLegacyPrintTrail, PRINT_NAMING_CUTOVER_KEY };
