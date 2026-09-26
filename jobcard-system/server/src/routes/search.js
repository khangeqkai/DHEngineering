const express = require('express');
const { db } = require('../db/connection');
const { authenticate, isManagement } = require('../middleware/auth');
const { getAssigneesForJobcards } = require('../db/database');
const { officeTimeZone, officeDayStart, officeDayEnd } = require('../utils/officeTime');
const logger = require('../utils/logger');

const router = express.Router();
const PAGE_SIZE = 25;
const PREVIEW_LIMIT = 5;

// Turn the calendar days someone picked in the date boxes into the range of stored
// moments they mean. The picked day is the office's day, but moments are stored as UTC
// instants, so the bounds are the instants that day starts and ends at on the office
// clock — comparing the picked date as a plain string would shift the whole window by
// the office's offset (in Melbourne, "6 August" quietly returned 6 Aug 10am → 7 Aug 10am,
// dropping the morning's work and pulling in the next morning's).
// Returns nulls for anything unparseable so the filter is simply skipped.
function momentRange(dateFrom, dateTo) {
  const timeZone = officeTimeZone();
  return {
    from: dateFrom ? officeDayStart(dateFrom, timeZone) : null,
    to: dateTo ? officeDayEnd(dateTo, timeZone) : null
  };
}

// Add a date-range filter over a column holding a stored moment.
function pushMomentRange(conditions, params, column, dateFrom, dateTo) {
  const { from, to } = momentRange(dateFrom, dateTo);
  if (from) { conditions.push(`${column} >= ?`); params.push(from); }
  if (to) { conditions.push(`${column} <= ?`); params.push(to); }
}

// Escape LIKE metacharacters (% and _) in raw, user-typed text — every LIKE
// clause built from free text pairs the escaped param with `ESCAPE '\\'` on the
// SQL side, so a literal % or _ someone types can't silently widen the match
// (e.g. typing "50%" only finds jobs containing "50%", not every "500", "501", …).
function escapeLikeChars(raw) {
  return String(raw).replace(/[\\%_]/g, c => `\\${c}`);
}

// Wrap already-escaped or raw free text in wildcards for a substring LIKE.
function likeTerm(raw) {
  return `%${escapeLikeChars(raw)}%`;
}

// --- Formatters (snake_case → camelCase) ---

function formatJob(row, assignees, canManage) {
  return {
    id: row.id,
    jobNumber: row.job_number,
    companyName: canManage ? row.company_name : null,
    contactName: canManage ? row.contact_name : null,
    status: row.status,
    priority: row.priority,
    qualityLevel: row.quality_level,
    dueDate: row.due_date,
    description: row.description,
    archived: row.archived === 1,
    createdAt: row.created_at,
    assignees: (assignees || []).map(a => ({ userId: a.user_id, userName: a.user_name }))
  };
}

// A person always reads with the company they work at, and the address belongs
// to the company, so both come from the join below. A customer with nobody
// recorded there still comes back as a row, identified by the company itself.
function formatContact(row) {
  return {
    id: row.id || row.company_id,
    companyId: row.company_id,
    companyName: row.company_name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    address: row.address
  };
}

function formatSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    address: row.address
  };
}

function formatActivity(row) {
  let changes = null;
  try { changes = row.changes ? JSON.parse(row.changes) : null; } catch { /* ignore */ }
  return {
    id: row.id,
    userName: row.user_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    changes,
    createdAt: row.created_at
  };
}

function formatTimeEntry(row) {
  return {
    id: row.id,
    jobcardId: row.jobcard_id,
    jobNumber: row.job_number,
    workerName: row.user_name,
    itemNumber: row.part_position,
    machineNumber: row.machine_number,
    qty: row.qty,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    durationHours: row.duration_hours != null ? Math.round(row.duration_hours * 100) / 100 : null
  };
}

// --- Route ---

