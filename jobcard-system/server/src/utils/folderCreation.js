const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const db = require('../db/database');
const { CATEGORY_FOLDER } = require('../shared/jobFiles');

// Windows reserved device names: unusable as a file/folder name whether or not an
// extension follows (CON, con.txt, COM1, lpt1.pdf, … are all reserved), regardless
// of anything else in the name. Checked case-insensitively against the whole
// sanitized string.
const RESERVED_DEVICE_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.[^.]*)?$/i;

/**
 * Sanitize a string for use as a folder name.
 * Removes filesystem-unsafe characters, path traversal sequences, and control characters.
 * Works safely across Windows, macOS, and Linux.
 */
function sanitizeFolderName(name) {
  if (!name) return '';
  const cleaned = name
    .replace(/[<>:"/\\|?*]/g, '_')   // filesystem-unsafe chars (Windows + POSIX)
    .replace(/[\x00-\x1f\x7f]/g, '') // control characters
    .trim()
    .replace(/\.\./g, '_')           // path traversal (after trim, before dot cleanup)
    .replace(/^\.+/, '')             // leading dots (hidden files on POSIX)
    .replace(/\.+$/, '')             // trailing dots (invalid on Windows)
    .replace(/\s+$/, '');            // trailing whitespace (invalid on Windows)
  // A reserved device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9) can't be created
  // on Windows at all — with or without an extension — so append an underscore
  // rather than silently failing to write the file/folder.
  return RESERVED_DEVICE_NAME.test(cleaned) ? `${cleaned}_` : cleaned;
}

/**
 * Validate that a resolved path stays within the base directory.
 * Prevents path traversal even if sanitization is bypassed.
 */
function isWithinBase(basePath, targetPath) {
  const resolvedBase = path.resolve(basePath) + path.sep;
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase) || resolvedTarget === path.resolve(basePath);
}

/**
 * Get the configured job folders base path from settings.
 * Returns null if not configured or empty.
 */
function getBasePath() {
  try {
    const settings = db.getSettings();
    const base = settings.job_folders_base;
    if (!base || !base.trim()) return null;
    return base.trim();
  } catch (err) {
    logger.error({ err }, 'Failed to read job_folders_base setting');
    return null;
  }
}

/**
 * The configured base, but only when it can be reached right now — the one
 * entry point for every automatic folder write (customer add/rename, job
 * create/save). A base that has gone missing is logged and skipped, never
 * rebuilt: a recursive mkdir would otherwise recreate it as an empty stand-in
 * folder, after which every declared file reads as missing and uploads land in
 * the stand-in. Returns null when not configured or unreachable.
 */
function getWritableBasePath() {
  const basePath = getBasePath();
  if (!basePath) return null;
  if (!isBaseReachable(basePath)) {
    logger.warn({ basePath }, 'Job folders location unreachable; skipping automatic folder write');
    return null;
  }
  return basePath;
}

// The plain message every file route gives when the base below can't be reached.
const JOB_FOLDERS_UNREACHABLE = "The job folders location can't be reached right now. Check the drive or network connection, then try again.";

/**
 * Whether the configured job-folders base can be reached right now. Settings
 * refuses to save a base that doesn't exist, so a base that has gone missing
 * since means the drive or network share is offline — which is NOT the same as
 * "this job's folder doesn't exist yet". Callers check this once before trusting
 * any path under the base, so an offline drive is reported as offline instead of
 * reading as "no files" (and every declared drawing flagging as missing), and so
 * a write never recreates the base as an empty local folder.
 */
function isBaseReachable(basePath) {
  try {
    return fs.statSync(basePath).isDirectory();
  } catch {
    return false;
  }
}

// A company folder's owning record is identified by a short
// code embedded at the END of the folder name, in square brackets — e.g.
// "Rio Tinto Iron Ore [550e8400]". Because the code is part of the name, a
// folder can never exist "untagged": there is no separate marker file to forget
// to write, lose, or have stripped. Renaming the company just renames the
// folder; the code (and so the identity) rides along. The same bracketed-code
// scheme is used for per-part file names (see jobcard-files.js).

/**
 * Stable code derived from a permanent id, embedded in folder and file names.
 * Takes the part after the last ':' (so it works for bare company uuids and
 * "item:..." alike), keeps alphanumerics, and lowercases.
 * The FULL id is used (not a truncation) so the code is as unique as the id
 * itself — two records can never collide on it. Returns null for a missing id.
 */
function idSlug(rawId) {
  if (!rawId) return null;
  const tail = String(rawId).split(':').pop();
  const alnum = tail.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return alnum || null;
}

/**
 * Read the trailing "[code]" from a folder name, or null if absent. The LAST
 * bracketed group always wins, so a company name that itself contains "[...]"
 * is harmless — our code is appended last.
 */
function folderSlugOf(folderName) {
  const m = /\[([a-z0-9]+)\]$/i.exec(String(folderName).trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Build the on-disk folder name for a coded record: "Name [code]" — a sanitized
 * display name plus a code derived from the record's permanent id. Returns null
 * if the name sanitizes to nothing or the id has no code.
 */
function codedFolderName(name, id) {
  const sanitized = sanitizeFolderName(name);
  const slug = idSlug(id);
  return (sanitized && slug) ? `${sanitized} [${slug}]` : null;
}

/**
 * Find a coded folder under `basePath` by matching the code in the folder
 * name to `id` — independent of the (mutable) display name, so a rename never
 * strands files. Returns the absolute path, or null.
 * @param {string} kind - human-readable noun for log messages (e.g. 'company')
 */
function findCodedFolder(basePath, id, kind) {
  try {
    const slug = idSlug(id);
    if (!basePath || !slug || !fs.existsSync(basePath)) return null;

    for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (folderSlugOf(entry.name) !== slug) continue;
      const folderPath = path.join(basePath, entry.name);
      if (isWithinBase(basePath, folderPath)) return folderPath;
    }
    return null;
  } catch (err) {
    logger.error({ err, id }, `Failed to find ${kind} folder`);
    return null;
  }
}

/**
 * Resolve a coded folder, creating it if needed. Returns the absolute folder
 * path, or null if storage isn't configured or the operation fails. The code
 * in the folder name makes it unique, so there's no marker file to write and
 * no same-name disambiguation to do. Fire-and-forget: logs errors but never
 * throws.
 * @param {string} kind - human-readable noun for log messages (e.g. 'company')
 */
function ensureCodedFolder(basePath, id, name, kind) {
  try {
    // Never write under a base that can't be reached — see getWritableBasePath.
    if (!basePath || !id || !isBaseReachable(basePath)) return null;

    const existing = findCodedFolder(basePath, id, kind);
    if (existing) return existing;

    const folderName = codedFolderName(name, id);
    if (!folderName) return null;

    const target = path.join(basePath, folderName);
    if (!isWithinBase(basePath, target)) {
      logger.error({ id, target }, `${kind} folder path escapes base directory`);
      return null;
    }

    fs.mkdirSync(target, { recursive: true });
    logger.info({ folderPath: target }, `Ensured ${kind} folder`);
    return target;
  } catch (err) {
    logger.error({ err, id }, `Failed to ensure ${kind} folder`);
    return null;
  }
}

/**
 * Relabel a coded folder when its name changes: find it by code and rename it
 * to "New Name [code]". Best-effort — if the rename can't happen (e.g. the
 * folder is locked), lookups still succeed by code regardless of the on-disk
 * name. Fire-and-forget: never throws.
 * @param {string} kind - human-readable noun for log messages (e.g. 'company')
 */
function renameCodedFolder(basePath, id, newName, kind) {
  try {
    if (!basePath || !id || !isBaseReachable(basePath)) return;

    const desired = codedFolderName(newName, id);
    if (!desired) return;

    const current = findCodedFolder(basePath, id, kind);
    if (!current) {
      // Nothing on disk yet → just make the new folder.
      ensureCodedFolder(basePath, id, newName, kind);
      return;
    }

    const target = path.join(basePath, desired);
    if (!isWithinBase(basePath, target)) return;
    if (path.resolve(current) === path.resolve(target)) return; // already correct

    // A capitals-only rename ("acme [code]" → "Acme [code]"): on Windows, where
    // names ignore capitals, the disk reports the target as existing because it IS
    // this folder. That is not another folder, so go ahead — Windows renames a
    // folder to a capitals-only variant of its own name without complaint.
    const capitalsOnly = path.resolve(current).toLowerCase() === path.resolve(target).toLowerCase();
    if (!capitalsOnly && fs.existsSync(target)) {
      // Can't happen with a unique code, but never clobber another folder if it does.
      logger.warn({ id, target }, `${kind} rename target exists; keeping current folder`);
      return;
    }

    fs.renameSync(current, target);
    logger.info({ from: current, to: target }, `Renamed ${kind} folder`);
  } catch (err) {
    logger.error({ err, id }, `Failed to rename ${kind} folder`);
  }
}

/**
 * Find a customer's company folder under the base by matching the code in the
 * folder name to the company's id — independent of the (mutable) company name,
 * so a rename never strands files. Returns the absolute path, or null.
 */
function findCompanyFolder(basePath, companyId) {
  return findCodedFolder(basePath, companyId, 'company');
}

/**
 * Resolve (read-only, never creates) where a customer's company folder lives.
 * With a company id: take the computed "Name [code]" path when it already
 * exists, else match by code, else return that computed path (which may not
 * exist yet). With no company id (a job whose customer was unlinked): fall back
 * to the plain name-built path. Used by read/delete callers.
 */
function resolveCompanyFolder(basePath, companyId, companyName) {
  try {
    if (!basePath) return null;

    if (companyId) {
      // Fast path: the folder is normally named exactly "Name [code]" (a rename
      // renames the folder), so try that path directly before listing the whole
      // base. Matters when a caller resolves many jobs in a row — a batch would
      // otherwise re-list every company folder once per job, which is the
      // expensive part on a network drive. The code is still what identifies the
      // folder; this only skips the search when the name also lines up.
      const name = codedFolderName(companyName, companyId);
      const target = name ? path.join(basePath, name) : null;
      if (target && isWithinBase(basePath, target) && fs.existsSync(target)) return target;

      // Otherwise fall back to matching by code, so a folder whose name drifted
      // from the customer's (a rename that didn't reach disk) is still found.
      const bySlug = findCompanyFolder(basePath, companyId);
      if (bySlug) return bySlug;

      return target && isWithinBase(basePath, target) ? target : null;
    }

    return companyPathByName(basePath, companyName);
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to resolve company folder');
    return null;
  }
}

/**
 * Resolve a customer's company folder, creating it if needed. Returns the
 * absolute folder path, or null if storage isn't configured or the operation
 * fails. The code in the folder name makes it unique, so there's no marker file
 * to write and no same-name disambiguation to do. Fire-and-forget: logs errors
 * but never throws.
 */
function ensureCompanyFolder(companyId, companyName) {
  const basePath = getWritableBasePath();
  return ensureCodedFolder(basePath, companyId, companyName, 'company');
}

/**
 * Relabel a customer's company folder when their company name changes: find the
 * folder by its code and rename it to "New Name [code]". Best-effort — if the
 * rename can't happen (e.g. the folder is locked), lookups still succeed by code
 * regardless of the on-disk name. Fire-and-forget: never throws.
 */
function renameCompanyFolder(companyId, oldName, newName) {
  const basePath = getWritableBasePath();
  renameCodedFolder(basePath, companyId, newName, 'company');
}

// Same on-disk folder names as CATEGORY_FOLDER's values, in the same order —
// read from the one shared list so the two can't drift apart.
const FILE_CATEGORY_FOLDERS = Object.values(CATEGORY_FOLDER);

/**
 * Resolve the name-built company path as a fallback for jobs with no linked
 * company (e.g. the customer was unlinked) — there's no permanent id to
 * key on, so the company name is all we have.
 */
function companyPathByName(basePath, companyName) {
  const sanitized = sanitizeFolderName(companyName);
  if (!sanitized) return null;
  const folderPath = path.join(basePath, sanitized);
  return isWithinBase(basePath, folderPath) ? folderPath : null;
}

/**
 * Create job card subfolders (Job Files/, Customer Property/) under
 * the customer's company folder, located by the permanent company id (created
 * if needed) so it survives company-name changes. Jobs with no company fall
 * back to the name-built company folder.
 * Fire-and-forget: logs errors but never throws.
 */
function createJobCardFolders(companyId, companyName, jobNumber) {
  try {
    const basePath = getWritableBasePath();
    if (!basePath) return;

    const companyFolder = companyId
      ? ensureCompanyFolder(companyId, companyName)
      : companyPathByName(basePath, companyName);
    if (!companyFolder) return;

    const sanitizedJob = sanitizeFolderName(jobNumber);
    if (!sanitizedJob) return;

    const jobPath = path.join(companyFolder, sanitizedJob);
    if (!isWithinBase(basePath, jobPath)) {
      logger.error({ companyId, jobNumber, jobPath }, 'Job card folder path escapes base directory');
      return;
    }

    for (const category of FILE_CATEGORY_FOLDERS) {
      fs.mkdirSync(path.join(jobPath, category), { recursive: true });
    }
    logger.info({ jobPath }, 'Created job card folders');
  } catch (err) {
    logger.error({ err, companyId, jobNumber }, 'Failed to create job card folders');
  }
}

/**
 * Delete job card folder (Company/JobNumber/) when a job card is deleted.
 * The company folder is located by the permanent company id (read-only, never
 * created) so a renamed customer still has the right folder targeted; only the
 * job card subfolder is removed, not the parent company folder.
 * Fire-and-forget: logs errors but never throws.
 */
function deleteJobCardFolders(companyId, companyName, jobNumber) {
  try {
    const basePath = getBasePath();
    if (!basePath) return;

    const companyFolder = (companyId && resolveCompanyFolder(basePath, companyId, companyName))
      || companyPathByName(basePath, companyName);
    if (!companyFolder) return;

    const sanitizedJob = sanitizeFolderName(jobNumber);
    if (!sanitizedJob) return;

    const jobPath = path.join(companyFolder, sanitizedJob);
    if (!isWithinBase(basePath, jobPath)) {
      logger.error({ companyId, jobNumber, jobPath }, 'Job card folder path escapes base directory');
      return;
    }

    if (fs.existsSync(jobPath)) {
      fs.rmSync(jobPath, { recursive: true, force: true });
      logger.info({ jobPath }, 'Deleted job card folder');
    }
  } catch (err) {
    logger.error({ err, companyId, jobNumber }, 'Failed to delete job card folder');
  }
}

module.exports = {
  sanitizeFolderName,
  isWithinBase,
  isBaseReachable,
  JOB_FOLDERS_UNREACHABLE,
  idSlug,
  folderSlugOf,
  resolveCompanyFolder,
  ensureCompanyFolder,
  renameCompanyFolder,
  createJobCardFolders,
  deleteJobCardFolders,
  FILE_CATEGORY_FOLDERS
};
