const { db } = require('../connection');

// QA Level queries
const qaLevelQueries = {
  getAll: db.prepare('SELECT * FROM qa_levels ORDER BY name ASC'),
  getById: db.prepare('SELECT * FROM qa_levels WHERE id = ?'),

  create: db.prepare(`
    INSERT INTO qa_levels (id, name, name_lower, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE qa_levels SET name = ?, name_lower = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM qa_levels WHERE id = ?'),

  // Check if any job cards use this level
  countJobsByLevel: db.prepare('SELECT COUNT(*) as count FROM jobcards WHERE qa_level_id = ?'),

  // Cascade a rename onto every job already on this level, so the copied label
  // (jobcards.quality_level) never drifts from the level's current name — the
  // job list, search and the Critical stop-timer inspection sign-off all key off
  // that copied name, not off qa_level_id. Deliberately leaves updated_at alone (a
  // level rename isn't an edit to the job itself, so it must not re-sort the list).
  renameOnJobs: db.prepare('UPDATE jobcards SET quality_level = ? WHERE qa_level_id = ?')
};

module.exports = {
  qaLevelQueries
};
