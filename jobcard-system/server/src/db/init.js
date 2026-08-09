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
function runMigrations() {
  logger.info('Running migrations...');

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
  // row ONCE (guarded by a settings flag) — computeLiveCosting captures today's rate/rules
  // onto the row (best available; the originals were never recorded), so from then on the
  // job owns them. Any DB that has archived jobs already has its settings, so the captured
  // rate is the current company rate, not 0. New jobs always get a costing row at creation,
  // so nothing new ever needs this.
  const archivedCostingKey = 'archived_costing_backfill_at';
  const archivedCostingFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(archivedCostingKey);
  if (!archivedCostingFlag) {
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
    settingsQueries.upsert.run(archivedCostingKey, new Date().toISOString());
    if (stamped > 0) {
      logger.info({ stamped }, 'Migration: Backfilled costing rows for archived jobs');
    }
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

module.exports = { initializeDatabase };
