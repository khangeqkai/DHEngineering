// Database facade - re-exports all modules for backward compatibility
const { db, DATA_DIR, DB_PATH } = require('./connection');

// Execute schema creation on import
require('./schema');

// Import helpers
const {
  recordHistory,
  generateJobNumber,
  getSettings,
  updateSettings
} = require('./helpers');

// Import all queries
const {
  userQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  serviceTagQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  timeEntryQueries,
  jobNoteQueries,
  jobCostingQueries,
  documentQueries,
  qaFormQueries,
  historyQueries,
  settingsQueries,
  getAssigneesForJobcards
} = require('./queries');

module.exports = {
  db,
  DATA_DIR,
  DB_PATH,
  recordHistory,
  generateJobNumber,
  getSettings,
  updateSettings,
  userQueries,
  contactQueries,
  supplierQueries,
  machineQueries,
  serviceTagQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  timeEntryQueries,
  jobNoteQueries,
  jobCostingQueries,
  documentQueries,
  qaFormQueries,
  historyQueries,
  settingsQueries,
  getAssigneesForJobcards
};
