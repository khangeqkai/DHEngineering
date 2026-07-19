const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const extractZip = require('extract-zip');
const logger = require('../utils/logger');
const { authenticate, requireAdmin, requireManagement } = require('../middleware/auth');
const db = require('../db/database');
const config = require('../config');
const { lanIpv4s } = require('../utils/netHost');
const { recordHistory } = require('../db/helpers');
const { setMaintenance } = require('../middleware/maintenance');
const { requiredString, handleValidationErrors } = require('../middleware/validation');
const { version: appVersion } = require('../../package.json');
const {
  listFilesRecursive,
  verifyStagedFiles,
  copyDirRecursive,
  bestEffortRemove,
  partitionReadableFiles,
  archiveBackupWithRetry
} = require('./backup-helpers');
const { collectOvertimeUpdates, OVERTIME_BODY_KEYS, OVERTIME_DB_KEYS } = require('./settings-overtime');

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
    // Labour rates & overtime are admin-only money settings: strip them for
    // managers so the pricing never reaches a session that can't open the
    // Labour Rates page. (getSettings builds a fresh object per call.)
    if (req.user.role !== 'admin') {
      for (const key of OVERTIME_DB_KEYS) delete settings[key];
    }
    // Convert snake_case keys to camelCase
    const camelCaseSettings = convertKeysToCamel(settings);
    // Tell the admin exactly what address the OTHER computers should type: the
    // server's own LAN address(es), plus whether it's serving the padlock
    // (secure) address yet — so the Server Connection card can show it verbatim.
    camelCaseSettings.serverAddresses = lanIpv4s();
    camelCaseSettings.secureServing = config.secure;
    camelCaseSettings.mdnsName = config.mdnsName;
    res.json(camelCaseSettings);
  } catch (err) {
    logger.error({ err }, 'Error getting settings');
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings (admin or manager; labour rates & overtime stay admin-only)
router.put('/', requireManagement, (req, res) => {
  try {
    // Reject a manager's attempt to save any overtime/labour-rate field outright
    // rather than silently dropping it, so a stale client fails loudly.
    if (req.user.role !== 'admin') {
      const blocked = OVERTIME_BODY_KEYS.find(k => req.body[k] !== undefined);
      if (blocked) {
        return res.status(403).json({ error: 'Only admins can change labour rates and overtime settings' });
      }
      // The job-folders base path decides where every job's files (and backups) are
      // written; only admins can repoint it, so a manager can't redirect company
      // files to a personal/removable drive.
      if (req.body.jobFoldersBase !== undefined || req.body.job_folders_base !== undefined) {
        return res.status(403).json({ error: 'Only admins can change the job folders base path' });
      }
    }

    const jobFoldersBase = req.body.jobFoldersBase ?? req.body.job_folders_base;
    const inactivityTimeoutMinutes = req.body.inactivityTimeoutMinutes ?? req.body.inactivity_timeout_minutes;
    const updates = {};

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
      const timeout = parseInt(inactivityTimeoutMinutes, 10);
      if (isNaN(timeout) || timeout < 1 || timeout > 60) {
        return res.status(400).json({ error: 'Inactivity timeout must be between 1 and 60 minutes' });
      }
      updates.inactivity_timeout_minutes = String(timeout);
    }

    // Validate job number prefix if provided
    const jobNumberPrefix = req.body.jobNumberPrefix ?? req.body.job_number_prefix;
    if (jobNumberPrefix !== undefined) {
      updates.job_number_prefix = jobNumberPrefix || '';
    }

    // Validate job number next if provided
    const jobNumberNext = req.body.jobNumberNext ?? req.body.job_number_next;
    if (jobNumberNext !== undefined) {
      if (jobNumberNext && !/^\d+$/.test(jobNumberNext)) {
        return res.status(400).json({ error: 'Starting number must contain only digits (e.g. 00001)' });
      }

      // Prevent setting the counter backward into existing job numbers
      if (jobNumberNext) {
        const currentSettings = db.getSettings();
        const effectivePrefix = jobNumberPrefix !== undefined ? (jobNumberPrefix || '') : (currentSettings.job_number_prefix || '');
        const newNum = parseInt(jobNumberNext, 10);
        const width = jobNumberNext.length;

        // Find all job numbers with this prefix and extract the highest numeric part
        const rows = db.db.prepare("SELECT job_number FROM jobcards WHERE substr(job_number, 1, ?) = ?").all(effectivePrefix.length, effectivePrefix);
        let maxExisting = 0;
        for (const row of rows) {
          const numPart = row.job_number.slice(effectivePrefix.length);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxExisting) maxExisting = num;
        }

        if (maxExisting > 0 && newNum <= maxExisting) {
          const paddedMax = String(maxExisting).padStart(width, '0');
          return res.status(400).json({
            error: `Starting number must be greater than ${paddedMax} — job ${effectivePrefix}${paddedMax} already exists`
          });
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
    const timeoutMinutes = parseInt(settings.inactivity_timeout_minutes, 10) || 5;
    res.json({ inactivityTimeoutMinutes: timeoutMinutes });
  } catch (err) {
    logger.error({ err }, 'Error getting inactivity timeout');
    res.status(500).json({ error: 'Failed to get inactivity timeout' });
  }
});

// Table order: parents first, children last (for insert)
const TABLE_ORDER = [
  'settings', 'users', 'contacts', 'suppliers', 'machines', 'tags',
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
router.post('/export-backup', requireAdmin, [
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
      recordHistory('system', 'backup', 'data_export', req.user.userId, req.user.name || req.user.username, {
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
router.post('/import-backup', requireAdmin, [
  requiredString('inputPath', 'Input path'),
  handleValidationErrors
], async (req, res) => {
  const { inputPath } = req.body;

  if (!fs.existsSync(inputPath)) {
    return res.status(400).json({ error: 'Backup file not found' });
  }

  const currentSettings = db.getSettings();
  const currentJobBase = currentSettings.job_folders_base;

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
    await extractZip(inputPath, { dir: tempDir });

    const dbJsonPath = path.join(tempDir, 'database.json');
    if (!fs.existsSync(dbJsonPath)) {
      return res.status(400).json({ error: 'Invalid backup: missing database.json' });
    }

    const data = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));

    if (!data._metadata) {
      return res.status(400).json({ error: 'Invalid backup: missing _metadata' });
    }
    if (data._metadata.schemaVersion !== SCHEMA_VERSION) {
      return res.status(400).json({
        error: `Incompatible backup schema version ${data._metadata.schemaVersion} (expected ${SCHEMA_VERSION})`
      });
    }
    for (const table of TABLE_ORDER) {
      if (!Array.isArray(data[table])) {
        return res.status(400).json({ error: `Invalid backup: missing table "${table}"` });
      }
    }

    // Everything past here touches real data — block other clients' writes for
    // the duration so nothing can be saved against half-restored data.
    setMaintenance(true);
    maintenanceOn = true;

    // Clear leftovers from any previously interrupted restore.
    bestEffortRemove(stagingDir);
    bestEffortRemove(oldDir);

    // 1. Stage the backup's files off to the side (non-destructive), then confirm
    //    every file in the manifest unpacked correctly before committing.
    const filesDir = path.join(tempDir, 'files');
    const hasFiles = fs.existsSync(filesDir);
    if (hasFiles) {
      copyDirRecursive(filesDir, stagingDir);
      verifyStagedFiles(stagingDir, data._metadata.fileManifest);
    }

    // 2. Swap the staged files into place with instant renames. If a rename
    //    fails, undo it and abort with the live folders untouched.
    if (hasFiles) {
      fs.renameSync(currentJobBase, oldDir);
      try {
        fs.renameSync(stagingDir, currentJobBase);
      } catch (swapErr) {
        // Restoring the originals failed too — the live folder is now empty and
        // the originals are stranded in __restore_old. Surface it, but still
        // throw the real cause (swapErr) rather than masking it.
        try {
          fs.renameSync(oldDir, currentJobBase);
        } catch (revertErr) {
          filesUnrecoverable = true;
          logger.error(
            { err: revertErr, from: oldDir, to: currentJobBase, step: 'swap-revert' },
            'Backup restore swap revert failed: original files left in __restore_old, live folder empty — manual review required'
          );
        }
        throw swapErr;
      }
      filesSwapped = true;
    }

    // 3. Reload the records as one all-or-nothing step. If it throws, the records
    //    roll back automatically and we reverse the file swap.
    const tableColumns = {};
    for (const table of TABLE_ORDER) {
      tableColumns[table] = getTableColumns(table);
    }

    try {
      db.db.pragma('foreign_keys = OFF');
      try {
        const importTransaction = db.db.transaction(() => {
          const reversed = [...TABLE_ORDER].reverse();
          for (const table of reversed) {
            db.db.prepare(`DELETE FROM ${table}`).run();
          }

          for (const table of TABLE_ORDER) {
            const rows = data[table];
            if (rows.length === 0) continue;

            const validColumns = tableColumns[table];
            const columns = Object.keys(rows[0]).filter(c => validColumns.has(c));
            if (columns.length === 0) continue;

            const placeholders = columns.map(() => '?').join(', ');
            const columnNames = columns.join(', ');
            const stmt = db.db.prepare(`INSERT INTO ${table} (${columnNames}) VALUES (${placeholders})`);

            for (const row of rows) {
              stmt.run(...columns.map(col => row[col]));
            }
          }

          // Fix sqlite_sequence for history table (AUTOINCREMENT)
          if (data.history.length > 0) {
            const maxId = data.history.reduce((max, r) => r.id > max ? r.id : max, 0);
            db.db.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = 'history'`).run(maxId);
          }

          // End every restored session so no one stays signed in across a rewind.
          db.db.prepare('UPDATE users SET session_token = NULL').run();

          // Keep THIS machine's folder locations (the backup may carry another
          // machine's paths). Done inside the transaction so the live paths never
          // briefly point at the backup machine's folders.
          const upsertSetting = db.db.prepare(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`
          );
          upsertSetting.run('job_folders_base', currentJobBase || '');
        });

        importTransaction();
      } finally {
        db.db.pragma('foreign_keys = ON');
      }
    } catch (dbErr) {
      // Records rolled back on their own; put the original files back too.
      if (filesSwapped) {
        // Move the restored files out of the live folder first; only restore the
        // originals if that actually cleared the live folder, so we never try to
        // rename onto a folder that's still occupied. Log every failure so a
        // mixed state (new files on disk, old records in the database) is visible.
        let movedNewAside = false;
        try {
          fs.renameSync(currentJobBase, stagingDir);
          movedNewAside = true;
        } catch (rbErr) {
          filesUnrecoverable = true;
          logger.error(
            { err: rbErr, from: currentJobBase, to: stagingDir, step: 'rollback-move-new-aside' },
            'Backup restore rollback failed: could not move restored files out of live folder; disk holds NEW files while database holds OLD records — manual review required'
          );
        }
        if (movedNewAside) {
          try {
            fs.renameSync(oldDir, currentJobBase);
          } catch (rbErr) {
            filesUnrecoverable = true;
            logger.error(
              { err: rbErr, from: oldDir, to: currentJobBase, step: 'rollback-restore-original' },
              'Backup restore rollback failed: original files could not be restored to live folder (left in __restore_old); database holds OLD records — manual review required'
            );
          }
        }
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
      recordHistory('system', 'backup', 'data_import', req.user.userId, req.user.name || req.user.username, {
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
