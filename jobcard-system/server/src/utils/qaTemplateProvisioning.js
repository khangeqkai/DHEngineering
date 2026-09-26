const fs = require('fs');
const path = require('path');

const logger = require('./logger');
const { sanitizeFolderName, isWithinBase, findQaLevelFolder, ensureCompanyFolder, resolveCompanyFolder } = require('./folderCreation');
const { fillPdfTemplate } = require('./pdfFiller');
const { qaLevelQueries, qaLevelTemplateQueries, getSettings } = require('../db/database');

// Copying a QA level's templates onto a job's disk folder, and the pre-save check
// that confirms those templates are actually there before the job is written.
// Extracted out of jobcard-helpers.js (a straight lift, no behaviour change)
// because that file was getting long — this module only owns the
// disk/PDF side of QA provisioning; jobcard-helpers.js still owns everything
// about shaping a job card's own data.

/**
 * Copy a QA level's template PDFs into the job's QA Forms folder, filling
 * in fillable fields from job data. Templates without fillable fields are
 * copied as-is.
 * @param {string} jobcardId
 * @param {string} qaLevelId
 * @param {Object} jobData - Full job data for PDF pre-fill
 */
async function copyQaTemplatesForJob(jobcardId, qaLevelId, jobData) {
  const level = qaLevelQueries.getById.get(qaLevelId);
  if (!level) {
    return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'QA level not found' };
  }

  const templates = qaLevelTemplateQueries.getByLevel.all(qaLevelId);
  if (templates.length === 0) {
    return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'No templates configured for QA level' };
  }

  return await copyTemplatesToJobFolder(jobcardId, level, templates, jobData);
}

/**
 * Copy template PDFs from QA Level folder to job's QA Forms folder.
 * Awaits PDF fill so files exist on disk before the API response is sent.
 */
async function copyTemplatesToJobFolder(jobcardId, level, templates, jobData) {
  const totalTemplates = templates.length;
  try {
    const settings = getSettings();
    const basePath = settings.job_folders_base;
    if (!basePath || !basePath.trim()) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'No job folders base configured' };
    }

    const base = basePath.trim();
    // Locate the customer's company folder by permanent company id (created if
    // needed) so QA forms land in the same folder the job's files resolve to —
    // even after a company-name change. Jobs with no company fall back to the
    // name-built folder.
    const companyId = jobData.companyId || null;
    const companyFolder = companyId
      ? ensureCompanyFolder(companyId, jobData.companyName)
      : resolveCompanyFolder(base, null, jobData.companyName);
    const sanitizedJob = sanitizeFolderName(jobData.jobNumber);
    if (!companyFolder || !sanitizedJob) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'Invalid company or job folder name' };
    }

    const qaFormsFolder = path.join(companyFolder, sanitizedJob, 'QA Forms');
    if (!isWithinBase(base, qaFormsFolder)) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'QA Forms folder path outside base' };
    }

    // Locate the level's template folder by the code in its name, not the name
    // itself, so a renamed level still resolves to the right folder.
    const qaLevelsBase = path.join(basePath.trim(), 'QA Levels');
    const levelFolder = findQaLevelFolder(qaLevelsBase, level.id);

    if (!levelFolder) {
      return { totalTemplates: 0, succeeded: 0, failed: [], skipped: true, skipReason: 'QA level folder not found' };
    }

    fs.mkdirSync(qaFormsFolder, { recursive: true });

    const fillData = {
      ...jobData,
      // Quality forms are files on disk that any worker can open, so the
      // customer is never printed on them — neither the company (only needed
      // above to find or create the customer's folder) nor the contact person.
      companyName: null,
      contactName: null,
      date: new Date().toLocaleDateString('en-AU'),
      qualityLevel: jobData.qualityLevel || level.name,
      items: jobData.items || []
    };

    const failed = [];
    let succeeded = 0;
    const copyPromises = [];
    for (const tmpl of templates) {
      const srcPath = path.join(levelFolder, tmpl.file_name);
      const destPath = path.join(qaFormsFolder, tmpl.file_name);

      if (!fs.existsSync(srcPath)) {
        failed.push({ fileName: tmpl.file_name, reason: 'Source template file not found' });
        continue;
      }
      if (!isWithinBase(levelFolder, srcPath) || !isWithinBase(qaFormsFolder, destPath)) {
        failed.push({ fileName: tmpl.file_name, reason: 'Path outside permitted base' });
        continue;
      }

      const sourceBuffer = fs.readFileSync(srcPath);
      copyPromises.push(
        fillPdfTemplate(sourceBuffer, fillData)
          .then(filledBuffer => {
            fs.writeFileSync(destPath, filledBuffer);
            logger.info({ destPath }, 'Copied QA template to job folder');
            succeeded += 1;
          })
          .catch(err => {
            try {
              fs.copyFileSync(srcPath, destPath);
              succeeded += 1;
            } catch (copyErr) {
              logger.error({ err: copyErr, srcPath, destPath }, 'Failed to copy QA template');
              failed.push({ fileName: tmpl.file_name, reason: copyErr.message || String(copyErr) });
            }
          })
      );
    }

    await Promise.all(copyPromises);

    return { totalTemplates, succeeded, failed, skipped: false };
  } catch (err) {
    logger.error({ err }, 'Failed to copy templates to job folder');
    return {
      totalTemplates,
      succeeded: 0,
      failed: [{ fileName: '*', reason: err.message || String(err) }],
      skipped: false
    };
  }
}

