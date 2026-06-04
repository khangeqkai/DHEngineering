// Database facade - re-exports all modules for backward compatibility
const { db, DATA_DIR, DB_PATH } = require('./connection');

// Execute schema creation on import
require('./schema');

// Import helpers
const {
  recordHistory,
  peekNextJobNumber,
  bumpJobNumber,
  getSettings,
  updateSettings
} = require('./helpers');

// Import all queries
const {
  userQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  tagQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  timeEntryQueries,
  jobNoteQueries,
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
  peekNextJobNumber,
  bumpJobNumber,
  getSettings,
  updateSettings,
  userQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  tagQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  timeEntryQueries,
  jobNoteQueries,
  jobCostingQueries,
  historyQueries,
  settingsQueries,
  getAssigneesForJobcards,
  qaLevelQueries,
  qaLevelTemplateQueries
};
