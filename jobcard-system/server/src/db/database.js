// Database facade - re-exports all modules for backward compatibility
const { db, DATA_DIR, DB_PATH } = require('./connection');

// Execute schema creation on import
require('./schema');

// Import helpers
const {
  recordHistory,
  actorName,
  formatJobNumber,
  peekNextJobNumber,
  highestUsedJobNumber,
  bumpJobNumber,
  getSettings,
  updateSettings
} = require('./helpers');

// Import all queries
const {
  userQueries,
  companyQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  tagQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  timeEntryQueries,
  jobNoteQueries,
  getLatestNotesForJobcards,
  jobCostingQueries,
  HISTORY_JOB_NUMBER_SQL,
  historyQueries,
  settingsQueries,
  getAssigneesForJobcards,
  qaLevelQueries
} = require('./queries');

// The Workshop Statistics route only needs a job's captured overtime rules
// (schedule/holidays/timezone), for exactly the jobs whose logged time falls in
// the selected range — never the whole job_costings table. The id list's length
// varies per request, so (same as the jobs query's own dynamic IN-list in
// statistics.js) this rebuilds the placeholder list per call rather than reusing
// one fixed prepared statement.
function getJobCostingOvertimeRowsByJobcardIds(jobcardIds) {
  if (!jobcardIds.length) return [];
  const placeholders = jobcardIds.map(() => '?').join(', ');
  return db.prepare(
    `SELECT jobcard_id, labour_schedule, labour_public_holidays, labour_timezone
     FROM job_costings WHERE jobcard_id IN (${placeholders})`
  ).all(...jobcardIds);
}

module.exports = {
  db,
  DATA_DIR,
  DB_PATH,
  getJobCostingOvertimeRowsByJobcardIds,
  recordHistory,
  actorName,
  formatJobNumber,
  peekNextJobNumber,
  highestUsedJobNumber,
  bumpJobNumber,
  getSettings,
  updateSettings,
  userQueries,
  companyQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  tagQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  timeEntryQueries,
  jobNoteQueries,
  getLatestNotesForJobcards,
  jobCostingQueries,
  HISTORY_JOB_NUMBER_SQL,
  historyQueries,
  settingsQueries,
  getAssigneesForJobcards,
  qaLevelQueries
};
