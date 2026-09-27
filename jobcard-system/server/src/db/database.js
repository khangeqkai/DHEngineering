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
  historyQueries,
  settingsQueries,
  getAssigneesForJobcards,
  qaLevelQueries,
  qaLevelTemplateQueries
} = require('./queries');

module.exports = {
  db,
  DATA_DIR,
  DB_PATH,
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
  historyQueries,
  settingsQueries,
  getAssigneesForJobcards,
  qaLevelQueries,
  qaLevelTemplateQueries
};
