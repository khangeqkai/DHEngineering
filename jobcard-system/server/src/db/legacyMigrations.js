const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const {
  db,
  settingsQueries,
  recordHistory
} = require('./database');
const { computeLiveCosting, persistCosting } = require('../utils/costingCompute');
const { DEFAULT_VIC_PUBLIC_HOLIDAYS_2026 } = require('../utils/defaultHolidays');
const { scheduleToWholeHours } = require('../shared/overtimeSchedule');
const { readOvertimeSettings } = require('../utils/overtimeSettings');
const { isCalendarDate } = require('../shared/calendarDate');
const { officeDateString } = require('../utils/officeTime');
const { isBaseReachable, isWithinBase, idSlug, folderSlugOf, sanitizeFolderName } = require('../utils/folderCreation');

// One-time conversions for databases (and restored backups) that predate a rule the
// rest of the app now assumes. Every conversion here fixes a shape only an old
// database or an old backup can still hold — the current code paths can no longer
// produce it — so this file exists purely to keep those still working, not because
// any of it is live behaviour a fresh install needs.

// Good pieces on a work block are stored as whole numbers (see wholeQty in
// timeEntryHelpers). Fold anything saved before that rule into the same shape wholeQty
// would store today: text with no leading number ("abc", "") → NULL (nothing recorded),
// "2.5" → "2", "-2" → "0". Idempotent: a whole number already round-trips unchanged
// and is skipped by the WHERE, and a NULL is never touched. Runs on every boot and
// at the end of a backup restore, so a pre-rule backup can't bring half-pieces back.
function foldGoodPiecesToWhole() {
  const qtyBlank = db.prepare(`
    UPDATE time_entries SET qty = NULL
    WHERE qty IS NOT NULL AND TRIM(qty) NOT GLOB '[-+0-9]*'
  `).run();
  const qtyFix = db.prepare(`
    UPDATE time_entries SET qty = CAST(MAX(0, CAST(qty AS INTEGER)) AS TEXT)
    WHERE qty IS NOT NULL AND qty != CAST(MAX(0, CAST(qty AS INTEGER)) AS TEXT)
  `).run();
  if (qtyBlank.changes + qtyFix.changes > 0) logger.info({ blanked: qtyBlank.changes, rounded: qtyFix.changes }, 'Migration: Folded good-piece counts to whole numbers');
}

// The print-flavoured trail entries were renamed when building a packet stopped counting
// as printing it. Before that, `jobCardPrinted` was written by the on-screen *preview* and
// `jobCardPacketPrinted` by merely *building* a bundle — neither meant paper. Those names
// now mean a real print, so entries recorded under the old meaning have to be renamed for
// what they actually were, or the trail shows old previews and builds as genuine prints
// with no way to tell them apart.
//
// Bounded by a cutover moment, NOT guarded by a done-once flag. A flag can go missing — a
// pass that failed, or a restore that wipes settings — and an unbounded second pass then
// relabels genuine prints as previews: the audit record is destroyed while the job keeps
// its print tick, so the tick and the trail disagree. Bounded, the pass is idempotent by
// construction and safe to run on every boot and at the end of a restore.
const PRINT_NAMING_CUTOVER_KEY = 'print_naming_cutover_at';

// The moment this install first ran the code that writes the new names — the boundary
// between "old name, wrong meaning" and "new name, real print". Stored on first use,
// never recomputed, and a restore keeps the earlier of ours and the backup's, so the
// marker travels with the data instead of belonging to the machine.
//
// A missing marker cannot be reconstructed from the trail: the rename stamps new names
// onto old rows while keeping their original dates, so the earliest new-name entry is
// the oldest legacy preview, not the cutover. Dating the cutover from that would push it
// back far enough to rename nothing — or, guessed the other way, rename genuine prints.
// So a trail that already carries a live-written new name is left alone (null = rename
// nothing) and the gap is logged. With no such entry there is nothing to lose: this is a
// first run here, or a restored pre-change backup, and now is the true boundary.
function printNamingCutover() {
  const stored = settingsQueries.getByKey.get(PRINT_NAMING_CUTOVER_KEY);
  if (stored && stored.value) return stored.value;
  // `jobCardPreviewed` only: `packetBuilt` is written by the rename alone, so its
  // presence proves nothing about whether the new code ever ran here.
  const newNameWritten = db.prepare(`
    SELECT 1 FROM history
     WHERE entity_type = 'jobcard' AND changes LIKE '%"jobCardPreviewed":%'
     LIMIT 1
  `).get();
  if (newNameWritten) {
    logger.warn('Print-naming cutover marker is missing but the trail already carries new names — leaving the print trail untouched rather than renaming genuine prints');
    return null;
  }
  const cutover = new Date().toISOString();
  settingsQueries.upsert.run(PRINT_NAMING_CUTOVER_KEY, cutover);
  return cutover;
}

