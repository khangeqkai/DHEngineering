const { db } = require('./connection');
const { settingsQueries, historyQueries } = require('./queries/support');
const { jobcardQueries } = require('./queries/jobcard');
const { displayName } = require('../shared/names');

// Helper to record history
function recordHistory(entityType, entityId, action, userId, userName, changes, snapshot) {
  historyQueries.insert.run(
    entityType,
    entityId,
    action,
    userId,
    userName,
    JSON.stringify(changes),
    JSON.stringify(snapshot)
  );
}

// The display name every route passed as recordHistory's `userName` — every
// call site worked it out by hand the same way. Kept next to recordHistory since it
// exists only to feed it. It is displayName (shared/names.js), the same rule as the
// time-entry queries' user_name (DISPLAY_NAME_SQL) and runContext's workerName, so a
// person is shown under one name everywhere. (Whether a clock is the actor's own is
// decided by account id, never by comparing these names.)
function actorName(req) {
  return displayName(req.user);
}

// The one place a job number is built from its parts. Preserves leading zeros:
// the caller passes the width of the stored counter string.
function formatJobNumber(prefix, num, width) {
  return prefix + String(num).padStart(width, '0');
}

// Compute the next job number WITHOUT touching the counter.
// Returns { jobNumber, nextNum, width, error } - error if not configured.
// The caller commits the bump (bumpJobNumber) only after the job record has been
// written, inside the same transaction, so a failed create never wastes a number.
function peekNextJobNumber() {
  const settings = getSettings();
  const prefix = settings.job_number_prefix || '';
  const nextStr = settings.job_number_next || '';

  if (!nextStr) {
    return { jobNumber: null, error: 'The job numbering hasn\'t been set up. Ask an admin to set it in Settings.' };
  }

  // Preserve leading zeros: use the width of the stored string
  const width = nextStr.length;
  const nextNum = parseInt(nextStr, 10);
  if (isNaN(nextNum) || nextNum < 0) {
    return { jobNumber: null, error: 'The next job number in Settings isn\'t a valid number. Ask an admin to fix it.' };
  }

  const jobNumber = formatJobNumber(prefix, nextNum, width);
  return { jobNumber, nextNum, width, error: null };
}

// The highest job number ever actually handed out with this prefix — the jobs that
// exist, plus deleted jobs, whose number the delete trail keeps. A deleted job's
// number is never reused. The counter's own current value is deliberately NOT a
// floor: it may have been moved past numbers nobody ever used (a mistyped 50000),
// and that mistake has to be undoable. Returns { num, deleted } or null when this
// prefix has never been used.
function highestUsedJobNumber(prefix) {
  const existingRows = jobcardQueries.getByPrefix.all(prefix.length, prefix);
  const deletedRows = historyQueries.getDeletedJobNumbers.all();

  // Compared without regard to case: Windows folders are case-insensitive, so
  // "dh-0001" would share DH-0001's folder.
  const prefixLower = prefix.toLowerCase();
  let maxExisting = 0;
  let maxIsDeleted = false;
  const consider = (jobNumber, deleted) => {
    if (typeof jobNumber !== 'string' || !jobNumber.toLowerCase().startsWith(prefixLower)) return;
    const num = parseInt(jobNumber.slice(prefix.length), 10);
    if (!isNaN(num) && num > maxExisting) { maxExisting = num; maxIsDeleted = deleted; }
  };
  existingRows.forEach(r => consider(r.job_number, false));
  deletedRows.forEach(r => consider(r.job_number, true));

  if (maxExisting === 0) return null;
  return { num: maxExisting, deleted: maxIsDeleted };
}

// Advance the job-number counter. Call this LAST inside the create transaction
// so the number is only consumed once the job record is safely written.
function bumpJobNumber(nextNum, width) {
  settingsQueries.upsert.run('job_number_next', String(nextNum + 1).padStart(width, '0'));
}

// Settings helper functions
function getSettings() {
  const rows = settingsQueries.get.all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

function updateSettings(settingsObj) {
  const updateMany = db.transaction((settings) => {
    for (const [key, value] of Object.entries(settings)) {
      settingsQueries.upsert.run(key, value);
    }
  });
  updateMany(settingsObj);
}

module.exports = {
  recordHistory,
  actorName,
  formatJobNumber,
  peekNextJobNumber,
  highestUsedJobNumber,
  bumpJobNumber,
  getSettings,
  updateSettings
};
