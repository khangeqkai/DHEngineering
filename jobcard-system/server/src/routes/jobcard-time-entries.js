const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateStartTimer, validateManualTimeEntry } = require('../middleware/validation');
const { db, timeEntryQueries, jobItemQueries, jobAssigneeQueries, recordHistory } = require('../db/database');

const router = express.Router();

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
    scrapQty: e.scrap_qty != null ? e.scrap_qty : 0,
    startTime: e.start_time,
    endTime: e.end_time,
    isSpecialLabour: e.is_special_labour === 1,
    createdAt: e.created_at
  };
}

// Get user's active timer across all jobs
router.get('/active-timer', authenticate, (req, res) => {
  try {
    const active = timeEntryQueries.getActiveByUser.get(req.user.userId);
    if (!active) {
      return res.json(null);
    }
    res.json({
      id: active.id,
      jobcardId: active.jobcard_id,
      jobNumber: active.job_number,
      itemNumber: active.item_number,
      userId: active.user_id,
      userName: active.user_name,
      startTime: active.start_time
    });
  } catch (err) {
    logger.error({ err }, 'Get active timer error');
    res.status(500).json({ error: 'Failed to get active timer' });
  }
});

// Start timer (create entry with start_time only)
router.post('/:id/time-entries/start', authenticate, ...validateStartTimer, (req, res) => {
  try {
    const { id } = req.params;
    const { itemNumber } = req.body;

    // Verify the item exists on this jobcard, and bind the timer to the line's
    // stable id so it keeps pointing at the same line even if the lines are later
    // edited or reordered.
    const items = jobItemQueries.getByJobcard.all(id);
    const targetItem = items.find(item => item.item_number === itemNumber);
    if (!targetItem) {
      return res.status(400).json({ error: `Item #${itemNumber} does not exist on this job card` });
    }

    const entryId = `timeentry:${uuidv4()}`;
    const startTime = new Date().toISOString();

    // Check-for-existing + insert as one all-or-nothing step. The partial unique
    // index (one open timer per user) is the real guard against a double-tap or
    // two devices slipping a second timer through; the transaction keeps the
    // check and insert atomic.
    const startTimer = db.transaction(() => {
      const active = timeEntryQueries.getActiveByUser.get(req.user.userId);
      if (active) {
        const e = new Error('Timer already running');
        e.activeTimer = active;
        throw e;
      }
      timeEntryQueries.create.run(
        entryId,
        id,
        req.user.userId,
        targetItem.id,
        null, // machineNumber
        null, // qty
        null, // description
        startTime,
        null, // endTime
        0     // scrapQty — recorded by the worker when they stop the timer
      );
    });

    try {
      startTimer();
    } catch (e) {
      if ((e.activeTimer || isOpenTimerConflict(e)) &&
          sendOpenTimerConflict(res, req.user.userId, e.activeTimer)) {
        return;
      }
      throw e;
    }

    recordHistory('jobcard', id, 'start_timer', req.user.userId, req.user.name || req.user.username, {
      timer: { from: null, to: startTime },
      itemNumber: { from: null, to: itemNumber }
    }, null);

    // Auto-assign the user to this job if they aren't already an assignee
    const beforeAssignees = jobAssigneeQueries.getByJobcard.all(id);
    const alreadyAssigned = beforeAssignees.some(a => a.user_id === req.user.userId);
    if (!alreadyAssigned) {
      try {
        jobAssigneeQueries.create.run(`assignee:${uuidv4()}`, id, req.user.userId);
        const afterAssignees = jobAssigneeQueries.getByJobcard.all(id);
        const fromNames = beforeAssignees.map(a => a.user_name).join(', ') || 'none';
        const toNames = afterAssignees.map(a => a.user_name).join(', ') || 'none';
        recordHistory('jobcard', id, 'self_assign', req.user.userId, req.user.name || req.user.username, {
          assignees: { from: fromNames, to: toNames }
        });
      } catch (e) {
        if (!e || e.code !== 'SQLITE_CONSTRAINT_UNIQUE') {
          logger.error({ err: e }, 'Auto-assign on start timer failed');
        }
      }
    }

    res.status(201).json({
      id: entryId,
      jobcardId: id,
      itemNumber,
      startTime
    });
  } catch (err) {
    logger.error({ err }, 'Start timer error');
    res.status(500).json({ error: 'Failed to start timer' });
  }
});