// Rename only the print-flavoured trail entries recorded before the cutover. Runs on every
// boot and at the end of a backup restore, so a pre-change backup can't bring the old
// meaning back and sit there until someone restarts.
function renameLegacyPrintTrail() {
  // One transaction so the two renames land together (nested harmlessly under the
  // restore's own transaction, which better-sqlite3 runs as a savepoint).
  const rename = db.transaction(() => {
    const cutover = printNamingCutover();
    // No cutover means we can't tell old entries from new ones; renaming blind would
    // cost the audit record, so nothing is touched.
    if (!cutover) return { cutover: null, previews: 0, builds: 0 };
    // Keys are matched with their leading quote, so "jobCardPacketPrinted" can never be hit
    // by the "jobCardPrinted" pass. An undated row is left alone: mislabelling one costs a
    // word, renaming a genuine print costs the audit record.
    const previews = db.prepare(`
      UPDATE history
         SET changes = REPLACE(changes, '"jobCardPrinted":', '"jobCardPreviewed":')
       WHERE entity_type = 'jobcard' AND created_at < ? AND changes LIKE '%"jobCardPrinted":%'
    `).run(cutover);
    const builds = db.prepare(`
      UPDATE history
         SET changes = REPLACE(changes, '"jobCardPacketPrinted":', '"packetBuilt":')
       WHERE entity_type = 'jobcard' AND created_at < ? AND changes LIKE '%"jobCardPacketPrinted":%'
    `).run(cutover);
    return { cutover, previews: previews.changes, builds: builds.changes };
  });
  const renamed = rename();
  if (renamed.previews + renamed.builds > 0) {
    logger.info(renamed, 'Migration: Renamed pre-cutover print trail entries to preview/build');
  }
}

// Quality-form templates were removed, and with them each job's "QA Forms" folder. Old
// jobs can still have one on disk, holding forms people scanned back in — those are a
// person's files and must never be lost, so every file in a job's QA Forms folder is
// MOVED into that job's Job Files folder (where the Files panel still shows it), and the
// QA Forms folder is removed only once it is empty.
//
// Guarded by a settings flag, but the flag is written only after a full pass that moved
// everything: a job-folders location that isn't set or can't be reached right now (an
// offline drive or share) does nothing and is retried next boot, and a file that couldn't
// be moved (open on another computer, say) is left where it is, logged, and retried next
// boot. A backup restore clears the flag before it runs this same pass (backup-helpers.js),
// because an old backup can bring QA Forms folders back.
//
// The old [base]/QA Levels/ folder (the templates an admin uploaded) is deliberately left
// alone — it is simply no longer used.
const QA_FORMS_MOVED_KEY = 'qa_forms_moved_to_job_files_at';
const OLD_QA_FOLDER = 'QA Forms';
const JOB_FILES_FOLDER = 'Job Files';
// A part's own tag at the end of a stored name ("name [p{32 hex}]", optionally " (n)").
// A quality form was never a part's drawing or customer property, so a moved form must
// not carry one into Job Files — there it would count as that part's drawing and hide a
// genuinely missing one. The tag is dropped, which makes the file a whole-job file.
const PART_TAG = / \[p[0-9a-f]{32}\](?: \(\d+\))?$/;
// A whole-job file's timestamp tag at the end of a stored name (optionally " (n)").
const TIMESTAMP_TAG = / \[\d{14}\](?: \(\d+\))?$/;

// The name to try for the n-th attempt at placing `fileName` in Job Files: attempt 0 is
// the name itself, then " (QA form)", " (QA form 2)" and so on — placed before the
// timestamp tag when the name carries one (so the Files panel still reads the tag and
// shows the clean name), otherwise before the extension.
function jobFilesName(fileName, attempt) {
  const ext = path.extname(fileName);
  let base = fileName.slice(0, fileName.length - ext.length).replace(PART_TAG, '');
  if (!base.trim()) base = 'QA form';
  const tagMatch = base.match(TIMESTAMP_TAG);
  const tag = tagMatch ? tagMatch[0] : '';
  const head = tag ? base.slice(0, base.length - tag.length) : base;
  if (attempt === 0) return `${head}${tag}${ext}`;
  return `${head} (QA form${attempt === 1 ? '' : ` ${attempt}`})${tag}${ext}`;
}

// Errors meaning "this drive can't make hard links" (some network shares, a FAT drive),
// not "that name is taken" — the move then falls back to an exclusive copy.
const LINK_UNSUPPORTED = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS', 'EINVAL']);

