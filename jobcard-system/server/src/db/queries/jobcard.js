const { db } = require('../connection');

// Jobcard queries
const jobcardQueries = {
  getById: db.prepare('SELECT * FROM jobcards WHERE id = ?'),
  getByJobNumber: db.prepare('SELECT * FROM jobcards WHERE job_number = ?'),

  getAll: db.prepare(`
    SELECT j.*
    FROM jobcards j
    WHERE j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getByStatus: db.prepare(`
    SELECT j.*
    FROM jobcards j
    WHERE j.status = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getArchived: db.prepare(`
    SELECT j.*
    FROM jobcards j
    WHERE j.archived = 1
    ORDER BY j.invoiced_date DESC
  `),

  getByContact: db.prepare(`
    SELECT j.*
    FROM jobcards j
    WHERE j.contact_id = ?
    ORDER BY j.created_at DESC
  `),

  getByAssignee: db.prepare(`
    SELECT DISTINCT j.*
    FROM jobcards j
    INNER JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.user_id = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getByAssigneeAndStatus: db.prepare(`
    SELECT DISTINCT j.*
    FROM jobcards j
    INNER JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.user_id = ? AND j.status = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),


  getUnassigned: db.prepare(`
    SELECT j.*
    FROM jobcards j
    LEFT JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.id IS NULL AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getUnassignedByStatus: db.prepare(`
    SELECT j.*
    FROM jobcards j
    LEFT JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.id IS NULL AND j.status = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  create: db.prepare(`
    INSERT INTO jobcards (
      id, job_number, card_type, status, company_id, contact_id,
      contact_name, company_name, contact_phone, contact_email,
      quality_level, priority, po_number, quote_reference,
      description, due_date,
      is_repeat_job, repeat_job_reference,
      photos, created_by, updated_by, qa_level_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE jobcards SET
      card_type = ?, status = ?, company_id = ?, contact_id = ?,
      contact_name = ?, company_name = ?, contact_phone = ?, contact_email = ?,
      quality_level = ?, priority = ?, po_number = ?, quote_reference = ?,
      description = ?, due_date = ?,
      is_repeat_job = ?, repeat_job_reference = ?,
      photos = ?, updated_by = ?, qa_level_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  updateStatus: db.prepare(`
    UPDATE jobcards SET status = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  archive: db.prepare(`
    UPDATE jobcards SET archived = 1, invoiced_date = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  unarchive: db.prepare(`
    UPDATE jobcards SET archived = 0, invoiced_date = NULL, status = 'OPEN', updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM jobcards WHERE id = ?')
};

// Job items queries
const jobItemQueries = {
  getByJobcard: db.prepare('SELECT * FROM job_items WHERE jobcard_id = ? ORDER BY item_number ASC'),

  create: db.prepare(`
    INSERT INTO job_items (id, jobcard_id, item_number, qty, description, job_type, material, treatments, drawings_type, customer_property, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  // Update a line in place by its stable id, so the line keeps its identity (and the
  // recorded work pointing at it) across edits and reorders.
  updateById: db.prepare(`
    UPDATE job_items SET
      item_number = ?, qty = ?, description = ?, job_type = ?, material = ?, treatments = ?,
      drawings_type = ?, customer_property = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  deleteById: db.prepare('DELETE FROM job_items WHERE id = ?')
};

// Job assignees queries
const jobAssigneeQueries = {
  getByJobcard: db.prepare(`
    SELECT ja.*, u.name as user_name, u.username
    FROM job_assignees ja
    JOIN users u ON ja.user_id = u.id
    WHERE ja.jobcard_id = ?
    ORDER BY ja.assigned_at ASC
  `),

  create: db.prepare(`
    INSERT INTO job_assignees (id, jobcard_id, user_id, assigned_at)
    VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  delete: db.prepare('DELETE FROM job_assignees WHERE id = ?'),
  deleteByJobcard: db.prepare('DELETE FROM job_assignees WHERE jobcard_id = ?'),
  deleteByJobcardAndUser: db.prepare('DELETE FROM job_assignees WHERE jobcard_id = ? AND user_id = ?')
};

// Dynamic query helpers (better-sqlite3 doesn't support array params)
function getAssigneesForJobcards(jobcardIds) {
  if (jobcardIds.length === 0) return {};
  const placeholders = jobcardIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT ja.jobcard_id, ja.id, ja.user_id, u.name as user_name, u.username
    FROM job_assignees ja
    JOIN users u ON ja.user_id = u.id
    WHERE ja.jobcard_id IN (${placeholders})
    ORDER BY ja.assigned_at ASC
  `).all(...jobcardIds);
  const map = {};
  for (const row of rows) {
    if (!map[row.jobcard_id]) map[row.jobcard_id] = [];
    map[row.jobcard_id].push(row);
  }
  return map;
}

module.exports = {
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  getAssigneesForJobcards
};
