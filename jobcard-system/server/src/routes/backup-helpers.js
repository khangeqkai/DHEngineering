const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const extractZip = require('extract-zip');
const logger = require('../utils/logger');
const db = require('../db/database');
const { runStartupConversions } = require('../db/init');
const { PRINT_NAMING_CUTOVER_KEY } = require('../db/legacyMigrations');
const { splitCustomersInBackup } = require('../db/splitCustomers');

// Helper: collect every file under dir, with forward-slash paths relative to
// baseDir. Symlinks and other special entries are ignored (real files only).
function listFilesRecursive(dir, baseDir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(abs, baseDir, out);
    } else if (entry.isFile()) {
      out.push({ abs, rel: path.relative(baseDir, abs).split(path.sep).join('/') });
    }
  }
}

// Helper: confirm every file the backup claims to contain actually unpacked into
// the staging folder, with a matching size. Throws to abort the restore (before
// anything is committed) if a file is missing or didn't unpack correctly. Backups
// made without a manifest simply skip this check.
function verifyStagedFiles(stagingDir, manifest) {
  if (!manifest || !Array.isArray(manifest.files)) return;
  for (const entry of manifest.files) {
    const rel = entry.relPath.split('/').join(path.sep);
    const abs = path.join(stagingDir, rel);
    let st;
    try {
      st = fs.statSync(abs);
    } catch (_) {
      throw new Error(`A saved file is missing from the backup (${entry.relPath}). Restore stopped; nothing was changed.`);
    }
    if (!st.isFile() || (typeof entry.size === 'number' && st.size !== entry.size)) {
      throw new Error(`A saved file did not unpack correctly (${entry.relPath}). Restore stopped; nothing was changed.`);
    }
  }
}

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

// Helper: best-effort delete of a leftover restore folder. Used after a restore
// has already committed, so a failure here must never throw — just log it.
function bestEffortRemove(dir) {
  try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); }
  catch (err) { logger.warn({ err, dir }, 'Failed to remove leftover restore folder'); }
}

// Split the collected files into those we can actually open for reading and
// those we can't. A file may exist (so the up-front lstat/stat succeeded) yet
// still be impossible to read at pack time because it's exclusively locked
// (Windows EBUSY) or permission-denied (EACCES/EPERM). archiver only discovers
// this when it lazily opens its read stream, by which point it emits a FATAL
// `error` event rather than a recoverable ENOENT `warning` — so we pre-flight
// each file here and drop the unreadable ones before they ever reach archiver.
//
// NOTE: fs.accessSync(path, R_OK) does NOT detect a Windows exclusive lock —
// the access check passes but a later open still fails with EBUSY. Only an
// actual open reliably surfaces the lock, so we open-and-immediately-close.
// Open-only (no read) keeps this O(1) per file regardless of file size.
function partitionReadableFiles(collected) {
  const readable = [];
  const unreadable = [];
  for (const c of collected) {
    try {
      const fd = fs.openSync(c.abs, 'r');
      fs.closeSync(fd);
      readable.push(c);
    } catch (err) {
      unreadable.push(c);
      logger.warn({ err, file: c.abs }, 'File skipped during backup export');
    }
  }
  return { readable, unreadable };
}

// Pack the backup ZIP so the manifest and the reported skipped count reflect
// exactly what actually landed in the archive.
//
// Files are appended FIRST, then we watch the archiver's `entry` events (which
// fire only once a file's bytes are in the zip) and ENOENT `warning` events
// (which fire when a file vanished between the up-front stat and the append).
// Once every collected file has resolved one way or the other, we build the
// manifest from only the files that truly made it in, append database.json LAST
// with that accurate manifest, then finalize.
//
// `preSkipped` carries forward files dropped before this call (walk-time stat
// failures live in `walkSkipped`; files dropped by the readable pre-flight live
// in `preSkipped`). The `collected` array passed here is the readable-only list.
//
// Returns the accurate total skipped count (walk-time stat failures + pre-flight
// unreadable files + files that disappeared before the append).
function archiveBackup({ metadata, tables, collected, outputPath, walkSkipped, preSkipped = 0 }) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    // Track which file names actually entered the zip.
    const archivedNames = new Set();
    let fileEventCount = 0;
    let manifestAppended = false;
    let settled = false;

    const buildDbJson = (skipped) => {
      const archivedFiles = collected.filter(c => archivedNames.has(`files/${c.relPath}`));
      const totalSkipped = walkSkipped + preSkipped + (collected.length - archivedFiles.length);
      const dbData = {
        _metadata: {
          ...metadata,
          fileManifest: {
            files: archivedFiles.map(c => ({ relPath: c.relPath, size: c.size })),
            skipped: totalSkipped
          }
        },
        ...tables
      };
      return { dbData, totalSkipped };
    };

    const appendManifestAndFinalize = () => {
      if (manifestAppended) return;
      manifestAppended = true;
      const { dbData, totalSkipped } = buildDbJson();
      archive._dhTotalSkipped = totalSkipped;
      archive.append(JSON.stringify(dbData, null, 2), { name: 'database.json' });
      archive.finalize();
    };

    output.on('close', () => {
      if (settled) return;
      settled = true;
      resolve(archive._dhTotalSkipped);
    });

    archive.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    // The destination can fail on its own (folder gone, drive unplugged, full,
    // read-only). pipe() re-emits that on `output`, and an 'error' with no listener
    // throws out of the event loop and kills the whole server — not just this
    // request. Route it into the same reject so the admin gets "backup failed".
    output.on('error', (err) => {
      if (settled) return;
      settled = true;
      archive.abort();
      reject(err);
    });

    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        // A collected file disappeared before its bytes could be appended.
        logger.warn({ err }, 'File skipped during backup export');
        fileEventCount++;
        if (fileEventCount === collected.length) appendManifestAndFinalize();
      } else if (!settled) {
        settled = true;
        reject(err);
      }
    });

    archive.on('entry', (data) => {
      // Only count file entries; database.json is appended last and must not be
      // counted toward the file total.
      if (!data || !data.name || !data.name.startsWith('files/')) return;
      archivedNames.add(data.name);
      fileEventCount++;
      if (fileEventCount === collected.length) appendManifestAndFinalize();
    });

    archive.pipe(output);

    // No files at all: append database.json with an empty manifest immediately.
    if (collected.length === 0) {
      appendManifestAndFinalize();
      return;
    }

    for (const c of collected) {
      archive.file(c.abs, { name: `files/${c.relPath}` });
    }
  });
}

