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

// Atomically generate the next job number and increment the counter.
// Returns { jobNumber, error } - error if not configured.
// Uses a transaction so concurrent creates cannot get the same number.
const generateAndIncrementJobNumber = db.transaction(() => {
  const settings = getSettings();
  const prefix = settings.job_number_prefix || '';
  const nextStr = settings.job_number_next || '';

  if (!nextStr) {
    return { jobNumber: null, error: 'Job number sequence not configured. Please set it in Settings.' };
  }

  // Preserve leading zeros: use the width of the stored string
  const width = nextStr.length;
  const nextNum = parseInt(nextStr, 10);
  if (isNaN(nextNum) || nextNum < 0) {
    return { jobNumber: null, error: 'Invalid job number sequence value.' };
  }

  const paddedNum = String(nextNum).padStart(width, '0');
  const jobNumber = prefix + paddedNum;

  // Increment immediately within the same transaction
  const newValue = String(nextNum + 1).padStart(width, '0');
  settingsQueries.upsert.run('job_number_next', newValue);

  return { jobNumber, error: null };
});

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
  generateAndIncrementJobNumber,
  getSettings,
  updateSettings
};