// Stop timer
router.post('/:id/time-entries/:entryId/stop', authenticate, (req, res) => {
  try {
    const { id, entryId } = req.params;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    // Only owner or admin can stop
    if (existing.user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only stop your own timer' });
    }

    if (existing.end_time) {
      return res.status(400).json({ error: 'Timer already stopped' });
    }

    const endTime = new Date().toISOString();
    timeEntryQueries.stop.run(endTime, entryId);

    recordHistory('jobcard', id, 'stop_timer', req.user.userId, req.user.name || req.user.username, {
      endTime: { from: null, to: endTime }
    }, { timeEntryId: entryId, startTime: existing.start_time });

    const entry = timeEntryQueries.getById.get(entryId);
    res.json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Stop timer error');
    res.status(500).json({ error: 'Failed to stop timer' });
  }
});

// Get job card time entries
router.get('/:id/time-entries', authenticate, (req, res) => {
  try {
    const entries = timeEntryQueries.getByJobcard.all(req.params.id);
    res.json(entries.map(toCamelCase));
  } catch (err) {
    logger.error({ err }, 'Get time entries error');
    res.status(500).json({ error: 'Failed to get time entries' });
  }
});

// Add time entry (admin only — manual time records affect labour hours and costs)
router.post('/:id/time-entries', authenticate, requireAdmin, ...validateManualTimeEntry, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    let startTime, endTime;
    try {
      startTime = normalizeTime(data.startTime);
      endTime = normalizeTime(data.endTime);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid start or finish time' });
    }

    const { itemId, error: itemError } = resolveItemId(id, data.itemNumber);
    if (itemError) {
      return res.status(400).json({ error: itemError });
    }

    const entryId = `timeentry:${uuidv4()}`;

    // Scrap is normally entered by the worker's stop-timer form, but an admin adding
    // a block by hand can record it too. Clamp blank/garbage to 0, same as the edit route.
    const scrapQty = Math.max(0, parseInt(data.scrapQty, 10) || 0);

    try {
      timeEntryQueries.create.run(
        entryId,
        id,
        req.user.userId,
        itemId,
        data.machineNumber || null,
        data.qty || null,
        data.description || null,
        startTime,
        endTime,
        scrapQty
      );
    } catch (e) {
      // A manual block with no finish time counts as an open timer; if this admin
      // already has one running, the one-timer rule rejects it — tell them clearly.
      if (isOpenTimerConflict(e) && sendOpenTimerConflict(res, req.user.userId)) return;
      throw e;
    }

    recordHistory('jobcard', id, 'add_time_entry', req.user.userId, req.user.name || req.user.username, {
      timeEntryId: { from: null, to: entryId },
      machineNumber: { from: null, to: data.machineNumber || null },
      description: { from: null, to: data.description || null },
      scrapQty: { from: null, to: scrapQty },
      startTime: { from: null, to: startTime }
    });

    const entry = timeEntryQueries.getById.get(entryId);
    res.status(201).json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Add time entry error');
    res.status(500).json({ error: 'Failed to add time entry' });
  }
});

