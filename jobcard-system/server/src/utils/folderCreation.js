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

/**
 * Create job card subfolders (Job Files/, QA Forms/, Customer Property/) under the company folder.
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

    fs.mkdirSync(path.join(jobPath, 'Job Files'), { recursive: true });
    fs.mkdirSync(path.join(jobPath, 'QA Forms'), { recursive: true });
    fs.mkdirSync(path.join(jobPath, 'Customer Property'), { recursive: true });
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
  deleteJobCardFolders
};
