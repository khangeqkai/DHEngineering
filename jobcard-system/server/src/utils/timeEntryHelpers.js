const { v4: uuidv4 } = require('uuid');

const logger = require('./logger');
const { db, timeEntryQueries, jobItemQueries, jobAssigneeQueries, userQueries, recordHistory } = require('../db/database');

// Normalise a hand-entered time into a full ISO timestamp with time zone, so
// every stored time block is in the same format (a block's start and finish can
// never end up in mismatched formats, which would mis-calculate its duration).
// Throws on an unparseable non-empty value so the caller can return a 400.
function normalizeTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    const err = new Error('Invalid time value');
    err.isBadTime = true;
    throw err;
  }
  return d.toISOString();
}

// Resolve a line's position number to its stable id for the given job card, so a
// manually entered or edited time record links to the line itself (and follows it
// through later edits), not to a fragile position number. Returns { itemId: null }
// when no line number was given (a record may legitimately have no line), but
// returns { error } when a number WAS typed that matches no current line — so a
// manual record can never silently attach to nothing.
function resolveItemId(jobcardId, itemNumber) {
  if (itemNumber === null || itemNumber === undefined || itemNumber === '') {
    return { itemId: null };
  }
  const num = parseInt(itemNumber, 10);
  const match = isNaN(num)
    ? undefined
    : jobItemQueries.getByJobcard.all(jobcardId).find(it => it.item_number === num);
  if (!match) {
    return { error: `Item #${itemNumber} does not exist on this job card` };
  }
  return { itemId: match.id };
}

// Resolve the worker a hand-entered time block should be credited to. An admin
// adding/editing a block by hand picks who actually did the work, so the hours
// land under the right person (not under the admin filling in the form). Returns
// { userId } for a real, active worker, or { error } otherwise.
function resolveWorkerId(workerId) {
  if (workerId === null || workerId === undefined || workerId === '') {
    return { error: 'Please choose the worker who did this work' };
  }
  const user = userQueries.getById.get(workerId);
  if (!user) {
    return { error: 'That worker does not exist' };
  }
  if (!(user.active === 1 || user.active === true)) {
    return { error: 'That worker is no longer active' };
  }
  return { userId: user.id };
}

// Add the credited worker to this job's assigned list if they aren't already on
// it, mirroring what happens when a worker starts their own timer. Fire-and-forget
// (logged, never blocks the time entry). Logs the assignment to history.
function autoAssignWorker(jobcardId, workerId, actor) {
  const before = jobAssigneeQueries.getByJobcard.all(jobcardId);
  if (before.some(a => a.user_id === workerId)) return;
  try {
    jobAssigneeQueries.create.run(`assignee:${uuidv4()}`, jobcardId, workerId);
    const after = jobAssigneeQueries.getByJobcard.all(jobcardId);
    const fromNames = before.map(a => a.user_name).join(', ') || 'none';
    const toNames = after.map(a => a.user_name).join(', ') || 'none';
    recordHistory('jobcard', jobcardId, 'assign', actor.userId, actor.name || actor.username, {
      assignees: { from: fromNames, to: toNames }
    });
  } catch (e) {
    if (!e || e.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
      logger.error({ err: e }, 'Auto-assign on manual time entry failed');
    }
  }
}

// True when an error is the database rejecting a second open timer for one user
// (the partial unique index idx_time_entries_one_active).
function isOpenTimerConflict(e) {
  return !!(e && typeof e.code === 'string' && e.code.startsWith('SQLITE_CONSTRAINT'));
}

// Send the standard "you already have a timer running" 409 from the user's
// current open timer, so the screen can offer to stop & switch instead of
// showing a generic failure. Returns true if it sent a response.
function sendOpenTimerConflict(res, userId, knownActive) {
  const active = knownActive || timeEntryQueries.getActiveByUser.get(userId);
  if (!active) return false;
  res.status(409).json({
    error: 'Timer running on another job',
    activeTimer: {
      id: active.id,
      jobcardId: active.jobcard_id,
      jobNumber: active.job_number,
      itemNumber: active.item_number,
      startTime: active.start_time
    }
  });
  return true;
}

// Read a yes/no inspection answer from a request body into the stored form
// (1 = yes, 0 = no, null = not answered). Accepts booleans, 0/1, or yes/no strings.
function toBoolFlag(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v === true || v === 1 || v === '1' || v === 'yes' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'no' || v === 'false') return 0;
  return null;
}

// Turn a stored 1/0/null inspection flag into true/false/null for the client.
function flagToBool(v) {
  return v == null ? null : v === 1;
}

const qualityLevelOfJob = db.prepare('SELECT quality_level FROM jobcards WHERE id = ?');

// A job sits on the Critical quality level when its stored label is 'CRITICAL'.
// Only those jobs ask the worker the extra inspection checklist on finishing.
function isCriticalJob(jobcardId) {
  const row = qualityLevelOfJob.get(jobcardId);
  return !!row && String(row.quality_level || '').toUpperCase() === 'CRITICAL';
}

// On a Critical job, a finished time block must carry all four inspection answers.
// `completed` is whether the block has a finish time (an open timer hasn't been
// answered yet, so it's never blocked). Returns an error string, or null if fine.
function checkCriticalInspection(jobcardId, completed, flags) {
  if (!completed || !isCriticalJob(jobcardId)) return null;
  const missing = [flags.firstOffInspection, flags.inProcessValidation,
    flags.measuringEquipmentVerification, flags.equipmentChecks]
    .some(v => v === null || v === undefined);
  if (missing) {
    return 'This is a Critical job — please answer all the inspection checks (first-off, in-process, measuring equipment, and equipment) before saving.';
  }
  return null;
}

// Convert database row (snake_case) to API response (camelCase)
function toCamelCase(e) {
  return {
    id: e.id,
    userId: e.user_id,
    jobcardId: e.jobcard_id,
    userName: e.user_name,
    itemNumber: e.item_number,
    machineNumber: e.machine_number,
    qty: e.qty,
    description: e.description,
    scrapBinQty: e.scrap_bin_qty != null ? e.scrap_bin_qty : 0,
    scrapRecycleQty: e.scrap_recycle_qty != null ? e.scrap_recycle_qty : 0,
    firstOffInspection: flagToBool(e.first_off_inspection),
    inProcessValidation: flagToBool(e.in_process_validation),
    measuringEquipmentVerification: flagToBool(e.measuring_equipment_verification),
    equipmentChecks: flagToBool(e.equipment_checks),
    equipmentChecksComments: e.equipment_checks_comments || null,
    startTime: e.start_time,
    endTime: e.end_time,
    createdAt: e.created_at
  };
}

module.exports = {
  normalizeTime,
  resolveItemId,
  resolveWorkerId,
  autoAssignWorker,
  isOpenTimerConflict,
  sendOpenTimerConflict,
  toBoolFlag,
  flagToBool,
  isCriticalJob,
  checkCriticalInspection,
  toCamelCase
};
