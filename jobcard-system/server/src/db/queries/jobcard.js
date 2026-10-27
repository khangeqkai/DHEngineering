const { db } = require('../connection');
const { DISPLAY_NAME_SQL } = require('../displayNameSql');

// Jobcard queries
const jobcardQueries = {
  getById: db.prepare('SELECT * FROM jobcards WHERE id = ?'),
  // Ignoring case, like every "already used" check: Windows folders do, so dh-0007
  // and DH-0007 would share one folder.
  getByJobNumber: db.prepare('SELECT * FROM jobcards WHERE lower(job_number) = lower(?)'),

  // Every job number starting with this prefix — the prefix-scan half of
  // highestUsedJobNumber (db/helpers.js), which decides how low a new starting
  // number is allowed to go. Case-insensitive: Windows folders are, so "dh-0001"
  // would share DH-0001's folder.
  getByPrefix: db.prepare('SELECT job_number FROM jobcards WHERE lower(substr(job_number, 1, ?)) = lower(?)'),

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
      quality_level, priority, po_number,
      description, due_date,
      repeat_job_reference,
      created_by, updated_by, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `),

  update: db.prepare(`
    UPDATE jobcards SET
      card_type = ?, status = ?, company_id = ?, contact_id = ?,
      contact_name = ?, company_name = ?, contact_phone = ?, contact_email = ?,
      quality_level = ?, priority = ?, po_number = ?,
      description = ?, due_date = ?,
      repeat_job_reference = ?,
      updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  updateStatus: db.prepare(`
    UPDATE jobcards SET status = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  // Stamps the job's "Last Edited" (who/when) for an edit saved through its own
  // route rather than the job row's update — a part added/changed/removed, a worker
  // put on or taken off. Called only when something actually changed.
  touch: db.prepare(`
    UPDATE jobcards SET updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  // Files a job away (Paid – Archived). The status, the invoiced date and the remembered
  // status are written by updateStatus/setStatusBookkeeping in the same transaction.
  archive: db.prepare(`
    UPDATE jobcards SET archived = 1, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  // What rides along with a status move (see checkStatusMove in jobcard-helpers.js):
  // where the job was before Action Required / Paid – Archived, and the day the bill went out.
  setStatusBookkeeping: db.prepare(`
    UPDATE jobcards SET previous_status = ?, invoiced_date = ? WHERE id = ?
  `),

  // Un-filing returns the job to the status it had just before it was archived (the
  // route picks it — the remembered one, or Call for Payment for a job archived before
  // statuses were remembered). The invoiced date stays: the bill really went out.
  unarchive: db.prepare(`
    UPDATE jobcards SET archived = 0, status = ?, previous_status = NULL, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),

  // Printing is not an edit — deliberately does not touch updated_at, or a real
  // print would move the job in the Last Edited column and re-sort the list.
  markPrinted: db.prepare('UPDATE jobcards SET printed_at = ? WHERE id = ?'),

  delete: db.prepare('DELETE FROM jobcards WHERE id = ?')
};

// Job items queries
const jobItemQueries = {
  getById: db.prepare('SELECT * FROM job_items WHERE id = ?'),

  getByJobcard: db.prepare('SELECT * FROM job_items WHERE jobcard_id = ? ORDER BY item_number ASC'),

  // Parts whose treatments JSON mentions a supplier id — a substring pre-filter for
  // the supplier-rename cascade (suppliers.js), which parses and checks each row.
  getWithSupplierIdLike: db.prepare("SELECT id, treatments FROM job_items WHERE treatments LIKE '%' || ? || '%'"),
  updateTreatments: db.prepare('UPDATE job_items SET treatments = ? WHERE id = ?'),

  // A new part's number is the highest one this job currently holds, plus one —
  // read and acted on inside the same transaction as the insert (see the /items
  // POST route), so it can never collide with a number picked at the same moment
  // and never repeats a gap left by a deleted part (item_number is a sort order
  // the server owns; nothing renumbers on delete, so gaps are expected).
  getMaxItemNumber: db.prepare('SELECT COALESCE(MAX(item_number), 0) as maxNumber FROM job_items WHERE jobcard_id = ?'),

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
    SELECT ja.*, ${DISPLAY_NAME_SQL('u')} as user_name, u.username
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
  deleteByJobcardAndUser: db.prepare('DELETE FROM job_assignees WHERE jobcard_id = ? AND user_id = ?')
};

// Dynamic query helpers (better-sqlite3 doesn't support array params)
function getAssigneesForJobcards(jobcardIds) {
  if (jobcardIds.length === 0) return {};
  const placeholders = jobcardIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT ja.jobcard_id, ja.id, ja.user_id, ${DISPLAY_NAME_SQL('u')} as user_name, u.username
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