// Write `from` at `to` only if nothing is at `to` — atomically, so a file someone copies
// into Job Files by hand at the same moment is never replaced. Throws EEXIST when the
// name is taken. A hard link is tried first (instant, no second copy of the bytes); a
// drive that can't make one gets an exclusive copy instead.
function placeWithoutOverwrite(from, to) {
  try {
    fs.linkSync(from, to);
    return;
  } catch (err) {
    if (!LINK_UNSUPPORTED.has(err.code)) throw err;
  }
  try {
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    // Not EEXIST means the name was ours when the copy started, so a half-written copy
    // is ours too — take it away rather than leave a broken file for the next pass to
    // step around.
    if (err.code !== 'EEXIST') {
      try { fs.unlinkSync(to); } catch { /* nothing was written */ }
    }
    throw err;
  }
}

// Move one file into Job Files under the first free name, never overwriting anything.
// The original is deleted only after the new copy exists; if it can't be deleted, the
// new copy is taken back out, so the file is never lost and never ends up in both
// places (which would duplicate it on the next pass). Returns the name it was given.
const MAX_NAME_ATTEMPTS = 1000;
function moveFileWithoutOverwrite(from, destDir, fileName) {
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    const toName = jobFilesName(fileName, attempt);
    const to = path.join(destDir, toName);
    try {
      placeWithoutOverwrite(from, to);
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw err;
    }
    try {
      fs.unlinkSync(from);
    } catch (err) {
      try { fs.unlinkSync(to); } catch (undoErr) {
        logger.error({ err: undoErr, path: to }, 'Migration: Could not take back a moved QA form after its original could not be removed');
      }
      throw err;
    }
    return toName;
  }
  throw new Error(`No free name in Job Files for ${fileName}`);
}

// Ties a QA Forms folder found on disk back to its job, for the trail. Built only when
// the first QA Forms folder is actually found (most installs have none, and then this
// costs nothing), and never lists the disk itself: the company folder's own name carries
// the company's code ("Name [code]"), which maps to a company id with one read of the
// companies table, and the job is then looked up by (company id, job number). Only a job
// with no linked company — whose folder is the plain company name, with no code — is
// matched by name.
function makeJobLookup() {
  let companyIdByCode = null;
  let unlinkedJobByFolder = null;
  let byNumber = null;
  let byCompany = null;
  const key = (companyFolder, jobFolder) => `${companyFolder}\u0000${jobFolder}`;

  function build() {
    companyIdByCode = new Map();
    for (const { id } of db.prepare('SELECT id FROM companies').all()) {
      const code = idSlug(id);
      if (code) companyIdByCode.set(code, id);
    }
    unlinkedJobByFolder = new Map();
    const unlinked = db.prepare(`
      SELECT id, job_number, company_name FROM jobcards
       WHERE company_id IS NULL OR company_id = ''
    `).all();
    for (const row of unlinked) {
      const companyFolder = sanitizeFolderName(row.company_name);
      const jobFolder = sanitizeFolderName(row.job_number);
      if (companyFolder && jobFolder) unlinkedJobByFolder.set(key(companyFolder, jobFolder), row.id);
    }
    byNumber = db.prepare('SELECT id FROM jobcards WHERE company_id = ? AND job_number = ?');
    byCompany = db.prepare('SELECT id, job_number FROM jobcards WHERE company_id = ?');
  }

  return function jobIdFor(companyFolder, jobFolder) {
    if (!companyIdByCode) build();
    const code = folderSlugOf(companyFolder);
    const companyId = code ? companyIdByCode.get(code) : null;
    if (!companyId) return unlinkedJobByFolder.get(key(companyFolder, jobFolder)) || null;
    const exact = byNumber.get(companyId, jobFolder);
    if (exact) return exact.id;
    // A job number holding a character a folder name can't (a slash, say) was
    // sanitized on its way to disk, so compare that customer's jobs the same way.
    const match = byCompany.all(companyId).find(row => sanitizeFolderName(row.job_number) === jobFolder);
    return match ? match.id : null;
  };
}

// Top-level entries in the job-folders location that belong to the drive, not to a
// customer — the recycle bin, "System Volume Information", hidden folders. They are
// usually unreadable, and counting that as a failure would stop the pass ever finishing.
function isDriveSystemFolder(name) {
  return name.startsWith('$') || name.startsWith('.') || name.toLowerCase() === 'system volume information';
}

