const express = require('express');
const { db } = require('../db/connection');
const { authenticate } = require('../middleware/auth');
const { getAssigneesForJobcards } = require('../db/database');
const logger = require('../utils/logger');

const router = express.Router();
const PAGE_SIZE = 25;
const PREVIEW_LIMIT = 5;

// --- Formatters (snake_case → camelCase) ---

function formatJob(row, assignees, isAdmin) {
  return {
    id: row.id,
    jobNumber: row.job_number,
    companyName: isAdmin ? (row.stored_company_name || row.company_name) : null,
    contactName: isAdmin ? (row.stored_contact_name || row.contact_name) : null,
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

function formatContact(row) {
  return {
    id: row.id,
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
    itemNumber: row.item_number,
    machineNumber: row.machine_number,
    qty: row.qty,
    description: row.description,
    startTime: row.start_time,
    endTime: row.end_time,
    durationHours: row.duration_hours != null ? Math.round(row.duration_hours * 100) / 100 : null,
    isSpecialLabour: row.is_special_labour === 1
  };
}

// --- Route ---

router.get('/', authenticate, (req, res) => {
  try {
    const scope = req.query.scope || 'all';
    const isAdmin = req.user.role === 'admin';

    switch (scope) {
      case 'all': return searchAll(req, res, isAdmin);
      case 'jobs': return searchJobs(req, res, isAdmin);
      case 'people': {
        if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
        return searchPeople(req, res);
      }
      case 'activity': {
        if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
        return searchActivity(req, res);
      }
      case 'time': return searchTime(req, res, isAdmin);
      default: return res.status(400).json({ error: 'Invalid scope' });
    }
  } catch (err) {
    logger.error({ err }, 'Search error');
    res.status(500).json({ error: 'Search failed' });
  }
});

// --- Handlers ---

function searchAll(req, res, isAdmin) {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ groups: {} });
  const like = `%${q}%`;
  const groups = {};

  // Jobs — hide archived by default so the combined preview's count and rows match
  // the dedicated Jobs search. The combined view has its own "include archived"
  // toggle that flips this, and that choice is carried through on "see all".
  const includeArchived = req.query.includeArchived === 'true';
  const jobMatch = isAdmin
    ? '(j.job_number LIKE ? OR j.description LIKE ? OR c.company_name LIKE ? OR c.contact_name LIKE ? OR j.po_number LIKE ?)'
    : '(j.job_number LIKE ? OR j.description LIKE ?)';
  const jobWhere = includeArchived ? jobMatch : `${jobMatch} AND j.archived = 0`;
  const jobParams = isAdmin ? [like, like, like, like, like] : [like, like];
  const jobFrom = 'FROM jobcards j LEFT JOIN contacts c ON j.contact_id = c.id';

  const jobCount = db.prepare(`SELECT COUNT(*) as count ${jobFrom} WHERE ${jobWhere}`).get(...jobParams).count;
  const jobRows = db.prepare(
    `SELECT j.*, c.company_name as stored_company_name, c.contact_name as stored_contact_name ${jobFrom} WHERE ${jobWhere} ORDER BY j.created_at DESC LIMIT ?`
  ).all(...jobParams, PREVIEW_LIMIT);
  const assigneeMap = getAssigneesForJobcards(jobRows.map(j => j.id));
  groups.jobs = { count: jobCount, results: jobRows.map(j => formatJob(j, assigneeMap[j.id], isAdmin)) };

  if (isAdmin) {
    // Contacts
    const cWhere = '(company_name LIKE ? OR contact_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    groups.contacts = {
      count: db.prepare(`SELECT COUNT(*) as count FROM contacts WHERE ${cWhere}`).get(like, like, like, like).count,
      results: db.prepare(`SELECT * FROM contacts WHERE ${cWhere} ORDER BY company_name ASC LIMIT ?`).all(like, like, like, like, PREVIEW_LIMIT).map(formatContact)
    };

    // Suppliers
    const sWhere = 'active = 1 AND (name LIKE ? OR contact_name LIKE ? OR contact_phone LIKE ? OR contact_email LIKE ?)';
    groups.suppliers = {
      count: db.prepare(`SELECT COUNT(*) as count FROM suppliers WHERE ${sWhere}`).get(like, like, like, like).count,
      results: db.prepare(`SELECT * FROM suppliers WHERE ${sWhere} ORDER BY name ASC LIMIT ?`).all(like, like, like, like, PREVIEW_LIMIT).map(formatSupplier)
    };

    // Activity
    const hWhere = '(user_name LIKE ? OR entity_id LIKE ? OR changes LIKE ?)';
    groups.activity = {
      count: db.prepare(`SELECT COUNT(*) as count FROM history WHERE ${hWhere}`).get(like, like, like).count,
      results: db.prepare(`SELECT * FROM history WHERE ${hWhere} ORDER BY created_at DESC LIMIT ?`).all(like, like, like, PREVIEW_LIMIT).map(formatActivity)
    };
  }

  res.json({ groups });
}

