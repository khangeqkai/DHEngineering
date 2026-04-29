const { db } = require('../connection');

// Jobcard queries
const jobcardQueries = {
  getById: db.prepare('SELECT * FROM jobcards WHERE id = ?'),
  getByJobNumber: db.prepare('SELECT * FROM jobcards WHERE job_number = ?'),

  getAll: db.prepare(`
    SELECT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    WHERE j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getByStatus: db.prepare(`
    SELECT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    WHERE j.status = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getArchived: db.prepare(`
    SELECT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    WHERE j.archived = 1
    ORDER BY j.invoiced_date DESC
  `),

  getByContact: db.prepare(`
    SELECT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    WHERE j.contact_id = ?
    ORDER BY j.created_at DESC
  `),

  getOverdue: db.prepare(`
    SELECT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    WHERE j.due_date < date('now') AND j.status NOT IN ('DONE', 'INVOICED') AND j.archived = 0
    ORDER BY j.due_date ASC
  `),

  getByAssignee: db.prepare(`
    SELECT DISTINCT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    INNER JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.user_id = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getByAssigneeAndStatus: db.prepare(`
    SELECT DISTINCT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    INNER JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.user_id = ? AND j.status = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),


  getUnassigned: db.prepare(`
    SELECT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    LEFT JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.id IS NULL AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  getUnassignedByStatus: db.prepare(`
    SELECT j.*, c.contact_name as stored_contact_name, c.company_name as stored_company_name
    FROM jobcards j
    LEFT JOIN contacts c ON j.contact_id = c.id
    LEFT JOIN job_assignees ja ON ja.jobcard_id = j.id
    WHERE ja.id IS NULL AND j.status = ? AND j.archived = 0
    ORDER BY j.created_at DESC
  `),

  create: db.prepare(`
    INSERT INTO jobcards (
      id, job_number, card_type, status, contact_id,
      contact_name, company_name, contact_phone, contact_email,
      quality_level, job_type, priority, po_number, quote_reference,
      drawings_type, customer_property, description, due_date,
      is_repeat_job, repeat_job_reference,
      notes, photos, created_by, updated_by, qa_level_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  update: db.prepare(`
    UPDATE jobcards SET
      card_type = ?, status = ?, contact_id = ?,
      contact_name = ?, company_name = ?, contact_phone = ?, contact_email = ?,
      quality_level = ?, job_type = ?, priority = ?, po_number = ?, quote_reference = ?,
      drawings_type = ?, customer_property = ?, description = ?, due_date = ?,
      is_repeat_job = ?, repeat_job_reference = ?,
      notes = ?, photos = ?, updated_by = ?, qa_level_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  updateStatus: db.prepare(`
    UPDATE jobcards SET status = ?, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  archive: db.prepare(`
    UPDATE jobcards SET archived = 1, invoiced_date = ?, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  unarchive: db.prepare(`
    UPDATE jobcards SET archived = 0, invoiced_date = NULL, updated_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `),

  delete: db.prepare('DELETE FROM jobcards WHERE id = ?')
};

// Job items queries
const jobItemQueries = {
  getByJobcard: db.prepare('SELECT * FROM job_items WHERE jobcard_id = ? ORDER BY item_number ASC'),

  create: db.prepare(`
    INSERT INTO job_items (id, jobcard_id, item_number, qty, description, material, treatment, treatment_other, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `),

  deleteByJobcard: db.prepare('DELETE FROM job_items WHERE jobcard_id = ?')
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
    VALUES (?, ?, ?, datetime('now'))
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
