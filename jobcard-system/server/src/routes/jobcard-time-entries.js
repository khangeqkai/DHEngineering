const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateStartTimer, validateManualTimeEntry } = require('../middleware/validation');
const { timeEntryQueries, jobItemQueries, jobAssigneeQueries, recordHistory } = require('../db/database');

const router = express.Router();

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

    // Verify the item exists on this jobcard
    const items = jobItemQueries.getByJobcard.all(id);
    const itemExists = items.some(item => item.item_number === itemNumber);
    if (!itemExists) {
      return res.status(400).json({ error: `Item #${itemNumber} does not exist on this job card` });
    }

    // Check for existing active timer
    const active = timeEntryQueries.getActiveByUser.get(req.user.userId);
    if (active) {
      return res.status(409).json({
        error: 'Timer running on another job',
        activeTimer: {
          id: active.id,
          jobcardId: active.jobcard_id,
          jobNumber: active.job_number,
          itemNumber: active.item_number,
          startTime: active.start_time
        }
      });
    }

    const entryId = `timeentry:${uuidv4()}`;
    const startTime = new Date().toISOString();

    timeEntryQueries.create.run(
      entryId,
      id,
      req.user.userId,
      itemNumber,
      null, // machineNumber
      null, // qty
      null, // description
      startTime,
      null  // endTime
    );

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

// Add time entry
router.post('/:id/time-entries', authenticate, ...validateManualTimeEntry, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const entryId = `timeentry:${uuidv4()}`;

    timeEntryQueries.create.run(
      entryId,
      id,
      req.user.userId,
      data.itemNumber || null,
      data.machineNumber || null,
      data.qty || null,
      data.description || null,
      data.startTime,
      data.endTime || null
    );

    recordHistory('jobcard', id, 'add_time_entry', req.user.userId, req.user.name || req.user.username, {
      timeEntryId: { from: null, to: entryId },
      machineNumber: { from: null, to: data.machineNumber || null },
      description: { from: null, to: data.description || null },
      startTime: { from: null, to: data.startTime }
    });

    const entry = timeEntryQueries.getById.get(entryId);
    res.status(201).json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Add time entry error');
    res.status(500).json({ error: 'Failed to add time entry' });
  }
});

// Update time entry
router.put('/:id/time-entries/:entryId', authenticate, ...validateManualTimeEntry, (req, res) => {
  try {
    const { id, entryId } = req.params;
    const data = req.body;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    timeEntryQueries.update.run(
      data.itemNumber || null,
      data.machineNumber || null,
      data.qty || null,
      data.description || null,
      data.startTime,
      data.endTime || null,
      entryId
    );

    // Build proper diff of changed fields
    const changes = {};
    const fieldsToTrack = [
      ['item_number', 'itemNumber', data.itemNumber || null],
      ['machine_number', 'machineNumber', data.machineNumber || null],
      ['qty', 'qty', data.qty || null],
      ['description', 'description', data.description || null],
      ['start_time', 'startTime', data.startTime],
      ['end_time', 'endTime', data.endTime || null],
    ];
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    for (const [dbField, changeKey, newValue] of fieldsToTrack) {
      if (normalizeEmpty(newValue) !== normalizeEmpty(existing[dbField])) {
        changes[changeKey] = { from: existing[dbField], to: newValue };
      }
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

// Delete time entry
router.delete('/:id/time-entries/:entryId', authenticate, (req, res) => {
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
