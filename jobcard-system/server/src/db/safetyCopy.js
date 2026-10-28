const path = require('path');
const { db, DATA_DIR } = require('./connection');
const logger = require('../utils/logger');
const { OLD_STATUS_CODES } = require('./statusRename');

// A whole-database copy taken at boot, before the status-list upgrade moves anything:
// renaming every job's status and History (legacyMigrations.js renameOldStatuses), and
// moving quote references and tick-only repeat jobs into comments before those columns
// are dropped (columnDrops.js).
// Both rewrite data in place, so a plain copy of the file next to the original is the
// way back if anything looks wrong afterwards.
//
// Runs once per boot from schema.js, ahead of the column drops. It only copies when
// there is something left to upgrade, so after the first successful start it does
// nothing. A backup restore never comes through here: the backup file it restores from
// is already the copy, so it lifts any hold (liftHoldForRestore) before its own pass.
//
// If the copy can't be written, the upgrade is held back for this boot — the status
// rename and the quote-reference move check upgradeHeldBack() and skip — so neither
// moves anything without a copy. The next start tries again. The Repeat Job fold is the
// one step that never waits (see its entry in columnDrops.js): held back, it would
// clear the previous jobs typed in while it waited.

let heldBack = false;

function needsUpgrade() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobcards'").all();
  if (tables.length === 0) return false; // a brand-new database
  const columns = db.prepare('PRAGMA table_info(jobcards)').all();
  if (columns.some((c) => c.name === 'quote_reference' || c.name === 'is_repeat_job')) return true;
  const placeholders = OLD_STATUS_CODES.map(() => '?').join(', ');
  const old = db.prepare(`SELECT 1 FROM jobcards WHERE status IN (${placeholders}) LIMIT 1`).get(...OLD_STATUS_CODES);
  return Boolean(old);
}

function safetyCopyBeforeUpgrade() {
  try {
    if (!needsUpgrade()) return;
    // A UTC moment with no colons, so the name is valid on Windows.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(DATA_DIR, `jobcard.before-status-change-${stamp}.db`);
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    logger.info({ target }, 'Saved a safety copy of the database before the status-list upgrade');
  } catch (err) {
    heldBack = true;
    logger.error({ err }, 'Could not save a safety copy of the database, so the status rename and the quote-reference move are held back until the next start. The Repeat Job fold still runs (see columnDrops.js).');
  }
}

const upgradeHeldBack = () => heldBack;

// A backup restore is its own safety copy (the file it restores from), so it lifts the
// hold: the restored rows get the full upgrade even if this boot's copy failed.
function liftHoldForRestore() {
  heldBack = false;
}

module.exports = { safetyCopyBeforeUpgrade, upgradeHeldBack, liftHoldForRestore };