router.get('/', authenticate, (req, res) => {
  try {
    const scope = req.query.scope || 'all';
    const canManage = isManagement(req.user.role);
    // Activity results are drawn from the raw history trail, which carries pricing
    // changes — admin-only, so a manager can't read money through search.
    const isAdmin = req.user.role === 'admin';

    switch (scope) {
      case 'all': return searchAll(req, res, canManage);
      case 'jobs': return searchJobs(req, res, canManage);
      case 'people': {
        if (!canManage) return res.status(403).json({ error: 'Management only' });
        return searchPeople(req, res);
      }
      case 'activity': {
        if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
        return searchActivity(req, res);
      }
      case 'time': return searchTime(req, res, canManage);
      default: return res.status(400).json({ error: 'Invalid scope' });
    }
  } catch (err) {
    logger.error({ err }, 'Search error');
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- Handlers ---

function searchAll(req, res, canManage) {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ groups: {} });
  const like = likeTerm(q);
  const groups = {};

  // Jobs — hide archived by default so the combined preview's count and rows match
  // the dedicated Jobs search. The combined view has its own "include archived"
  // toggle that flips this, and that choice is carried through on "see all".
  const includeArchived = req.query.includeArchived === 'true';
  const jobMatch = canManage
    ? "(j.job_number LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\' OR j.company_name LIKE ? ESCAPE '\\' OR j.contact_name LIKE ? ESCAPE '\\' OR j.po_number LIKE ? ESCAPE '\\')"
    : "(j.job_number LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\')";
  const jobWhere = includeArchived ? jobMatch : `${jobMatch} AND j.archived = 0`;
  const jobParams = canManage ? [like, like, like, like, like] : [like, like];
  const jobFrom = 'FROM jobcards j';

  const jobCount = db.prepare(`SELECT COUNT(*) as count ${jobFrom} WHERE ${jobWhere}`).get(...jobParams).count;
  const jobRows = db.prepare(
    `SELECT j.* ${jobFrom} WHERE ${jobWhere} ORDER BY j.created_at DESC LIMIT ?`
  ).all(...jobParams, PREVIEW_LIMIT);
  const assigneeMap = getAssigneesForJobcards(jobRows.map(j => j.id));
  groups.jobs = { count: jobCount, results: jobRows.map(j => formatJob(j, assigneeMap[j.id], canManage)) };

  if (canManage) {
    // Contacts (archived customers are hidden from search, like suppliers)
    // LEFT JOIN from the company outwards, so a customer with nobody recorded
    // there is still findable by name.
    const cFrom = 'FROM companies co LEFT JOIN contacts c ON c.company_id = co.id AND c.archived = 0';
    const cWhere = "co.archived = 0 AND (co.name LIKE ? ESCAPE '\\' OR c.contact_name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\')";
    const cSelect = 'c.id AS id, c.contact_name, c.phone, c.email, co.id AS company_id, co.name AS company_name, co.address AS address';
    groups.contacts = {
      count: db.prepare(`SELECT COUNT(*) as count ${cFrom} WHERE ${cWhere}`).get(like, like, like, like).count,
      results: db.prepare(`SELECT ${cSelect} ${cFrom} WHERE ${cWhere} ORDER BY co.name ASC LIMIT ?`).all(like, like, like, like, PREVIEW_LIMIT).map(formatContact)
    };

    // Suppliers
    const sWhere = "active = 1 AND (name LIKE ? ESCAPE '\\' OR contact_name LIKE ? ESCAPE '\\' OR contact_phone LIKE ? ESCAPE '\\' OR contact_email LIKE ? ESCAPE '\\')";
    groups.suppliers = {
      count: db.prepare(`SELECT COUNT(*) as count FROM suppliers WHERE ${sWhere}`).get(like, like, like, like).count,
      results: db.prepare(`SELECT * FROM suppliers WHERE ${sWhere} ORDER BY name ASC LIMIT ?`).all(like, like, like, like, PREVIEW_LIMIT).map(formatSupplier)
    };
  }

  // Activity — admin only (the history trail carries pricing changes, which managers
  // are barred from seeing), so it sits outside the management block above.
  if (req.user.role === 'admin') {
    const hWhere = "(user_name LIKE ? ESCAPE '\\' OR entity_id LIKE ? ESCAPE '\\' OR changes LIKE ? ESCAPE '\\')";
    groups.activity = {
      count: db.prepare(`SELECT COUNT(*) as count FROM history WHERE ${hWhere}`).get(like, like, like).count,
      results: db.prepare(`SELECT * FROM history WHERE ${hWhere} ORDER BY created_at DESC LIMIT ?`).all(like, like, like, PREVIEW_LIMIT).map(formatActivity)
    };
  }

  res.json({ groups });
}

function searchJobs(req, res, canManage) {
  const { q, status, assigneeId, priority, jobType, qaLevelId, dateFrom, dateTo, dateField, includeArchived } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const conditions = [];
  const params = [];

  if (q) {
    const like = likeTerm(q.trim());
    if (canManage) {
      conditions.push("(j.job_number LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\' OR j.company_name LIKE ? ESCAPE '\\' OR j.contact_name LIKE ? ESCAPE '\\' OR j.po_number LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like, like);
    } else {
      conditions.push("(j.job_number LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
  }
  if (status) {
    const arr = status.split(',').filter(Boolean);
    if (arr.length) { conditions.push(`j.status IN (${arr.map(() => '?').join(',')})`); params.push(...arr); }
  }
  if (assigneeId === 'UNASSIGNED') {
    conditions.push('j.id NOT IN (SELECT jobcard_id FROM job_assignees)');
  } else if (assigneeId) {
    conditions.push('j.id IN (SELECT jobcard_id FROM job_assignees WHERE user_id = ?)');
    params.push(assigneeId);
  }
  if (priority) { conditions.push('j.priority = ?'); params.push(priority); }
  if (jobType) { conditions.push('j.id IN (SELECT jobcard_id FROM job_items WHERE job_type = ?)'); params.push(jobType); }
  // Filter by the level's permanent id, not the name snapshot copied onto the job —
  // a level renamed since the job was created would otherwise never match it.
  if (qaLevelId) { conditions.push('j.qa_level_id = ?'); params.push(qaLevelId); }
  if (dateField === 'due') {
    // A due date is a calendar day, not a moment, so it compares straight against the
    // picked day with no time-zone step.
    if (dateFrom) { conditions.push('j.due_date >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('j.due_date <= ?'); params.push(dateTo); }
  } else {
    pushMomentRange(conditions, params, 'j.created_at', dateFrom, dateTo);
  }
  if (includeArchived !== 'true') conditions.push('j.archived = 0');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = 'FROM jobcards j';
  const total = db.prepare(`SELECT COUNT(*) as count ${from} ${where}`).get(...params).count;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(
    `SELECT j.* ${from} ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, PAGE_SIZE, offset);
  const assigneeMap = getAssigneesForJobcards(rows.map(j => j.id));

  res.json({ results: rows.map(j => formatJob(j, assigneeMap[j.id], canManage)), total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}

// Both branches below select the SAME column list so they can UNION ALL into one
// paged query instead of loading every customer/contact/supplier and slicing in JS.
// sort_group keeps the combined order identical to before — every contact row (already
// sorted the way the old contacts query sorted it) ahead of every supplier row (already
// sorted the way the old suppliers query sorted it) — never interleaved by name across
// the two kinds, exactly like the two arrays that used to be concatenated. A column only
// one branch's format function reads is NULL in the other branch (e.g. `name` is a
// supplier's own name and unused by formatContact; `contact_name` is read by both, but
// means the person at the company in the contacts branch and the supplier's own contact
// person in the suppliers branch, exactly as each original query already had it).
function searchPeople(req, res) {
  const { q, peopleType = 'both' } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const like = q ? likeTerm(q.trim()) : null;

  const branches = [];

  if (peopleType !== 'suppliers') {
    let cond = 'co.archived = 0';
    const p = [];
    if (like) {
      cond += " AND (co.name LIKE ? ESCAPE '\\' OR c.contact_name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\')";
      p.push(like, like, like, like);
    }
    branches.push({
      sql: `SELECT 0 AS sort_group, co.name AS sort1, c.contact_name AS sort2, 'contact' AS type,
                   c.id AS id, c.contact_name AS contact_name, c.phone AS phone, c.email AS email,
                   co.id AS company_id, co.name AS company_name, co.address AS address,
                   NULL AS name, NULL AS contact_phone, NULL AS contact_email
            FROM companies co LEFT JOIN contacts c ON c.company_id = co.id AND c.archived = 0
            WHERE ${cond}`,
      params: p
    });
  }
  if (peopleType !== 'contacts') {
    let cond = 'active = 1';
    const p = [];
    if (like) {
      cond += " AND (name LIKE ? ESCAPE '\\' OR contact_name LIKE ? ESCAPE '\\' OR contact_phone LIKE ? ESCAPE '\\' OR contact_email LIKE ? ESCAPE '\\')";
      p.push(like, like, like, like);
    }
    branches.push({
      sql: `SELECT 1 AS sort_group, name AS sort1, NULL AS sort2, 'supplier' AS type,
                   id AS id, contact_name AS contact_name, NULL AS phone, NULL AS email,
                   NULL AS company_id, NULL AS company_name, address AS address,
                   name AS name, contact_phone AS contact_phone, contact_email AS contact_email
            FROM suppliers
            WHERE ${cond}`,
      params: p
    });
  }

  const unionSql = branches.map(b => b.sql).join(' UNION ALL ');
  const allParams = branches.flatMap(b => b.params);

  const total = db.prepare(`SELECT COUNT(*) AS count FROM (${unionSql})`).get(...allParams).count;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(
    `SELECT * FROM (${unionSql}) ORDER BY sort_group ASC, sort1 ASC, sort2 ASC LIMIT ? OFFSET ?`
  ).all(...allParams, PAGE_SIZE, offset);

  const results = rows.map(r => r.type === 'supplier'
    ? { ...formatSupplier(r), type: 'supplier' }
    : { ...formatContact(r), type: 'contact' }
  );

  res.json({ results, total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}

function searchActivity(req, res) {
  const { q, userId, action, entityType, dateFrom, dateTo, field } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const conditions = [];
  const params = [];

  if (q) {
    const like = likeTerm(q.trim());
    conditions.push("(user_name LIKE ? ESCAPE '\\' OR entity_id LIKE ? ESCAPE '\\' OR changes LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  if (userId) { conditions.push('user_id = ?'); params.push(userId); }
  if (action) {
    const arr = action.split(',').filter(Boolean);
    if (arr.length) { conditions.push(`action IN (${arr.map(() => '?').join(',')})`); params.push(...arr); }
  }
  if (entityType) { conditions.push('entity_type = ?'); params.push(entityType); }
  if (field) {
    // This is a precise field-name match, so escape LIKE metacharacters
    // (% and _) the admin might type — otherwise they widen the match.
    const escaped = escapeLikeChars(field);
    conditions.push("changes LIKE ? ESCAPE '\\'");
    params.push(`%"${escaped}"%`);
  }
  pushMomentRange(conditions, params, 'created_at', dateFrom, dateTo);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM history ${where}`).get(...params).count;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(`SELECT * FROM history ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, PAGE_SIZE, offset);

  res.json({ results: rows.map(formatActivity), total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}

function searchTime(req, res, canManage) {
  const { q, workerId, machineId, dateFrom, dateTo, jobNumber } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const conditions = [];
  const params = [];

  if (!canManage) { conditions.push('te.user_id = ?'); params.push(req.user.userId); }

  // A part's number as the job screen shows it — its place among the job's parts —
  // not the stored item_number, which is only a sort order and keeps its gaps after
  // a part is removed (item_number is unique per job, see cleanUpDuplicateItemNumbering).
  // NULL for a block logged against no part, so it never matches a typed number.
  const partPosition = '(CASE WHEN ji.id IS NOT NULL THEN (SELECT COUNT(*) FROM job_items p WHERE p.jobcard_id = ji.jobcard_id AND p.item_number <= ji.item_number) END)';

  if (q) {
    const like = likeTerm(q.trim());
    conditions.push(`(u.name LIKE ? ESCAPE '\\' OR te.description LIKE ? ESCAPE '\\' OR ${partPosition} LIKE ? ESCAPE '\\' OR te.machine_number LIKE ? ESCAPE '\\')`);
    params.push(like, like, like, like);
  }
  if (workerId) { conditions.push('te.user_id = ?'); params.push(workerId); }
  if (machineId) {
    // machine_number is a comma-joined list (e.g. "5, 9"), so an exact match
    // drops entries where this machine was used alongside others. Normalize out
    // spaces and wrap both sides in commas for a boundary-safe membership test.
    // The picked machine loses its spaces too, or "CNC 1" never matches "CNC1".
    conditions.push(`(',' || REPLACE(te.machine_number, ' ', '') || ',') LIKE ?`);
    params.push(`%,${String(machineId).replace(/ /g, '')},%`);
  }
  if (jobNumber) { conditions.push("j.job_number LIKE ? ESCAPE '\\'"); params.push(likeTerm(jobNumber.trim())); }
  pushMomentRange(conditions, params, 'te.start_time', dateFrom, dateTo);

  const from = 'FROM time_entries te JOIN users u ON te.user_id = u.id JOIN jobcards j ON te.jobcard_id = j.id LEFT JOIN job_items ji ON te.item_id = ji.id';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) as count ${from} ${where}`).get(...params).count;
  const hoursResult = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN te.end_time IS NOT NULL THEN (julianday(te.end_time) - julianday(te.start_time)) * 24 ELSE 0 END), 0) as total_hours ${from} ${where}`
  ).get(...params);

  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(
    `SELECT te.*, u.name as user_name, j.job_number, ${partPosition} as part_position, CASE WHEN te.end_time IS NOT NULL THEN (julianday(te.end_time) - julianday(te.start_time)) * 24 ELSE NULL END as duration_hours ${from} ${where} ORDER BY te.start_time DESC LIMIT ? OFFSET ?`
  ).all(...params, PAGE_SIZE, offset);

  res.json({
    results: rows.map(formatTimeEntry),
    total, page, totalPages: Math.ceil(total / PAGE_SIZE),
    totalHours: Math.round(hoursResult.total_hours * 100) / 100
  });
}

module.exports = router;
