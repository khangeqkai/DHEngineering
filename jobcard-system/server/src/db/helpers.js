const { db } = require('./connection');
const { settingsQueries } = require('./queries/support');

// Helper to record history
function recordHistory(entityType, entityId, action, userId, userName, changes, snapshot) {
  const stmt = db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(
    entityType,
    entityId,
    action,
    userId,
    userName,
    JSON.stringify(changes),
    JSON.stringify(snapshot)
  );
}

// Generate job number: JC-YYYYMMDD-XXX or QT-YYYYMMDD-XXX
function generateJobNumber(isQuote = false) {
  const prefix = isQuote ? 'QT' : 'JC';
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  // Get count of jobs created today
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM jobcards
    WHERE job_number LIKE ?
  `);
  const result = countStmt.get(`${prefix}-${dateStr}-%`);
  const nextNum = (result.count || 0) + 1;

  return `${prefix}-${dateStr}-${String(nextNum).padStart(3, '0')}`;
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
  generateJobNumber,
  getSettings,
  updateSettings
};