// Safety net for the TOCTOU window: a file can pass the readable pre-flight and
// then get locked before archiver reaches it, producing a fatal mid-stream
// `error`. archiver cannot resume a half-written archive after such an error,
// so we retry the whole pack with a fresh archiver instance. Before each retry
// we re-run the readable pre-flight on the current list — the offending lock is
// almost certainly still held, so the now-bad file gets caught and dropped this
// time. Re-partitioning is self-correcting and doesn't depend on archiver's
// error shape, so it's preferred over trusting err.path.
//
// Only per-file read locks are recoverable. Any other failure (disk full,
// unwritable output, etc.) is re-thrown for the route to surface. We also
// re-throw if re-partitioning removed no files, which guarantees the loop
// terminates instead of spinning forever on an unrelated error.
async function archiveBackupWithRetry({ metadata, tables, collected, outputPath, walkSkipped, preSkipped = 0 }) {
  const RECOVERABLE = ['EBUSY', 'EACCES', 'EPERM', 'ENOENT'];
  // Hard cap as a backstop: at most one drop per file, plus a final attempt.
  const maxAttempts = collected.length + 1;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      return await archiveBackup({ metadata, tables, collected, outputPath, walkSkipped, preSkipped });
    } catch (err) {
      if (!RECOVERABLE.includes(err.code)) throw err;

      // Best-effort delete of the partial zip before retrying.
      try { fs.unlinkSync(outputPath); } catch { /* ignore */ }

      // Re-run the pre-flight; the lock is likely still held so the bad file is
      // caught now. If nothing newly dropped, this isn't a recoverable lock —
      // re-throw to avoid an infinite loop.
      const { readable, unreadable } = partitionReadableFiles(collected);
      if (unreadable.length === 0) throw err;

      collected = readable;
      preSkipped += unreadable.length;
    }
  }

  // Backstop: exhausted the bounded loop without success.
  throw new Error('Backup export failed: too many files became unreadable during packing');
}

// ── Import-backup steps ──
// POST /settings/import-backup (settings.js) splits into these four named steps,
// called in exactly the order they ran as one long handler before: stage (read
// and validate the archive), swap job folders, restore tables, and — only if the
// table restore then fails — roll back the folder swap. The route still owns the
// maintenance-mode flag, the temp/staging/old directory paths, and the outer
// try/catch/finally that decides what to log and reply — only each step's own
// body moved here, so the failure/rollback order is unchanged.

// STAGE — unpack the archive and validate its shape. No live data (database or
// job folders) is touched yet, so a rejection here needs no rollback of anything.
// Returns { error, status } to send as-is, or { data } to continue with.
async function stageBackupArchive(inputPath, tempDir, schemaVersion, tableOrder) {
  await extractZip(inputPath, { dir: tempDir });

  const dbJsonPath = path.join(tempDir, 'database.json');
  if (!fs.existsSync(dbJsonPath)) {
    return { error: 'Invalid backup: missing database.json', status: 400 };
  }

  const data = splitCustomersInBackup(JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8')));

  if (!data._metadata) {
    return { error: 'Invalid backup: missing _metadata', status: 400 };
  }
  if (data._metadata.schemaVersion !== schemaVersion) {
    return {
      error: `Incompatible backup schema version ${data._metadata.schemaVersion} (expected ${schemaVersion})`,
      status: 400
    };
  }
  for (const table of tableOrder) {
    if (!Array.isArray(data[table])) {
      return { error: `Invalid backup: missing table "${table}"`, status: 400 };
    }
  }

  return { data };
}

// SWAP JOB FOLDERS — stage the backup's files off to the side, confirm every
// manifest file actually unpacked, then swap them into place with instant
// renames. If the second rename fails, undo the first and re-throw so the live
// folders are left untouched; if undoing that also fails, the thrown error
// carries `.filesUnrecoverable = true` so the caller knows manual review is
// needed. Returns { filesSwapped, hasFiles } on success (filesSwapped is false,
// same as today, when the backup carries no files at all).
function swapJobFolders({ tempDir, currentJobBase, stagingDir, oldDir, fileManifest }) {
  const filesDir = path.join(tempDir, 'files');
  const hasFiles = fs.existsSync(filesDir);
  if (!hasFiles) return { filesSwapped: false, hasFiles: false };

  copyDirRecursive(filesDir, stagingDir);
  verifyStagedFiles(stagingDir, fileManifest);

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
      logger.error(
        { err: revertErr, from: oldDir, to: currentJobBase, step: 'swap-revert' },
        'Backup restore swap revert failed: original files left in __restore_old, live folder empty — manual review required'
      );
      swapErr.filesUnrecoverable = true;
    }
    throw swapErr;
  }

  return { filesSwapped: true, hasFiles: true };
}

