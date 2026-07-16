const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const {
  db,
  userQueries,
  recordHistory
} = require('./database');

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
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(wipeFlagKey, new Date().toISOString());
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
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(specialResetKey, new Date().toISOString());
    logger.info({ updated: reset.changes }, 'Migration: Reset stored special-labour hours for manual entry');
  }

  // Overtime tiers changed what a hand-typed labour-hours override means. Before, the
  // auto-tally was ALL logged time, so an admin's override meant "bill this many total
  // hours". Now the tally is split into normal + overtime tiers, and the override
  // applies only to the normal tier while the overtime tiers are added on top — so an
  // old override would double-count once overtime windows are configured. Clear the
  // stored override ONCE (guarded by a settings flag) on jobs that aren't invoiced yet,
  // so they fall back to the new auto-split; invoiced jobs are frozen and left alone.
  // Never re-runs, so it can't wipe an override an admin types later.
  const otOverrideResetKey = 'labour_hours_override_reset_at';
  const otOverrideFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(otOverrideResetKey);
  if (!otOverrideFlag) {
    const reset = db.prepare(
      `UPDATE job_costings SET labour_hours_override = NULL
       WHERE jobcard_id IN (SELECT id FROM jobcards WHERE archived = 0)`
    ).run();
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(otOverrideResetKey, new Date().toISOString());
    logger.info({ updated: reset.changes }, 'Migration: Cleared stale labour-hours overrides for overtime split');
  }

  // Customers are archived, never deleted (track-and-trace) — add the flag to
  // databases created before this column existed.
  const contactCols = db.prepare("PRAGMA table_info(contacts)").all();
  if (!contactCols.some(c => c.name === 'archived')) {
    db.prepare('ALTER TABLE contacts ADD COLUMN archived INTEGER DEFAULT 0').run();
    logger.info('Migration: Added archived column to contacts');
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
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(scheduleSnapKey, new Date().toISOString());
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
  settingsStmt.run('labour_public_holidays', '[]');

  logger.info('Database initialization complete');
}

module.exports = { initializeDatabase };
