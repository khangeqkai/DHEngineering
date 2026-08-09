const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const db = require('../db/database');

/**
 * Sanitize a string for use as a folder name.
 * Removes filesystem-unsafe characters, path traversal sequences, and control characters.
 * Works safely across Windows, macOS, and Linux.
 */
function sanitizeFolderName(name) {
  if (!name) return '';
  return name
    .replace(/[<>:"/\\|?*]/g, '_')   // filesystem-unsafe chars (Windows + POSIX)
    .replace(/[\x00-\x1f\x7f]/g, '') // control characters
    .trim()
    .replace(/\.\./g, '_')           // path traversal (after trim, before dot cleanup)
    .replace(/^\.+/, '')             // leading dots (hidden files on POSIX)
    .replace(/\.+$/, '')             // trailing dots (invalid on Windows)
    .replace(/\s+$/, '');            // trailing whitespace (invalid on Windows)
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

// A folder's owning record (a company, or a QA level) is identified by a short
// code embedded at the END of the folder name, in square brackets — e.g.
// "Rio Tinto Iron Ore [550e8400]". Because the code is part of the name, a
// folder can never exist "untagged": there is no separate marker file to forget
// to write, lose, or have stripped. Renaming the company just renames the
// folder; the code (and so the identity) rides along. The same bracketed-code
// scheme is used for per-part file names (see jobcard-files.js).

/**
 * Stable code derived from a permanent id, embedded in folder and file names.
 * Takes the part after the last ':' (so it works for bare company uuids,
 * "item:..." and "qa-level:..." alike), keeps alphanumerics, and lowercases.
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
 * Build the on-disk folder name for a customer: "Company Name [code]".
 * Returns null if the name sanitizes to nothing or the id has no code.
 */
function companyFolderName(companyName, companyId) {
  const sanitized = sanitizeFolderName(companyName);
  const slug = idSlug(companyId);
  return (sanitized && slug) ? `${sanitized} [${slug}]` : null;
}

/**
 * Find a customer's company folder under the base by matching the code in the
 * folder name to the company's id — independent of the (mutable) company name,
 * so a rename never strands files. Returns the absolute path, or null.
 */
function findCompanyFolder(basePath, companyId) {
  try {
    const slug = idSlug(companyId);
    if (!basePath || !slug || !fs.existsSync(basePath)) return null;

    for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (folderSlugOf(entry.name) !== slug) continue;
      const folderPath = path.join(basePath, entry.name);
      if (isWithinBase(basePath, folderPath)) return folderPath;
    }
    return null;
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to find company folder');
    return null;
  }
}

/**
 * Resolve (read-only, never creates) where a customer's company folder lives.
 * With a company id: take the computed "Name [code]" path when it already
 * exists, else match by code, else return that computed path (which may not
 * exist yet). With no company id (a job whose customer was unlinked): fall back
 * to the plain name-built path. Used by read/delete/QA-copy callers.
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
      const name = companyFolderName(companyName, companyId);
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
  try {
    const basePath = getBasePath();
    if (!basePath || !companyId) return null;

    const existing = findCompanyFolder(basePath, companyId);
    if (existing) return existing;

    const name = companyFolderName(companyName, companyId);
    if (!name) return null;

    const target = path.join(basePath, name);
    if (!isWithinBase(basePath, target)) {
      logger.error({ companyId, target }, 'Company folder path escapes base directory');
      return null;
    }

    fs.mkdirSync(target, { recursive: true });
    logger.info({ folderPath: target }, 'Ensured company folder');
    return target;
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to ensure company folder');
    return null;
  }
}

/**
 * Relabel a customer's company folder when their company name changes: find the
 * folder by its code and rename it to "New Name [code]". Best-effort — if the
 * rename can't happen (e.g. the folder is locked), lookups still succeed by code
 * regardless of the on-disk name. Fire-and-forget: never throws.
 */
function renameCompanyFolder(companyId, oldName, newName) {
  try {
    const basePath = getBasePath();
    if (!basePath || !companyId) return;

    const desired = companyFolderName(newName, companyId);
    if (!desired) return;

    const current = findCompanyFolder(basePath, companyId);
    if (!current) {
      // Nothing on disk yet → just make the new folder.
      ensureCompanyFolder(companyId, newName);
      return;
    }

    const target = path.join(basePath, desired);
    if (!isWithinBase(basePath, target)) return;
    if (path.resolve(current) === path.resolve(target)) return; // already correct

    if (fs.existsSync(target)) {
      // Can't happen with a unique code, but never clobber another folder if it does.
      logger.warn({ companyId, target }, 'Company rename target exists; keeping current folder');
      return;
    }

    fs.renameSync(current, target);
    logger.info({ from: current, to: target }, 'Renamed company folder');
  } catch (err) {
    logger.error({ err, companyId }, 'Failed to rename company folder');
  }
}

const FILE_CATEGORY_FOLDERS = ['Job Files', 'QA Forms', 'Customer Property'];

/**
 * Build the on-disk folder name for a QA level: "Level Name [code]".
 */
function qaLevelFolderName(levelName, levelId) {
  const sanitized = sanitizeFolderName(levelName);
  const slug = idSlug(levelId);
  return (sanitized && slug) ? `${sanitized} [${slug}]` : null;
}

/**
 * Find a QA level's folder under the "QA Levels" base by matching the code in
 * the folder name to the level's id — independent of the display name, so
 * renaming a level never strands its template PDFs. Returns the absolute path,
 * or null.
 * @param {string} qaLevelsBase - the ".../QA Levels" directory
 * @param {string} levelId
 */
function findQaLevelFolder(qaLevelsBase, levelId) {
  try {
    const slug = idSlug(levelId);
    if (!qaLevelsBase || !slug || !fs.existsSync(qaLevelsBase)) return null;

    for (const entry of fs.readdirSync(qaLevelsBase, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (folderSlugOf(entry.name) !== slug) continue;
      const folderPath = path.join(qaLevelsBase, entry.name);
      if (isWithinBase(qaLevelsBase, folderPath)) return folderPath;
    }
    return null;
  } catch (err) {
    logger.error({ err, levelId }, 'Failed to find QA level folder');
    return null;
  }
}

/**
 * Resolve a QA level's folder, creating it if needed. Returns the absolute
 * folder path, or null if storage isn't configured or the operation fails. The
 * code in the folder name makes it unique — no marker file, no disambiguation.
 * Fire-and-forget: logs errors but never throws.
 * @param {string} qaLevelsBase - the ".../QA Levels" directory
 * @param {string} levelId
 * @param {string} levelName
 */
function ensureQaLevelFolder(qaLevelsBase, levelId, levelName) {
  try {
    if (!qaLevelsBase || !levelId) return null;

    const existing = findQaLevelFolder(qaLevelsBase, levelId);
    if (existing) return existing;

    const name = qaLevelFolderName(levelName, levelId);
    if (!name) return null;

    const target = path.join(qaLevelsBase, name);
    if (!isWithinBase(qaLevelsBase, target)) {
      logger.error({ levelId, target }, 'QA level folder path escapes base directory');
      return null;
    }

    fs.mkdirSync(target, { recursive: true });
    logger.info({ folderPath: target }, 'Ensured QA level folder');
    return target;
  } catch (err) {
    logger.error({ err, levelId }, 'Failed to ensure QA level folder');
    return null;
  }
}

/**
 * Relabel a QA level's folder when its name changes: find by code and rename to
 * "New Name [code]". Best-effort — lookups still succeed by code regardless of
 * the on-disk name. Fire-and-forget: never throws.
 * @param {string} qaLevelsBase - the ".../QA Levels" directory
 * @param {string} levelId
 * @param {string} newName
 */
function renameQaLevelFolder(qaLevelsBase, levelId, newName) {
  try {
    const desired = qaLevelFolderName(newName, levelId);
    if (!qaLevelsBase || !desired) return;

    const current = findQaLevelFolder(qaLevelsBase, levelId);
    if (!current) {
      ensureQaLevelFolder(qaLevelsBase, levelId, newName);
      return;
    }

    const target = path.join(qaLevelsBase, desired);
    if (!isWithinBase(qaLevelsBase, target)) return;
    if (path.resolve(current) === path.resolve(target)) return;

    if (fs.existsSync(target)) {
      logger.warn({ levelId, target }, 'QA level rename target exists; keeping current folder');
      return;
    }

    fs.renameSync(current, target);
    logger.info({ from: current, to: target }, 'Renamed QA level folder');
  } catch (err) {
    logger.error({ err, levelId }, 'Failed to rename QA level folder');
  }
}

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
 * Create job card subfolders (Job Files/, QA Forms/, Customer Property/) under
 * the customer's company folder, located by the permanent company id (created
 * if needed) so it survives company-name changes. Jobs with no company fall
 * back to the name-built company folder.
 * Fire-and-forget: logs errors but never throws.
 */
function createJobCardFolders(companyId, companyName, jobNumber) {
  try {
    const basePath = getBasePath();
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
  idSlug,
  resolveCompanyFolder,
  ensureCompanyFolder,
  renameCompanyFolder,
  createJobCardFolders,
  deleteJobCardFolders,
  findQaLevelFolder,
  ensureQaLevelFolder,
  renameQaLevelFolder,
  FILE_CATEGORY_FOLDERS
};