// RESTORE TABLES — reload every table as one all-or-nothing transaction, then run
// the same full startup-conversion pass a boot would run. `tableColumns` is
// computed by the caller (outside this step, matching today) so a failure there
// is never mistaken for a table-restore failure needing the file rollback below.
function restoreTables({ data, tableOrder, tableColumns, currentJobBase, currentPrintCutover }) {
  db.db.pragma('foreign_keys = OFF');
  try {
    const importTransaction = db.db.transaction(() => {
      const reversed = [...tableOrder].reverse();
      for (const table of reversed) {
        db.db.prepare(`DELETE FROM ${table}`).run();
      }

      for (const table of tableOrder) {
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
      db.settingsQueries.upsert.run('job_folders_base', currentJobBase || '');

      // The print-naming cutover is the one marker that belongs to the *data* rather
      // than to this machine, so the earlier of the two dates wins: ours, and the
      // backup's own marker, which has just landed with the rest of the settings.
      // Keeping ours unconditionally would let a machine rebuilt today rename every
      // genuine print carried by an older install's backup into a preview — the audit
      // record destroyed while the job keeps its print tick, which is the exact
      // disagreement the cutover exists to prevent. Earlier only ever renames fewer
      // rows, which is the safe direction. Both are ISO-8601, so they sort by date.
      const restoredPrintCutover = db.settingsQueries.getByKey.get(PRINT_NAMING_CUTOVER_KEY)?.value;
      const keptPrintCutover = [currentPrintCutover, restoredPrintCutover].filter(Boolean).sort()[0];
      if (keptPrintCutover) {
        db.settingsQueries.upsert.run(PRINT_NAMING_CUTOVER_KEY, keptPrintCutover);
      }

      // A restore must end in exactly the state a fresh restart would produce, so
      // run the SAME full conversion pass a boot runs — timestamp normalisation,
      // then every migration in runMigrations() (whole-hour schedule snap, good-piece
      // folding, the print-trail rename bounded by the cutover just kept above, and
      // everything else in that list) — rather than hand-picking a subset here. A
      // conversion missing from a hand-picked list is exactly how the overtime-hours
      // migration was left out of a restore in the first place. Tidy-up only: a
      // failure here must never throw away a restore whose records already loaded
      // correctly (the next boot runs the same pass again and retries).
      try {
        runStartupConversions();
      } catch (convErr) {
        logger.error({ err: convErr }, 'Backup restore: startup conversion pass failed (records restored; next restart will retry)');
      }
    });

    importTransaction();
  } finally {
    db.db.pragma('foreign_keys = ON');
  }
}

// ROLL BACK — undo swapJobFolders after restoreTables has thrown: move the
// newly-restored files out of the live folder, then put the originals (still
// sitting in oldDir) back. Every failure here is logged as it happens (mirroring
// today's inline code exactly); the return value only tells the caller whether
// manual review is now needed.
function rollbackJobFolderSwap({ currentJobBase, stagingDir, oldDir }) {
  let movedNewAside = false;
  let unrecoverable = false;
  try {
    fs.renameSync(currentJobBase, stagingDir);
    movedNewAside = true;
  } catch (rbErr) {
    unrecoverable = true;
    logger.error(
      { err: rbErr, from: currentJobBase, to: stagingDir, step: 'rollback-move-new-aside' },
      'Backup restore rollback failed: could not move restored files out of live folder; disk holds NEW files while database holds OLD records — manual review required'
    );
  }
  if (movedNewAside) {
    try {
      fs.renameSync(oldDir, currentJobBase);
    } catch (rbErr) {
      unrecoverable = true;
      logger.error(
        { err: rbErr, from: oldDir, to: currentJobBase, step: 'rollback-restore-original' },
        'Backup restore rollback failed: original files could not be restored to live folder (left in __restore_old); database holds OLD records — manual review required'
      );
    }
  }
  return { unrecoverable };
}

module.exports = {
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
};