/**
 * Pre-save check: confirm a QA level's template files are present and readable
 * BEFORE the job is written, so a job can never be saved believing it has
 * inspection forms that were never created. Mirrors the source-side checks in
 * copyTemplatesToJobFolder (level folder found, each source file exists + is
 * within base) — these are the only failures that are predictable before the
 * copy runs.
 *
 * Returns { ok: true } when there is nothing that could fail, including the
 * cases where the copy would be legitimately skipped (no storage configured, or
 * the level has no templates). Returns { ok: false, reason } with a plain
 * message when a form file is missing. Rare runtime errors (full disk, locked
 * file) can't be foreseen here; the post-save warning still covers those.
 */
function verifyQaTemplatesAvailable(qaLevelId) {
  if (!qaLevelId) return { ok: true };

  const level = qaLevelQueries.getById.get(qaLevelId);
  if (!level) return { ok: false, reason: 'The selected quality level no longer exists.' };

  const templates = qaLevelTemplateQueries.getByLevel.all(qaLevelId);
  if (templates.length === 0) return { ok: true };

  const settings = getSettings();
  const basePath = settings.job_folders_base;
  if (!basePath || !basePath.trim()) return { ok: true };

  const qaLevelsBase = path.join(basePath.trim(), 'QA Levels');
  const levelFolder = findQaLevelFolder(qaLevelsBase, level.id);
  if (!levelFolder) {
    return {
      ok: false,
      reason: `Quality level "${level.name}" has forms listed but its folder is missing. Re-upload its forms under Quality Levels, then try again.`
    };
  }

  const missing = [];
  for (const tmpl of templates) {
    const srcPath = path.join(levelFolder, tmpl.file_name);
    if (!isWithinBase(levelFolder, srcPath) || !fs.existsSync(srcPath)) {
      missing.push(tmpl.file_name);
    }
  }
  if (missing.length > 0) {
    const plural = missing.length > 1;
    return {
      ok: false,
      reason: `Quality level "${level.name}" is missing ${missing.length} form file${plural ? 's' : ''} (${missing.join(', ')}). Re-upload ${plural ? 'them' : 'it'} under Quality Levels, then try again.`
    };
  }

  return { ok: true };
}

module.exports = { copyQaTemplatesForJob, verifyQaTemplatesAvailable };
