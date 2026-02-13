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
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  timeEntryQueries,
  jobCostingQueries,
  documentQueries,
  qaFormQueries,
  historyQueries,
  settingsQueries
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
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  timeEntryQueries,
  jobCostingQueries,
  documentQueries,
  qaFormQueries,
  historyQueries,
  settingsQueries
};