function searchJobs(req, res, isAdmin) {
  const { q, status, assigneeId, priority, jobType, qaLevel, dateFrom, dateTo, dateField, includeArchived } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const conditions = [];
  const params = [];

  if (q) {
    const like = `%${q.trim()}%`;
    if (isAdmin) {
      conditions.push('(j.job_number LIKE ? OR j.description LIKE ? OR c.company_name LIKE ? OR c.contact_name LIKE ? OR j.po_number LIKE ?)');
      params.push(like, like, like, like, like);
    } else {
      conditions.push('(j.job_number LIKE ? OR j.description LIKE ?)');
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
  if (qaLevel) { conditions.push('j.quality_level = ?'); params.push(qaLevel); }
  if (dateFrom || dateTo) {
    const col = dateField === 'due' ? 'j.due_date' : 'j.created_at';
    if (dateFrom) { conditions.push(`${col} >= ?`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`${col} <= ?`); params.push(dateTo + 'T23:59:59'); }
  }
  if (includeArchived !== 'true') conditions.push('j.archived = 0');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = 'FROM jobcards j LEFT JOIN contacts c ON j.contact_id = c.id';
  const total = db.prepare(`SELECT COUNT(*) as count ${from} ${where}`).get(...params).count;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(
    `SELECT j.*, c.company_name as stored_company_name, c.contact_name as stored_contact_name ${from} ${where} ORDER BY j.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, PAGE_SIZE, offset);
  const assigneeMap = getAssigneesForJobcards(rows.map(j => j.id));

  res.json({ results: rows.map(j => formatJob(j, assigneeMap[j.id], isAdmin)), total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}

function searchPeople(req, res) {
  const { q, peopleType = 'both' } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const like = q ? `%${q.trim()}%` : null;
  let all = [];

  if (peopleType !== 'suppliers') {
    const cond = []; const p = [];
    if (like) { cond.push('(company_name LIKE ? OR contact_name LIKE ? OR phone LIKE ? OR email LIKE ?)'); p.push(like, like, like, like); }
    const w = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    all.push(...db.prepare(`SELECT * FROM contacts ${w} ORDER BY company_name ASC`).all(...p).map(r => ({ ...formatContact(r), type: 'contact' })));
  }
  if (peopleType !== 'contacts') {
    const cond = ['active = 1']; const p = [];
    if (like) { cond.push('(name LIKE ? OR contact_name LIKE ? OR contact_phone LIKE ? OR contact_email LIKE ?)'); p.push(like, like, like, like); }
    all.push(...db.prepare(`SELECT * FROM suppliers WHERE ${cond.join(' AND ')} ORDER BY name ASC`).all(...p).map(r => ({ ...formatSupplier(r), type: 'supplier' })));
  }

  const total = all.length;
  const offset = (page - 1) * PAGE_SIZE;
  res.json({ results: all.slice(offset, offset + PAGE_SIZE), total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}

function searchActivity(req, res) {
  const { q, userId, action, entityType, dateFrom, dateTo, field } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const conditions = [];
  const params = [];

  if (q) {
    const like = `%${q.trim()}%`;
    conditions.push('(user_name LIKE ? OR entity_id LIKE ? OR changes LIKE ?)');
    params.push(like, like, like);
  }
  if (userId) { conditions.push('user_id = ?'); params.push(userId); }
  if (action) {
    const arr = action.split(',').filter(Boolean);
    if (arr.length) { conditions.push(`action IN (${arr.map(() => '?').join(',')})`); params.push(...arr); }
  }
  if (entityType) { conditions.push('entity_type = ?'); params.push(entityType); }
  if (field) { conditions.push('changes LIKE ?'); params.push(`%"${field}"%`); }
  if (dateFrom) { conditions.push('created_at >= ?'); params.push(dateFrom); }
  if (dateTo) { conditions.push('created_at <= ?'); params.push(dateTo + 'T23:59:59'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM history ${where}`).get(...params).count;
  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(`SELECT * FROM history ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, PAGE_SIZE, offset);

  res.json({ results: rows.map(formatActivity), total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
}

function searchTime(req, res, isAdmin) {
  const { q, workerId, machineId, dateFrom, dateTo, specialOnly, jobNumber } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const conditions = [];
  const params = [];

  if (!isAdmin) { conditions.push('te.user_id = ?'); params.push(req.user.userId); }

  if (q) {
    const like = `%${q.trim()}%`;
    conditions.push('(u.name LIKE ? OR te.description LIKE ? OR ji.item_number LIKE ? OR te.machine_number LIKE ?)');
    params.push(like, like, like, like);
  }
  if (workerId) { conditions.push('te.user_id = ?'); params.push(workerId); }
  if (machineId) { conditions.push('te.machine_number = ?'); params.push(machineId); }
  if (jobNumber) { conditions.push('j.job_number LIKE ?'); params.push(`%${jobNumber.trim()}%`); }
  if (specialOnly === 'true') { conditions.push('te.is_special_labour = 1'); }
  if (dateFrom) { conditions.push('te.start_time >= ?'); params.push(dateFrom); }
  if (dateTo) { conditions.push('te.start_time <= ?'); params.push(dateTo + 'T23:59:59'); }

  const from = 'FROM time_entries te JOIN users u ON te.user_id = u.id JOIN jobcards j ON te.jobcard_id = j.id LEFT JOIN job_items ji ON te.item_id = ji.id';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) as count ${from} ${where}`).get(...params).count;
  const hoursResult = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN te.end_time IS NOT NULL THEN (julianday(te.end_time) - julianday(te.start_time)) * 24 ELSE 0 END), 0) as total_hours ${from} ${where}`
  ).get(...params);

  const offset = (page - 1) * PAGE_SIZE;
  const rows = db.prepare(
    `SELECT te.*, u.name as user_name, j.job_number, ji.item_number as item_number, CASE WHEN te.end_time IS NOT NULL THEN (julianday(te.end_time) - julianday(te.start_time)) * 24 ELSE NULL END as duration_hours ${from} ${where} ORDER BY te.start_time DESC LIMIT ? OFFSET ?`
  ).all(...params, PAGE_SIZE, offset);

  res.json({
    results: rows.map(formatTimeEntry),
    total, page, totalPages: Math.ceil(total / PAGE_SIZE),
    totalHours: Math.round(hoursResult.total_hours * 100) / 100
  });
}

module.exports = router;
