const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');
const { authenticate, can, requirePermission, requireManagement } = require('../middleware/auth');
const db = require('../db/database');
const config = require('../config');
const { lanIpv4s } = require('../utils/netHost');
const homeAccess = require('./settings-home-access');
const { recordHistory, actorName } = require('../db/helpers');
const { PRINT_NAMING_CUTOVER_KEY } = require('../db/legacyMigrations');
const { setMaintenance } = require('../middleware/maintenance');
const { requiredString, handleValidationErrors } = require('../middleware/validation');
const { version: appVersion } = require('../../package.json');
const {
  listFilesRecursive,
  verifyStagedFiles,
  copyDirRecursive,
  bestEffortRemove,
  partitionReadableFiles,
  archiveBackupWithRetry,
  stageBackupArchive,
  swapJobFolders,
  restoreTables,
  rollbackJobFolderSwap
} = require('./backup-helpers');
const { collectOvertimeUpdates, OVERTIME_BODY_KEYS, OVERTIME_DB_KEYS } = require('./settings-overtime');
const {
  INACTIVITY_MINUTES, isInactivityMinutes, isStartingJobNumber, STARTING_JOB_NUMBER_MESSAGE
} = require('../shared/settingsRules');

// All settings routes require authentication
router.use(authenticate);

// Helper: Convert snake_case to camelCase
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper: Convert camelCase to snake_case
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Helper: Convert object keys from snake_case to camelCase
function convertKeysToCamel(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

// Get settings (admin or manager; labour rates & overtime stay admin-only)
router.get('/', requireManagement, (req, res) => {
  try {
    const settings = db.getSettings();
    // The home access code is a secret: say whether it is set (homeAccessView),
    // never what it is.
    const homeAccessFields = homeAccess.homeAccessView(settings);
    for (const key of homeAccess.HOME_ACCESS_SECRET_KEYS) delete settings[key];
    // Labour rates & overtime are admin-only money settings: strip them for
    // managers so the pricing never reaches a session that can't open the
    // Labour Rates page. (getSettings builds a fresh object per call.)
    if (!can(req.user.role, 'pricing')) {
      for (const key of OVERTIME_DB_KEYS) delete settings[key];
    }
    // The job-folders base path is admin-only too: it decides where every job's
    // files and backups are written, so a manager should never even see it, let
    // alone be able to work out or repoint where files land.
    if (!can(req.user.role, 'systemData')) {
      delete settings.job_folders_base;
    }
    // Convert snake_case keys to camelCase
    const camelCaseSettings = convertKeysToCamel(settings);
    // Tell the admin exactly what address the OTHER computers should type: the
    // server's own LAN address(es), plus whether it's serving the padlock
    // (secure) address yet — so the Server Connection card can show it verbatim.
    camelCaseSettings.serverAddresses = lanIpv4s();
    camelCaseSettings.secureServing = config.secure;
    camelCaseSettings.mdnsName = config.mdnsName;
    Object.assign(camelCaseSettings, homeAccessFields);
    res.json(camelCaseSettings);
  } catch (err) {
    logger.error({ err }, 'Error getting settings');
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings (admin or manager; labour rates & overtime stay admin-only)
router.put('/', requireManagement, async (req, res) => {
  try {
    // Reject a manager's attempt to save any overtime/labour-rate field outright
    // rather than silently dropping it, so a stale client fails loudly.
    if (!can(req.user.role, 'pricing')) {
      const blocked = OVERTIME_BODY_KEYS.find(k => req.body[k] !== undefined);
      if (blocked) {
        return res.status(403).json({ error: 'Only admins can change labour rates and overtime settings' });
      }
    }
    if (!can(req.user.role, 'systemData')) {
      // The job-folders base path decides where every job's files (and backups) are
      // written; only admins can repoint it, so a manager can't redirect company
      // files to a personal/removable drive.
      if (req.body.jobFoldersBase !== undefined) {
        return res.status(403).json({ error: 'Only admins can change the job folders base path' });
      }
      if (homeAccess.HOME_ACCESS_BODY_KEYS.some(k => req.body[k] !== undefined)) {
        return res.status(403).json({ error: 'Only admins can change home access settings' });
      }
    }

    const jobFoldersBase = req.body.jobFoldersBase;
    const inactivityTimeoutMinutes = req.body.inactivityTimeoutMinutes;
    const updates = {};

    // Home access code + home address (settings-home-access.js).
    const home = await homeAccess.collectHomeAccessUpdates(req.body);
    if (home.error) return res.status(400).json({ error: home.error });
    Object.assign(updates, home.updates);
    // Switching home access on/off is a security change, so it leaves a trace
    // (set/not set only — never the code).
    const before = db.getSettings();
    const homeAccessChange = homeAccess.homeAccessChange(before, home.updates);

    // Validate job folders base path if provided
    if (jobFoldersBase !== undefined) {
      if (jobFoldersBase && jobFoldersBase.trim()) {
        if (!fs.existsSync(jobFoldersBase)) {
          return res.status(400).json({ error: 'Job folders base path does not exist' });
        }

        const stats = fs.statSync(jobFoldersBase);
        if (!stats.isDirectory()) {
          return res.status(400).json({ error: 'Job folders base path is not a directory' });
        }
      }
      updates.job_folders_base = jobFoldersBase || '';
    }

    // Validate inactivity timeout if provided
    if (inactivityTimeoutMinutes !== undefined) {
      if (!isInactivityMinutes(inactivityTimeoutMinutes)) {
        return res.status(400).json({
          error: `Inactivity timeout must be between ${INACTIVITY_MINUTES.min} and ${INACTIVITY_MINUTES.max} minutes`
        });
      }
      updates.inactivity_timeout_minutes = String(parseInt(inactivityTimeoutMinutes, 10));
    }

    // Validate job number prefix if provided
    const jobNumberPrefix = req.body.jobNumberPrefix;
    if (jobNumberPrefix !== undefined) {
      updates.job_number_prefix = jobNumberPrefix || '';
    }

    // Validate job number next if provided
    const jobNumberNext = req.body.jobNumberNext;
    if (jobNumberNext !== undefined) {
      if (jobNumberNext && !isStartingJobNumber(jobNumberNext)) {
        return res.status(400).json({ error: STARTING_JOB_NUMBER_MESSAGE });
      }

      // Prevent setting the counter backward into a job number already handed out.
      if (jobNumberNext) {
        const currentSettings = db.getSettings();
        const effectivePrefix = jobNumberPrefix !== undefined ? (jobNumberPrefix || '') : (currentSettings.job_number_prefix || '');
        const newNum = parseInt(jobNumberNext, 10);
        const width = jobNumberNext.length;

        const highest = db.highestUsedJobNumber(effectivePrefix);
        if (highest && newNum <= highest.num) {
          const paddedMax = db.formatJobNumber('', highest.num, width);
          const error = highest.deleted
            ? `Starting number must be greater than ${paddedMax} — job ${effectivePrefix}${paddedMax} was used by a job that has since been deleted`
            : `Starting number must be greater than ${paddedMax} — job ${effectivePrefix}${paddedMax} already exists`;
          return res.status(400).json({ error });
        }
      }

      updates.job_number_next = jobNumberNext || '';
    }

    // Overtime configuration (time zone, weekly schedule, default hourly rate,
    // multipliers, public holidays) — validated and collected in settings-overtime.js.
    const overtime = collectOvertimeUpdates(req.body);
    if (overtime.error) return res.status(400).json({ error: overtime.error });
    Object.assign(updates, overtime.updates);

    if (Object.keys(updates).length > 0) {
      db.updateSettings(updates);
    }
    // Every other setting that actually changed leaves one trail entry, before and
    // after — rates, overtime, time zone, job numbering and the folders path decide
    // what gets billed and where files go, so each change must trace to a person.
    // The home access code is left out: its set/not-set trace is recorded below,
    // and the code itself is a secret.
    const settingsChanges = {};
    for (const [key, value] of Object.entries(updates)) {
      if (homeAccess.HOME_ACCESS_SECRET_KEYS.includes(key)) continue;
      const from = before[key] ?? '';
      if (String(from) === String(value ?? '')) continue;
      settingsChanges[snakeToCamel(key)] = { from, to: value };
    }
    if (Object.keys(settingsChanges).length > 0) {
      recordHistory('settings', 'general', 'update', req.user.userId, actorName(req), settingsChanges);
    }
    if (homeAccessChange) {
      recordHistory('settings', 'home_access', 'update', req.user.userId, actorName(req), homeAccessChange);
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Error updating settings');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get inactivity timeout (all authenticated users)
router.get('/inactivity-timeout', (req, res) => {
  try {
    const settings = db.getSettings();
    const timeoutMinutes = parseInt(settings.inactivity_timeout_minutes, 10) || INACTIVITY_MINUTES.defaultValue;
    res.json({ inactivityTimeoutMinutes: timeoutMinutes });
  } catch (err) {
    logger.error({ err }, 'Error getting inactivity timeout');
    res.status(500).json({ error: 'Failed to get inactivity timeout' });
  }
});

// Table order: parents first, children last (for insert)
const TABLE_ORDER = [
  'settings', 'users', 'companies', 'contacts', 'suppliers', 'machines', 'tags',
  'qa_levels', 'supplier_service_tags', 'jobcards', 'job_items', 'job_assignees',
  'job_notes', 'time_entries', 'job_costings',
  'qa_level_templates', 'history'
];

const SCHEMA_VERSION = 1;

// Get valid column names for a table
function getTableColumns(table) {
  return new Set(db.db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
}

// Export full backup as ZIP (admin only)
router.post('/export-backup', requirePermission('systemData'), [
  requiredString('outputPath', 'Output path'),
  handleValidationErrors
], async (req, res) => {
  const { outputPath } = req.body;

  try {
    const settings = db.getSettings();

    // Read every table inside one transaction so the snapshot is internally
    // consistent even if someone saves while the export is running.
    const readAllTables = db.db.transaction(() => {
      const out = {};
      for (const table of TABLE_ORDER) {
        out[table] = db.db.prepare(`SELECT * FROM ${table}`).all();
      }
      return out;
    });

    // Walk the job folders first to build a candidate list of files to archive.
    // The final manifest is built later from only the files that actually land
    // in the zip, so a restore can confirm every listed file unpacked.
    const jobBase = settings.job_folders_base;
    const collected = [];
    let walkSkipped = 0;
    if (jobBase && fs.existsSync(jobBase)) {
      const files = [];
      listFilesRecursive(jobBase, jobBase, files);
      for (const f of files) {
        try {
          const { size } = fs.statSync(f.abs);
          collected.push({ abs: f.abs, relPath: f.rel, size });
        } catch (err) {
          walkSkipped++;
          logger.warn({ err, file: f.abs }, 'File skipped during backup export');
        }
      }
    }

    // Pre-flight: drop any file that exists but can't be opened for reading
    // (exclusively locked or permission-denied). archiver would otherwise emit
    // a fatal error on the first such file and abort the whole backup.
    const { readable, unreadable } = partitionReadableFiles(collected);
    const readableFiles = readable;
    const preSkipped = unreadable.length;

    const tables = readAllTables();
    const metadata = {
      exportedAt: new Date().toISOString(),
      appVersion,
      schemaVersion: SCHEMA_VERSION
    };

    // Delegate packing + manifest assembly so the manifest and the reported
    // skipped count always match exactly what made it into the archive. The
    // retry wrapper drops any file that becomes locked after the pre-flight.
    const skipped = await archiveBackupWithRetry({
      metadata,
      tables,
      collected: readableFiles,
      outputPath,
      walkSkipped,
      preSkipped
    });

    const stats = fs.statSync(outputPath);
    logger.info({ outputPath, size: stats.size }, 'Backup exported successfully');

    try {
      recordHistory('system', 'backup', 'data_export', req.user.userId, actorName(req), {
        outputPath: { from: null, to: outputPath },
        size: { from: null, to: `${(stats.size / 1024 / 1024).toFixed(1)} MB` }
      }, null);
    } catch (histErr) {
      logger.error({ err: histErr }, 'Failed to record export history');
    }

    res.json({ success: true, size: stats.size, filesSkipped: skipped });
  } catch (err) {
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) { /* ignore */ }
    logger.error({ err }, 'Error exporting backup');
    res.status(500).json({ error: 'Failed to export backup: ' + err.message });
  }
});

// Import full backup from ZIP (admin only)
router.post('/import-backup', requirePermission('systemData'), [
  requiredString('inputPath', 'Input path'),
  handleValidationErrors
], async (req, res) => {
  const { inputPath } = req.body;

  if (!fs.existsSync(inputPath)) {
    return res.status(400).json({ error: 'Backup file not found' });
  }

  const currentSettings = db.getSettings();
  const currentJobBase = currentSettings.job_folders_base;
  // The print-naming cutover belongs to THIS install, not to the backup — it is the
  // boundary that stops the rename below demoting genuine prints to previews. Read it
  // before the settings are wiped so it can be put back.
  const currentPrintCutover = currentSettings[PRINT_NAMING_CUTOVER_KEY];

  if (!currentJobBase) {
    return res.status(400).json({
      error: 'Please configure the Job Folders Base path in Settings before importing a backup'
    });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-backup-'));
  // Staging + "old" folders sit beside the live job folders (same volume), so
  // the final switch is an instant rename rather than a slow, failure-prone copy.
  const parentDir = path.dirname(currentJobBase);
  const baseName = path.basename(currentJobBase);
  const stagingDir = path.join(parentDir, `${baseName}__restore_staging`);
  const oldDir = path.join(parentDir, `${baseName}__restore_old`);

  let maintenanceOn = false;
  let filesSwapped = false;
  // Set if an automatic rollback could not put the original files back, leaving
  // the files on disk and the database records out of sync — admin must review.
  let filesUnrecoverable = false;

  try {
    const staged = await stageBackupArchive(inputPath, tempDir, SCHEMA_VERSION, TABLE_ORDER);
    if (staged.error) {
      return res.status(staged.status).json({ error: staged.error });
    }
    const data = staged.data;

    // Everything past here touches real data — block other clients' writes for
    // the duration so nothing can be saved against half-restored data.
    setMaintenance(true);
    maintenanceOn = true;

    // Clear leftovers from any previously interrupted restore.
    bestEffortRemove(stagingDir);
    bestEffortRemove(oldDir);

    // 1-2. Stage the backup's files off to the side, confirm every file in the
    //    manifest unpacked correctly, then swap them into place with instant
    //    renames. If a rename fails, undo it and abort with the live folders
    //    untouched.
    let hasFiles;
    try {
      ({ filesSwapped, hasFiles } = swapJobFolders({
        tempDir, currentJobBase, stagingDir, oldDir,
        fileManifest: data._metadata.fileManifest
      }));
    } catch (swapErr) {
      if (swapErr.filesUnrecoverable) filesUnrecoverable = true;
      throw swapErr;
    }

    // 3. Reload the records as one all-or-nothing step. If it throws, the records
    //    roll back automatically and we reverse the file swap. tableColumns is
    //    computed here, outside the restore/rollback pairing below, so a failure
    //    reading it is never mistaken for a table-restore failure.
    const tableColumns = {};
    for (const table of TABLE_ORDER) {
      tableColumns[table] = getTableColumns(table);
    }

    try {
      restoreTables({ data, tableOrder: TABLE_ORDER, tableColumns, currentJobBase, currentPrintCutover });
    } catch (dbErr) {
      // Records rolled back on their own; put the original files back too.
      if (filesSwapped) {
        const { unrecoverable } = rollbackJobFolderSwap({ currentJobBase, stagingDir, oldDir });
        if (unrecoverable) filesUnrecoverable = true;
        filesSwapped = false;
      }
      throw dbErr;
    }

    // 4. Success — discard the old files and any staging leftovers. The restore
    //    has already committed, so a leftover-folder lock must never report failure.
    bestEffortRemove(oldDir);
    bestEffortRemove(stagingDir);
    logger.info({ jobBase: currentJobBase, filesRestored: hasFiles }, 'Backup restored successfully');

    // Record import in history (wrap in try-catch since the importing user
    // may not exist in the restored data, which would cause an FK violation)
    try {
      recordHistory('system', 'backup', 'data_import', req.user.userId, actorName(req), {
        source: { from: null, to: data._metadata.exportedAt },
        tables: { from: null, to: TABLE_ORDER.length + ' tables restored' },
        filesRestored: { from: null, to: hasFiles ? 'yes' : 'no' }
      }, null);
    } catch (histErr) {
      logger.error({ err: histErr }, 'Failed to record import history (user may not exist in restored data)');
    }

    res.json({ success: true, message: 'Backup imported successfully' });
  } catch (err) {
    try { db.db.pragma('foreign_keys = ON'); } catch (_) { /* ignore */ }
    // If we staged files but never swapped them in, remove the staging copy.
    try {
      if (!filesSwapped && fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    } catch (_) { /* ignore */ }
    logger.error({ err }, 'Error importing backup');
    if (filesUnrecoverable) {
      res.status(500).json({
        error: 'Failed to import backup, and the automatic undo could not put the original files back. '
          + 'The files on disk and the database records may now be out of sync. '
          + 'Check the server logs and the leftover restore folders, and review the data manually before continuing. '
          + 'Details: ' + err.message
      });
    } else {
      res.status(500).json({ error: 'Failed to import backup: ' + err.message });
    }
  } finally {
    if (maintenanceOn) setMaintenance(false);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
});

module.exports = router;