// Move one job folder's QA Forms into its Job Files. Returns { moved, failed } — the
// names moved, and how many files couldn't be.
function moveOneQaFormsFolder(base, jobDir) {
  const qaDir = path.join(jobDir, OLD_QA_FOLDER);
  const destDir = path.join(jobDir, JOB_FILES_FOLDER);
  const moved = [];
  let failed = 0;
  if (!isWithinBase(base, qaDir) || !isWithinBase(base, destDir)) return { moved, failed: 1 };

  // Deliberately not recursive: the job folder is already there (its QA Forms folder was
  // just found in it), so only Job Files itself may be made. If the drive vanished in
  // between, this fails instead of building a stray chain of local folders.
  try {
    fs.mkdirSync(destDir);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  for (const entry of fs.readdirSync(qaDir, { withFileTypes: true })) {
    const from = path.join(qaDir, entry.name);
    if (!entry.isFile()) {
      // Only files are moved; a folder someone made inside it is left as it is.
      logger.warn({ path: from }, 'Migration: Left a non-file entry in an old QA Forms folder');
      continue;
    }
    try {
      moved.push(moveFileWithoutOverwrite(from, destDir, entry.name));
    } catch (err) {
      failed++;
      logger.error({ err, path: from }, 'Migration: Could not move a file out of an old QA Forms folder — left where it is, will retry next start');
    }
  }

  try {
    if (fs.readdirSync(qaDir).length === 0) fs.rmdirSync(qaDir);
  } catch (err) {
    logger.warn({ err, path: qaDir }, 'Migration: Could not remove an emptied QA Forms folder');
  }
  return { moved, failed };
}

function moveQaFormsIntoJobFiles() {
  if (settingsQueries.getByKey.get(QA_FORMS_MOVED_KEY)?.value) return;

  const baseRow = settingsQueries.getByKey.get('job_folders_base');
  const base = baseRow && baseRow.value ? baseRow.value.trim() : '';
  // Not set, or offline: nothing can be checked, so nothing is marked done.
  if (!base) return;
  if (!isBaseReachable(base)) {
    logger.warn('Migration: Job folders location not reachable — old QA Forms folders will be moved on a later start');
    return;
  }

  const jobIdFor = makeJobLookup();
  let failed = 0;
  let jobsMoved = 0;
  // [base]/[Company]/[Job]/QA Forms — two folder levels down, whatever the names.
  for (const company of fs.readdirSync(base, { withFileTypes: true })) {
    if (!company.isDirectory() || isDriveSystemFolder(company.name)) continue;
    const companyDir = path.join(base, company.name);
    let jobs;
    try {
      jobs = fs.readdirSync(companyDir, { withFileTypes: true });
    } catch (err) {
      failed++;
      logger.error({ err, path: companyDir }, 'Migration: Could not read a customer folder while moving old QA Forms');
      continue;
    }
    for (const job of jobs) {
      if (!job.isDirectory()) continue;
      const jobDir = path.join(companyDir, job.name);
      let isFolder = false;
      try { isFolder = fs.statSync(path.join(jobDir, OLD_QA_FOLDER)).isDirectory(); } catch { /* none here */ }
      if (!isFolder) continue;

      let result;
      try {
        result = moveOneQaFormsFolder(base, jobDir);
      } catch (err) {
        failed++;
        logger.error({ err, path: jobDir }, 'Migration: Could not move an old QA Forms folder');
        continue;
      }
      failed += result.failed;
      if (result.moved.length === 0) continue;

      jobsMoved++;
      const jobcardId = jobIdFor(company.name, job.name);
      if (jobcardId) {
        const count = result.moved.length;
        recordHistory('jobcard', jobcardId, 'update', null, 'system', {
          files: { from: `QA Forms: ${count} file${count === 1 ? '' : 's'}`, to: 'moved to Job Files' }
        }, { movedFiles: result.moved });
      } else {
        logger.warn({ path: jobDir, files: result.moved }, 'Migration: Moved old QA Forms files for a folder that matches no job');
      }
    }
  }

  if (jobsMoved > 0) logger.info({ jobs: jobsMoved }, 'Migration: Moved old QA Forms files into Job Files');
  if (failed === 0) {
    settingsQueries.upsert.run(QA_FORMS_MOVED_KEY, new Date().toISOString());
  } else {
    logger.warn({ failed }, 'Migration: Some old QA Forms files could not be moved — will retry next start');
  }
}

// A part's number (item_number) is a sort order the server owns, not its identity —
// its permanent id is. Before this change a new part's number was `existingItems.length
// + 1` (computed outside any transaction) and deleting a part renumbered the survivors
// 1..n; a database from before this change can therefore hold duplicate numbers (two
// parts added at once both counted the same existing rows) or, less likely, an
// inconsistency left by an interrupted renumber. Neither is possible going forward —
// new parts take MAX(item_number) + 1 inside the same transaction as their insert, and
// deletes no longer renumber anyone — but existing data needs folding onto a clean
// ordering once. Naturally idempotent (like foldGoodPiecesToWhole above): a job whose
// item_numbers already run 1..n in order is left untouched, so a second pass — or every
// later boot — finds nothing to fix and does nothing. No done-once flag needed.
function cleanUpDuplicateItemNumbering() {
  // item_number is a sort order the server owns. Nothing renumbers on delete any
  // more, so GAPS ARE EXPECTED AND MUST BE LEFT ALONE — this runs on every boot,
  // and closing a job's gaps here would silently shuffle its part numbers every
  // time the app restarted, which is the very instability this change removed.
  //
  // The one thing that genuinely needs repairing is a DUPLICATE number, which the
  // old count-based numbering could produce when two people added a part to the
  // same job at the same moment. A job holding one is already inconsistent, so it
  // is folded onto a clean 1..n; a job that merely has gaps is skipped untouched.
  // Naturally idempotent: once a job has no duplicates it is never rewritten again.
  const jobIds = db.prepare('SELECT DISTINCT jobcard_id FROM job_items').all().map(r => r.jobcard_id);
  const setNumber = db.prepare('UPDATE job_items SET item_number = ? WHERE id = ?');
  const renumberJob = db.transaction((rows) => {
    rows.forEach((row, idx) => {
      const wanted = idx + 1;
      if (row.item_number !== wanted) {
        setNumber.run(wanted, row.id);
      }
    });
  });

  let jobsFixed = 0;
  for (const jobcardId of jobIds) {
    // Order by the existing number first (so the job keeps its current relative
    // order), then by when the row was created as a stable tie-break between two
    // parts sharing a number.
    const rows = db.prepare(
      'SELECT id, item_number FROM job_items WHERE jobcard_id = ? ORDER BY item_number ASC, created_at ASC, id ASC'
    ).all(jobcardId);
    const hasDuplicates = new Set(rows.map(r => r.item_number)).size !== rows.length;
    if (!hasDuplicates) continue;
    renumberJob(rows);
    jobsFixed++;
  }
  if (jobsFixed > 0) {
    logger.info({ jobsFixed }, 'Migration: Folded duplicate job item numbers onto a clean per-job ordering');
  }
}

// A due date is a bare calendar day and nothing ever checked its shape on save (see
// validateJobcardDueDate in middleware/validation.js, added alongside this migration) —
// so an existing database can hold a due_date that isn't a plain 'YYYY-MM-DD', and the
// printout's strict reader (jobcard-helpers.js's formatDayAu(jc.due_date)) then shows a
// blank due date instead of the real one. Fold every stored value into the new shape.
// Only shapes with exactly one meaning are converted — nothing is guessed:
//   - a UTC-midnight instant / zone-less 'YYYY-MM-DD HH:MM:SS' is trimmed to its first
//     10 characters (already the calendar day, never read through a Date/time zone);
//   - a slash date is day-first — the only way this app has ever written one — with one
//     or two digits for day and month ('1/05/2026' is 1 May), rearranged string-only;
//   - a full ISO instant carrying its own zone ('...T14:00:00Z', '...+10:00') is read
//     down to the calendar day it falls on in the office's own time zone.
// Anything else is never handed to a general date reader (Date.parse reads '1/05/2026'
// month-first, which would save the wrong day silently). Instead it is cleared to "no
// due date" and the original text is recorded in the job's activity trail, so the
// value is kept where a person can find it and no row is left in a shape the save
// check refuses — otherwise every later edit of that job would be blocked. Naturally
// idempotent: a value that already passes isCalendarDate is skipped, and a cleared one
// is NULL, so a second run finds nothing to convert. Runs after the older
// "empty string -> NULL" migration above, so '' is already gone by the time this runs.
function normalizeDueDateShapes() {
  const rows = db.prepare(
    "SELECT id, due_date FROM jobcards WHERE due_date IS NOT NULL AND due_date != ''"
  ).all();
  const setDueDate = db.prepare('UPDATE jobcards SET due_date = ? WHERE id = ?');

  let converted = 0;
  let cleared = 0;
  for (const row of rows) {
    const value = String(row.due_date).trim();
    if (isCalendarDate(value)) {
      if (value !== row.due_date) { setDueDate.run(value, row.id); converted++; }
      continue;
    }

    let day = null;

    // A day stamped at UTC midnight, or a wall-clock 'YYYY-MM-DD HH:MM:SS' with no zone —
    // the calendar day is already sitting in the first 10 characters.
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.0+)?Z|[T ]\d{2}:\d{2}:\d{2})$/.test(value)) {
      const candidate = value.slice(0, 10);
      if (isCalendarDate(candidate)) day = candidate;
    }

    // Day-first slash date, one or two digits for day and month.
    if (!day) {
      const auMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
      if (auMatch) {
        const candidate = `${auMatch[3]}-${auMatch[2].padStart(2, '0')}-${auMatch[1].padStart(2, '0')}`;
        if (isCalendarDate(candidate)) day = candidate;
      }
    }

    // A full ISO instant with its own zone — the calendar day it falls on in the office.
    if (!day && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
      const parsedMs = Date.parse(value);
      if (Number.isFinite(parsedMs)) {
        const candidate = officeDateString(new Date(parsedMs));
        if (isCalendarDate(candidate)) day = candidate;
      }
    }

    if (day) {
      setDueDate.run(day, row.id);
      converted++;
    } else {
      setDueDate.run(null, row.id);
      recordHistory('jobcard', row.id, 'update', null, 'system', {
        dueDate: { from: row.due_date, to: null }
      });
      cleared++;
      logger.warn({ jobcardId: row.id, dueDate: row.due_date }, 'Migration: Could not read a stored due date as a calendar day — cleared it and kept the original in the job\'s activity trail');
    }
  }
  if (converted > 0 || cleared > 0) {
    logger.info({ converted, cleared }, 'Migration: Folded stored due dates into plain calendar-day shape');
  }
}

