const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const extractZip = require('extract-zip');
const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const db = require('../db/database');
const { recordHistory } = require('../db/helpers');
const { requiredString, handleValidationErrors } = require('../middleware/validation');
const { version: appVersion } = require('../../package.json');

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

// Get settings (admin only)
router.get('/', requireAdmin, (req, res) => {
  try {
    const settings = db.getSettings();
    // Convert snake_case keys to camelCase
    const camelCaseSettings = convertKeysToCamel(settings);
    res.json(camelCaseSettings);
  } catch (err) {
    logger.error({ err }, 'Error getting settings');
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings (admin only)
router.put('/', requireAdmin, (req, res) => {
  try {
    // Accept both camelCase and snake_case for backwards compatibility
    const scannerFolder = req.body.scannerFolder ?? req.body.scanner_folder;
    const jobFoldersBase = req.body.jobFoldersBase ?? req.body.job_folders_base;
    const inactivityTimeoutMinutes = req.body.inactivityTimeoutMinutes ?? req.body.inactivity_timeout_minutes;
    const updates = {};

    // Validate scanner folder if provided
    if (scannerFolder !== undefined) {
      if (scannerFolder && scannerFolder.trim()) {
        // Check if the folder exists
        if (!fs.existsSync(scannerFolder)) {
          return res.status(400).json({ error: 'Scanner folder does not exist' });
        }

        // Check if it's a directory
        const stats = fs.statSync(scannerFolder);
        if (!stats.isDirectory()) {
          return res.status(400).json({ error: 'Path is not a directory' });
        }
      }
      updates.scanner_folder = scannerFolder || '';
    }

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

// Get scanner files (mounted at /api/scanner/files)
router.get('/files', authenticate, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const settings = db.getSettings();

    if (!settings.scanner_folder) {
      return res.json({ files: [], message: 'Scanner folder not configured' });
    }

    if (!fs.existsSync(settings.scanner_folder)) {
      return res.json({ files: [], message: 'Scanner folder does not exist' });
    }

    // Get files from the scanner folder
    const files = fs.readdirSync(settings.scanner_folder)
      .map(filename => {
        const filePath = path.join(settings.scanner_folder, filename);
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return null;

          return {
            name: filename,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          };
        } catch (err) {
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified)) // Most recent first
      .slice(0, limit);

    res.json({ files, folder: settings.scanner_folder });
  } catch (err) {
    logger.error({ err }, 'Error getting scanner files');
    res.status(500).json({ error: 'Failed to get scanner files' });
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

    const dbData = {
      _metadata: {
        exportedAt: new Date().toISOString(),
        appVersion,
        schemaVersion: SCHEMA_VERSION
      }
    };
    for (const table of TABLE_ORDER) {
      dbData[table] = db.db.prepare(`SELECT * FROM ${table}`).all();
    }

    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          logger.warn({ err }, 'File skipped during backup export');
        } else {
          reject(err);
        }
      });
      archive.pipe(output);

      archive.append(JSON.stringify(dbData, null, 2), { name: 'database.json' });

      const jobBase = settings.job_folders_base;
      if (jobBase && fs.existsSync(jobBase)) {
        archive.directory(jobBase, 'files');
      }

      archive.finalize();
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

    res.json({ success: true, size: stats.size });
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

  try {
    const currentSettings = db.getSettings();
    const currentJobBase = currentSettings.job_folders_base;
    const currentScannerFolder = currentSettings.scanner_folder;

    if (!currentJobBase) {
      return res.status(400).json({
        error: 'Please configure the Job Folders Base path in Settings before importing a backup'
      });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-backup-'));
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

      // FK pragma must be set OUTSIDE the transaction to take effect
      // Pre-compute valid columns for all tables before the transaction
      const tableColumns = {};
      for (const table of TABLE_ORDER) {
        tableColumns[table] = getTableColumns(table);
      }

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
        });

        importTransaction();
      } finally {
        db.db.pragma('foreign_keys = ON');
      }

      // Restore current machine's path settings (backup may have different paths)
      db.updateSettings({
        job_folders_base: currentJobBase || '',
        scanner_folder: currentScannerFolder || ''
      });

      // Restore job folder files using the CURRENT machine's path
      const filesDir = path.join(tempDir, 'files');
      if (fs.existsSync(filesDir) && currentJobBase) {
        copyDirRecursive(filesDir, currentJobBase);
        logger.info({ from: filesDir, to: currentJobBase }, 'Job folder files restored');
      }

      // Record import in history (wrap in try-catch since the importing user
      // may not exist in the restored data, which would cause an FK violation)
      try {
        recordHistory('system', 'backup', 'data_import', req.user.userId, req.user.name || req.user.username, {
          source: { from: null, to: data._metadata.exportedAt },
          tables: { from: null, to: TABLE_ORDER.length + ' tables restored' },
          filesRestored: { from: null, to: fs.existsSync(filesDir) ? 'yes' : 'no' }
        }, null);
      } catch (histErr) {
        logger.error({ err: histErr }, 'Failed to record import history (user may not exist in restored data)');
      }

      res.json({ success: true, message: 'Backup imported successfully' });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    try { db.db.pragma('foreign_keys = ON'); } catch (_) { /* ignore */ }
    logger.error({ err }, 'Error importing backup');
    res.status(500).json({ error: 'Failed to import backup: ' + err.message });
  }
});

// Helper: recursively copy directory contents (merge, overwrite existing files)
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

module.exports = router;
