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

/**
 * Create a company folder under the configured base path.
 * Fire-and-forget: logs errors but never throws.
 */
function createCompanyFolder(companyName) {
  try {
    const basePath = getBasePath();
    if (!basePath) return;

    const sanitized = sanitizeFolderName(companyName);
    if (!sanitized) return;

    const folderPath = path.join(basePath, sanitized);
    if (!isWithinBase(basePath, folderPath)) {
      logger.error({ companyName, folderPath }, 'Company folder path escapes base directory');
      return;
    }

    fs.mkdirSync(folderPath, { recursive: true });
    logger.info({ folderPath }, 'Created company folder');
  } catch (err) {
    logger.error({ err, companyName }, 'Failed to create company folder');
  }
}

const FILE_CATEGORY_FOLDERS = ['Job Files', 'QA Forms', 'Customer Property'];

// Hidden marker file placed inside each QA level folder, holding the level's
// permanent id. Folder lookups match by this marker, never by the (mutable)
// level name — so renaming a level can never strand its template PDFs.
const QA_LEVEL_MARKER = '.levelid';

/**
 * Read the level id stamped inside a folder's marker file.
 * Returns the trimmed id, or null if the marker is absent/unreadable.
 */
function readQaLevelMarker(folderPath) {
  try {
    const markerPath = path.join(folderPath, QA_LEVEL_MARKER);
    if (!fs.existsSync(markerPath)) return null;
    return fs.readFileSync(markerPath, 'utf8').trim() || null;
  } catch (err) {
    return null;
  }
}

/**
 * Find a QA level's folder under the "QA Levels" base by reading each
 * subfolder's marker file and matching the permanent level id — independent
 * of the folder's display name. Returns the absolute path, or null if no
 * folder carries this level's marker (or the base is missing/unreadable).
 * @param {string} qaLevelsBase - the ".../QA Levels" directory
 * @param {string} levelId
 */
function findQaLevelFolder(qaLevelsBase, levelId) {
  try {
    if (!qaLevelsBase || !levelId || !fs.existsSync(qaLevelsBase)) return null;

    for (const entry of fs.readdirSync(qaLevelsBase, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(qaLevelsBase, entry.name);
      if (!isWithinBase(qaLevelsBase, folderPath)) continue;
      if (readQaLevelMarker(folderPath) === levelId) return folderPath;
    }
    return null;
  } catch (err) {
    logger.error({ err, levelId }, 'Failed to find QA level folder');
    return null;
  }
}

/**
 * Resolve a QA level's folder, creating it (with its marker) if needed.
 * Returns the absolute folder path, or null if storage isn't configured or
 * the operation fails. Fire-and-forget: logs errors but never throws.
 *
 * A folder is only reused if its marker is absent or already this level's id.
 * If a folder with the same sanitized name exists but is owned by a DIFFERENT
 * level (two display names can sanitize to the same folder), a disambiguated
 * folder name is used instead so the levels never share a folder.
 * @param {string} qaLevelsBase - the ".../QA Levels" directory
 * @param {string} levelId
 * @param {string} levelName
 */
function ensureQaLevelFolder(qaLevelsBase, levelId, levelName) {
  try {
    if (!qaLevelsBase || !levelId) return null;

    const existing = findQaLevelFolder(qaLevelsBase, levelId);
    if (existing) return existing;

    const sanitized = sanitizeFolderName(levelName);
    if (!sanitized) return null;

    let target = path.join(qaLevelsBase, sanitized);
    if (!isWithinBase(qaLevelsBase, target)) {
      logger.error({ levelId, target }, 'QA level folder path escapes base directory');
      return null;
    }

    // A same-name folder owned by another level → use a disambiguated name.
    if (fs.existsSync(target)) {
      const owner = readQaLevelMarker(target);
      if (owner && owner !== levelId) {
        const suffix = levelId.replace(/[^a-z0-9]/gi, '').slice(-6);
        target = path.join(qaLevelsBase, `${sanitized} ${suffix}`);
        if (!isWithinBase(qaLevelsBase, target)) return null;
      }
    }

    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, QA_LEVEL_MARKER), `${levelId}\n`);
    logger.info({ folderPath: target }, 'Ensured QA level folder');
    return target;
  } catch (err) {
    logger.error({ err, levelId }, 'Failed to ensure QA level folder');
    return null;
  }
}

/**
 * Create job card subfolders (Job Files/, QA Forms/, Customer Property/) under the company folder.
 * Files live directly on disk inside each category folder.
 * Fire-and-forget: logs errors but never throws.
 */
function createJobCardFolders(companyName, jobNumber) {
  try {
    const basePath = getBasePath();
    if (!basePath) return;

    const sanitizedCompany = sanitizeFolderName(companyName);
    if (!sanitizedCompany) return;

    const sanitizedJob = sanitizeFolderName(jobNumber);
    if (!sanitizedJob) return;

    const jobPath = path.join(basePath, sanitizedCompany, sanitizedJob);
    if (!isWithinBase(basePath, jobPath)) {
      logger.error({ companyName, jobNumber, jobPath }, 'Job card folder path escapes base directory');
      return;
    }

    for (const category of FILE_CATEGORY_FOLDERS) {
      fs.mkdirSync(path.join(jobPath, category), { recursive: true });
    }
    logger.info({ jobPath }, 'Created job card folders');
  } catch (err) {
    logger.error({ err, companyName, jobNumber }, 'Failed to create job card folders');
  }
}

/**
 * Delete job card folder (Company/JobNumber/) when a job card is deleted.
 * Only deletes the job card subfolder, not the parent company folder.
 * Fire-and-forget: logs errors but never throws.
 */
function deleteJobCardFolders(companyName, jobNumber) {
  try {
    const basePath = getBasePath();
    if (!basePath) return;

    const sanitizedCompany = sanitizeFolderName(companyName);
    if (!sanitizedCompany) return;

    const sanitizedJob = sanitizeFolderName(jobNumber);
    if (!sanitizedJob) return;

    const jobPath = path.join(basePath, sanitizedCompany, sanitizedJob);
    if (!isWithinBase(basePath, jobPath)) {
      logger.error({ companyName, jobNumber, jobPath }, 'Job card folder path escapes base directory');
      return;
    }

    if (fs.existsSync(jobPath)) {
      fs.rmSync(jobPath, { recursive: true, force: true });
      logger.info({ jobPath }, 'Deleted job card folder');
    }
  } catch (err) {
    logger.error({ err, companyName, jobNumber }, 'Failed to delete job card folder');
  }
}

module.exports = {
  sanitizeFolderName,
  isWithinBase,
  createCompanyFolder,
  createJobCardFolders,
  deleteJobCardFolders,
  findQaLevelFolder,
  ensureQaLevelFolder,
  QA_LEVEL_MARKER,
  FILE_CATEGORY_FOLDERS
};