function runLegacyMigrations() {
  logger.info('Running migrations...');

  // idx_history_user (user_id) and idx_history_entity (entity_type, entity_id) are
  // superseded by idx_history_user_created (user_id, created_at) and
  // idx_history_entity_created (entity_type, entity_id, created_at) in schema.js, which
  // cover the same lookups plus their ORDER BY created_at. Drop the old ones from an
  // existing database — naturally idempotent, no settings flag needed. Each conversion
  // below catches its own error so one failing block can never abort the rest — this
  // matters as much on a normal boot as at the end of a backup restore.
  try {
    db.exec('DROP INDEX IF EXISTS idx_history_user');
    db.exec('DROP INDEX IF EXISTS idx_history_entity');
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to drop superseded history indexes');
  }

  // One-shot wipe of legacy time_entries (Task 6 — per-item timer rewrite).
  // CSV item_number rows can't be mapped onto the new per-item shape, so this
  // conversion clears them rather than folding them; it runs once (guarded by
  // the settings flag below) and is a no-op thereafter.
  try {
    const wipeFlagKey = 'time_entries_per_item_wiped_at';
    const flag = db.prepare('SELECT value FROM settings WHERE key = ?').get(wipeFlagKey);
    if (!flag) {
      const result = db.prepare('DELETE FROM time_entries').run();
      settingsQueries.upsert.run(wipeFlagKey, new Date().toISOString());
      logger.info({ deleted: result.changes }, 'Migration: Wiped legacy time_entries for per-item timer');
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to wipe legacy time_entries for per-item timer');
  }

  try {
    foldGoodPiecesToWhole();
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to fold good-piece counts to whole numbers');
  }

  try {
    cleanUpDuplicateItemNumbering();
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to clean up duplicate item numbering');
  }

  // Clearing a job's due date used to save an empty string instead of "no date",
  // which a due-before search reads as earlier than every real day. Fold those
  // into NULL. Naturally idempotent (a second run finds none).
  try {
    const clearedDueDates = db.prepare("UPDATE jobcards SET due_date = NULL WHERE due_date = ''").run();
    if (clearedDueDates.changes > 0) {
      logger.info({ fixed: clearedDueDates.changes }, 'Migration: Stored cleared due dates as no date');
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to store cleared due dates as no date');
  }

  try {
    normalizeDueDateShapes();
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to normalize stored due date shapes');
  }

  try {
    moveQaFormsIntoJobFiles();
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to move old QA Forms folders into Job Files');
  }

  // Special labour changed from an auto-tally of "special"-marked time blocks into a
  // manually-entered costing line. Those blocks are being unmarked, so their hours now
  // sit in the normal labour total. Any special hours stored on existing costings were
  // that same auto-tally — leaving them would double-count. Zero the stored special
  // hours/total ONCE (guarded by a settings flag) so the new manual line starts empty;
  // the rate an admin previously typed is left intact. Never re-runs, so it can't wipe
  // hours an admin enters later.
  try {
    const specialResetKey = 'special_labour_manual_reset_at';
    const specialFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(specialResetKey);
    if (!specialFlag) {
      const reset = db.prepare(
        'UPDATE job_costings SET labour_special_hours = 0, labour_special_total = 0'
      ).run();
      settingsQueries.upsert.run(specialResetKey, new Date().toISOString());
      logger.info({ updated: reset.changes }, 'Migration: Reset stored special-labour hours for manual entry');
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to reset stored special-labour hours');
  }

  // Overtime tiers changed what a hand-typed labour-hours override means. Before, the
  // auto-tally was ALL logged time, so an admin's override meant "bill this many total
  // hours". Now the tally is split into normal + overtime tiers, and the override
  // applies only to the normal tier while the overtime tiers are added on top — so an
  // old override would double-count once overtime windows are configured. Clear the
  // stored override ONCE (guarded by a settings flag) on jobs that aren't invoiced yet,
  // so they fall back to the new auto-split; already-invoiced jobs are left untouched so a
  // billed total never moves on its own. Never re-runs, so it can't wipe an override an
  // admin types later.
  try {
    const otOverrideResetKey = 'labour_hours_override_reset_at';
    const otOverrideFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(otOverrideResetKey);
    if (!otOverrideFlag) {
      const reset = db.prepare(
        `UPDATE job_costings SET labour_hours_override = NULL
         WHERE jobcard_id IN (SELECT id FROM jobcards WHERE archived = 0)`
      ).run();
      settingsQueries.upsert.run(otOverrideResetKey, new Date().toISOString());
      logger.info({ updated: reset.changes }, 'Migration: Cleared stale labour-hours overrides for overtime split');
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to clear stale labour-hours overrides');
  }

  // A previous-job reference only exists on a repeat job. Unticking Repeat Job used
  // to only hide the box, so the old reference stayed stored and still printed, exported
  // and matched searches. Clear it on every job that isn't a
  // repeat. Naturally idempotent (a second run finds none).
  try {
    const clearedRefs = db.prepare(
      'UPDATE jobcards SET repeat_job_reference = NULL WHERE is_repeat_job = 0 AND repeat_job_reference IS NOT NULL'
    ).run();
    if (clearedRefs.changes > 0) {
      logger.info({ cleared: clearedRefs.changes }, 'Migration: Cleared previous-job references on non-repeat jobs');
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to clear previous-job references on non-repeat jobs');
  }

  // The 'TREATMENT' and 'ON_HOLD' statuses were removed and folded into
  // 'AWAITING_MATERIAL' (relabelled "Material/Treatment"). Convert any job still
  // parked on the old values so they display, sort, and save normally — otherwise
  // editing such a job would fail status validation.
  try {
    const foldStatuses = db.prepare(
      "UPDATE jobcards SET status = 'AWAITING_MATERIAL' WHERE status IN ('TREATMENT', 'ON_HOLD')"
    ).run();
    if (foldStatuses.changes > 0) {
      logger.info({ moved: foldStatuses.changes }, "Migration: Folded TREATMENT/ON_HOLD jobs into AWAITING_MATERIAL");
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to fold TREATMENT/ON_HOLD jobs into AWAITING_MATERIAL');
  }

  // The weekly overtime schedule is now edited on an hour-by-hour paint grid. The old
  // editor allowed sub-hour block starts (e.g. 14:30), which the grid can't represent —
  // it would show such a boundary at the next whole hour while the minute-splitter still
  // billed the partial hour at the old tier, so screen and billing diverged. Snap every
  // stored day to whole-hour boundaries ONCE (guarded by a settings flag) so what's shown
  // matches what's billed. Whole-hour schedules are unchanged, so this is a no-op for
  // them and never re-runs. Uses the same cycle semantics as the editor/splitter.
  try {
    const scheduleSnapKey = 'labour_schedule_whole_hours_at';
    const scheduleSnapFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(scheduleSnapKey);
    if (!scheduleSnapFlag) {
      try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('labour_schedule');
        if (row && row.value) {
          const { schedule: out, changed } = scheduleToWholeHours(JSON.parse(row.value));
          if (changed) {
            db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(out), 'labour_schedule');
            logger.info('Migration: Snapped labour schedule block starts to whole hours');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Migration: Failed to snap labour schedule to whole hours');
      }
      settingsQueries.upsert.run(scheduleSnapKey, new Date().toISOString());
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to run the labour schedule whole-hours snap');
  }

  // Old jobs invoiced before per-job rule ownership may have no costing row at all.
  // Without a row, viewing one recomputes from live settings and would track a later
  // rate/schedule change instead of staying put. Give every rowless archived job a stored
  // row — computeLiveCosting captures today's rate/rules onto the row (best available;
  // the originals were never recorded), so from then on the job owns them. Any DB that
  // has archived jobs already has its settings, so the captured rate is the current
  // company rate, not 0. New jobs always get a costing row at creation, so nothing new
  // ever needs this. No settings flag guards this block — the query itself (any
  // archived job still missing a row) is the idempotence guard, which means a job that
  // failed to backfill on an earlier boot (a locked file, a bad rate, …) is retried on
  // every boot until it succeeds, instead of being marked "done" despite failing. A
  // stored `archived_costing_backfill_at` row from an older version of this migration
  // is harmless and left alone; nothing reads it any more.
  try {
    const rowless = db.prepare(
      'SELECT id FROM jobcards WHERE archived = 1 AND id NOT IN (SELECT jobcard_id FROM job_costings)'
    ).all();
    let stamped = 0;
    for (const { id } of rowless) {
      try {
        persistCosting(computeLiveCosting(id, null));
        stamped++;
      } catch (err) {
        logger.error({ err, jobcardId: id }, 'Migration: Failed to backfill costing row for archived job');
      }
    }
    if (stamped > 0) {
      logger.info({ stamped }, 'Migration: Backfilled costing rows for archived jobs');
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to run the archived-job costing backfill');
  }

  // Seed the Victorian (VIC) 2026 public holidays onto existing databases that never
  // had a holiday list. Runs ONCE (guarded) and only fills the list when it is still
  // empty, so an admin who already added or cleared their own holidays is never
  // overwritten. New installs get the same list from the default-settings block above.
  try {
    const vicHolidaysKey = 'vic_2026_holidays_seeded_at';
    const vicHolidaysFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(vicHolidaysKey);
    if (!vicHolidaysFlag) {
      try {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('labour_public_holidays');
        let current = [];
        try { current = JSON.parse(row && row.value ? row.value : '[]'); } catch { current = []; }
        const isEmpty = !Array.isArray(current) || current.length === 0;
        if (isEmpty) {
          settingsQueries.upsert.run('labour_public_holidays', JSON.stringify(DEFAULT_VIC_PUBLIC_HOLIDAYS_2026));
          logger.info('Migration: Seeded Victorian 2026 public holidays');
        }
        settingsQueries.upsert.run(vicHolidaysKey, new Date().toISOString());
      } catch (err) {
        logger.error({ err }, 'Migration: Failed to seed Victorian public holidays');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to run the Victorian public holidays seed');
  }

  // Per-job overtime-rule ownership. Overtime rules (schedule, holidays, timezone, base
  // multipliers) used to be read live from settings on every costing compute, so changing
  // them moved every existing job. Now each job owns its own captured copy — but existing
  // jobs never recorded theirs. Stamp every costing row that hasn't captured its rules yet
  // with TODAY's company rules as its own copy (the originals are unrecoverable — best
  // available), so from then on the job owns them and a later settings change never moves
  // it. This runs ONCE (guarded) and is idempotent (a row that already has rules is
  // skipped). Every job created afterwards owns its rules from creation.
  try {
    const otOwnershipKey = 'overtime_ownership_at';
    const otOwnershipFlag = db.prepare('SELECT value FROM settings WHERE key = ?').get(otOwnershipKey);
    if (!otOwnershipFlag) {
      try {
        // Read the company's overtime rules through the same shared reader every live
        // costing compute uses (readOvertimeSettings, utils/overtimeSettings.js), rather
        // than this migration's own hand-rolled settings lookup — that copy fell back to
        // 'UTC' for a missing time zone (readOvertimeSettings falls back to the machine's
        // own zone, matching officeTimeZone everywhere else) and treated a genuine 0
        // multiplier as "unset" (Number(x) || default), both of which readOvertimeSettings
        // gets right. Schedule/holidays are parsed objects here, so they're stringified
        // back to JSON text for the job_costings columns, which store them as text.
        const live = readOvertimeSettings();
        const params = {
          schedule: JSON.stringify(live.schedule),
          holidays: JSON.stringify(live.holidays),
          timezone: live.timezone,
          ot1: live.ot1Mult,
          ot2: live.ot2Mult,
          hol: live.holidayMult
        };
        const stampRules = db.prepare(
          `UPDATE job_costings SET
             labour_schedule = @schedule,
             labour_public_holidays = @holidays,
             labour_timezone = @timezone,
             labour_base_ot1_multiplier = @ot1,
             labour_base_ot2_multiplier = @ot2,
             labour_base_holiday_multiplier = @hol
           WHERE labour_schedule IS NULL`
        ).run(params);
        logger.info(
          { stamped: stampRules.changes },
          'Migration: Captured per-job overtime rules onto existing costing rows'
        );
        // Mark done only after the capture actually succeeded, so a failure retries on the
        // next boot instead of leaving old rows on live settings. The UPDATE only touches
        // un-captured rows, so a retry is a safe no-op for rows already stamped.
        settingsQueries.upsert.run(otOwnershipKey, new Date().toISOString());
      } catch (err) {
        logger.error({ err }, 'Migration: Failed to capture per-job overtime rules');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to run the per-job overtime-rule ownership capture');
  }

  // A trail label isn't worth refusing to boot over, so a failure here is logged and the
  // app carries on — safe now that the pass is bounded: the retry next boot renames the
  // same pre-cutover rows and nothing else.
  try {
    renameLegacyPrintTrail();
    // The done-once flag that used to guard that rename is dead — the cutover marker
    // replaced it. Drop it so the settings table doesn't carry two markers for one job.
    db.prepare("DELETE FROM settings WHERE key = 'history_print_names_converted_at'").run();
  } catch (err) {
    logger.error({ err }, 'Migration: Failed to rename pre-cutover print trail entries');
  }

  logger.info('Migrations complete');
}

module.exports = { runLegacyMigrations, PRINT_NAMING_CUTOVER_KEY, QA_FORMS_MOVED_KEY };