// Update time entry (owner or admin — a worker may edit their own record, e.g.
// filling in qty/machines/description after stopping their timer; editing anyone
// else's stays admin-only since manual time records affect labour hours and costs)
router.put('/:id/time-entries/:entryId', authenticate, ...validateManualTimeEntry, (req, res) => {
  try {
    const { id, entryId } = req.params;
    const data = req.body;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    if (existing.jobcard_id !== id) {
      return res.status(403).json({ error: 'Time entry does not belong to this job card' });
    }

    // Only the owner or an admin may edit a time entry
    if (existing.user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own time entries' });
    }

    if (!existing.end_time) {
      return res.status(400).json({ error: 'Stop the timer before editing this entry' });
    }

    let startTime, endTime;
    try {
      startTime = normalizeTime(data.startTime);
      endTime = normalizeTime(data.endTime);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid start or finish time' });
    }

    // Scrap comes from the worker's stop-timer form or the admin's time-entry
    // form (which has a Scrap field when editing too). If an update omits it
    // entirely, keep the existing value.
    const scrapQty = data.scrapQty !== undefined
      ? Math.max(0, parseInt(data.scrapQty, 10) || 0)
      : (existing.scrap_qty || 0);

    const { itemId, error: itemError } = resolveItemId(id, data.itemNumber);
    if (itemError) {
      return res.status(400).json({ error: itemError });
    }

    try {
      timeEntryQueries.update.run(
        itemId,
        data.machineNumber || null,
        data.qty || null,
        data.description || null,
        scrapQty,
        startTime,
        endTime,
        entryId
      );
    } catch (e) {
      // Reopening an entry (clearing its finish time, e.g. resuming a timer) makes
      // it an open timer; if the user already has one running elsewhere, the
      // one-timer rule rejects it — surface the stop & switch prompt, not a 500.
      if (isOpenTimerConflict(e) && sendOpenTimerConflict(res, existing.user_id)) return;
      throw e;
    }

    // Build proper diff of changed fields
    const changes = {};
    const fieldsToTrack = [
      ['machine_number', 'machineNumber', data.machineNumber || null],
      ['qty', 'qty', data.qty || null],
      ['description', 'description', data.description || null],
      ['scrap_qty', 'scrapQty', scrapQty],
      ['start_time', 'startTime', startTime],
      ['end_time', 'endTime', endTime],
    ];
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    for (const [dbField, changeKey, newValue] of fieldsToTrack) {
      if (normalizeEmpty(newValue) !== normalizeEmpty(existing[dbField])) {
        changes[changeKey] = { from: existing[dbField], to: newValue };
      }
    }

    // The entry's line is decided by its stable id, not its position number, so only
    // log a line change when it actually points at a different line. Display the
    // human-friendly position numbers (old → new) so the activity log stays readable.
    if (normalizeEmpty(itemId) !== normalizeEmpty(existing.item_id)) {
      changes.itemNumber = { from: existing.item_number, to: data.itemNumber || null };
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update_time_entry', req.user.userId, req.user.name || req.user.username, changes, {
        timeEntryId: entryId
      });
    }

    const entry = timeEntryQueries.getById.get(entryId);
    res.json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Update time entry error');
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Toggle special labour flag (admin only — costing concept)
router.patch('/:id/time-entries/:entryId/toggle-special', authenticate, requireAdmin, (req, res) => {
  try {
    const { id, entryId } = req.params;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    if (existing.jobcard_id !== id) {
      return res.status(403).json({ error: 'Time entry does not belong to this job card' });
    }

    if (!existing.end_time) {
      return res.status(400).json({ error: 'Cannot mark active entry as special labour' });
    }

    const newValue = existing.is_special_labour === 1 ? 0 : 1;
    timeEntryQueries.toggleSpecialLabour.run(newValue, entryId);

    recordHistory('jobcard', id, 'update_time_entry', req.user.userId, req.user.name || req.user.username, {
      isSpecialLabour: { from: existing.is_special_labour, to: newValue }
    }, { timeEntryId: entryId });

    const entry = timeEntryQueries.getById.get(entryId);
    res.json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Toggle special labour error');
    res.status(500).json({ error: 'Failed to toggle special labour' });
  }
});

// Delete time entry (admin only — manual time records affect labour hours and costs)
router.delete('/:id/time-entries/:entryId', authenticate, requireAdmin, (req, res) => {
  try {
    const { id, entryId } = req.params;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    if (!existing.end_time) {
      return res.status(400).json({ error: 'Stop the timer before deleting this entry' });
    }

    recordHistory('jobcard', id, 'delete_time_entry', req.user.userId, req.user.name || req.user.username, {
      timeEntryId: { from: entryId, to: null },
      machineNumber: { from: existing.machine_number, to: null },
      description: { from: existing.description, to: null },
      startTime: { from: existing.start_time, to: null }
    });

    timeEntryQueries.delete.run(entryId);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete time entry error');
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

module.exports = router;
