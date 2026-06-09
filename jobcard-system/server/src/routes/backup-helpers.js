const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const logger = require('../utils/logger');

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

module.exports = {
  listFilesRecursive,
  verifyStagedFiles,
  copyDirRecursive,
  bestEffortRemove,
  partitionReadableFiles,
  archiveBackupWithRetry
};
