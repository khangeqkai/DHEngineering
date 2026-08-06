const { db } = require('./connection');
const { settingsQueries } = require('./queries/support');

// Helper to record history
function recordHistory(entityType, entityId, action, userId, userName, changes, snapshot) {
  const stmt = db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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

// Compute the next job number WITHOUT touching the counter.
// Returns { jobNumber, nextNum, width, error } - error if not configured.
// The caller commits the bump (bumpJobNumber) only after the job record has been
// written, inside the same transaction, so a failed create never wastes a number.
function peekNextJobNumber() {
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

  const jobNumber = prefix + String(nextNum).padStart(width, '0');
  return { jobNumber, nextNum, width, error: null };
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
  peekNextJobNumber,
  bumpJobNumber,
  getSettings,
  updateSettings
};
