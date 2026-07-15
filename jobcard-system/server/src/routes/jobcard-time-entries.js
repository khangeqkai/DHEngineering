const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateStartTimer, validateManualTimeEntry } = require('../middleware/validation');
const { db, timeEntryQueries, jobItemQueries, jobAssigneeQueries, userQueries, recordHistory } = require('../db/database');
const { syncStatusToWork } = require('../utils/jobStatusAuto');
const {
  normalizeTime,
  resolveItemId,
  resolveWorkerId,
  autoAssignWorker,
  isOpenTimerConflict,
  sendOpenTimerConflict,
  toBoolFlag,
  checkCriticalInspection,
  toCamelCase
} = require('../utils/timeEntryHelpers');

const router = express.Router();

// A timer that ran for less than this is treated as an accidental start/stop tap:
// the block is discarded rather than logged, and the client skips the stop form.
const MIN_LOGGED_MS = 15 * 1000;

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
    const { itemNumber, workerId } = req.body;

    // Decide whose timer this is. Normally it's the caller's own. An admin may
    // start a timer FOR another worker by naming them (workerId) — e.g. setting
    // someone up at a machine — so the hours land under the worker, not the admin.
    let targetWorkerId = req.user.userId;
    if (workerId && workerId !== req.user.userId) {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only an admin can start a timer for another worker' });
      }
      const resolved = resolveWorkerId(workerId);
      if (resolved.error) {
        return res.status(400).json({ error: resolved.error });
      }
      targetWorkerId = resolved.userId;
    }
    const isSelf = targetWorkerId === req.user.userId;

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
      const active = timeEntryQueries.getActiveByUser.get(targetWorkerId);
      if (active) {
        const e = new Error('Timer already running');
        e.activeTimer = active;
        throw e;
      }
      timeEntryQueries.create.run(
        entryId,
        id,
        targetWorkerId,
        targetItem.id,
        null, // machineNumber
        null, // qty
        null, // description
        startTime,
        null, // endTime
        0,    // scrapBinQty — recorded by the worker when they stop the timer
        0,    // scrapRecycleQty
        null, // firstOffInspection — answered on the stop-timer form (Critical jobs)
        null, // inProcessValidation
        null, // measuringEquipmentVerification
        null, // equipmentChecks
        null  // equipmentChecksComments
      );
    });

    try {
      startTimer();
    } catch (e) {
      if ((e.activeTimer || isOpenTimerConflict(e)) &&
          sendOpenTimerConflict(res, targetWorkerId, e.activeTimer)) {
        return;
      }
      throw e;
    }

    // Starting work puts the job "In Progress" (or back to Done if it's already
    // fully counted). Fold any resulting status change into the start-timer entry so
    // the timeline shows one event. Never blocks the timer if it can't.
    const statusChange = syncStatusToWork(id, req.user);

    // The event is attributed to whoever pressed Start (the admin, for an on-behalf
    // start); name the worker as well when it isn't the admin's own timer, so the
    // timeline reads "started for <worker>".
    const targetWorker = isSelf ? null : userQueries.getById.get(targetWorkerId);
    recordHistory('jobcard', id, 'start_timer', req.user.userId, req.user.name || req.user.username, {
      timer: { from: null, to: startTime },
      itemNumber: { from: null, to: itemNumber },
      ...(targetWorker ? { worker: { from: null, to: targetWorker.name || targetWorker.username } } : {}),
      ...(statusChange ? { status: statusChange } : {})
    }, null);

    // Auto-assign the worker to this job if they aren't already an assignee. For a
    // self-start we record it as a self_assign; for an on-behalf start the shared
    // helper records it as an admin assign.
    if (isSelf) {
      const beforeAssignees = jobAssigneeQueries.getByJobcard.all(id);
      const alreadyAssigned = beforeAssignees.some(a => a.user_id === targetWorkerId);
      if (!alreadyAssigned) {
        try {
          jobAssigneeQueries.create.run(`assignee:${uuidv4()}`, id, targetWorkerId);
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
    } else {
      autoAssignWorker(id, targetWorkerId, req.user);
    }

    res.status(201).json({
      id: entryId,
      jobcardId: id,
      userId: targetWorkerId,
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

    if (existing.jobcard_id !== id) {
      return res.status(403).json({ error: 'Time entry does not belong to this job card' });
    }

    // Only owner or admin can stop
    if (existing.user_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only stop your own timer' });
    }

    if (existing.end_time) {
      return res.status(400).json({ error: 'Timer already stopped' });
    }

    // Accidental tap guard: a run shorter than the minimum is discarded instead of
    // logged. The block is removed and the client is told to skip the stop form.
    const ranMs = Date.now() - new Date(existing.start_time).getTime();
    if (Number.isFinite(ranMs) && ranMs < MIN_LOGGED_MS) {
      timeEntryQueries.delete.run(entryId);
      const statusChange = syncStatusToWork(id, req.user);
      recordHistory('jobcard', id, 'discard_timer', req.user.userId, req.user.name || req.user.username, {
        timer: { from: 'running', to: 'discarded (under 15s)' },
        ...(statusChange ? { status: statusChange } : {})
      }, { timeEntryId: entryId, startTime: existing.start_time });
      return res.json({ discarded: true });
    }

    const endTime = new Date().toISOString();
    timeEntryQueries.stop.run(endTime, entryId);

    // Recompute the job's status from the logged work (Done if fully counted), and
    // fold any change into the stop-timer entry so it reads as one event.
    const statusChange = syncStatusToWork(id, req.user);

    recordHistory('jobcard', id, 'stop_timer', req.user.userId, req.user.name || req.user.username, {
      endTime: { from: null, to: endTime },
      ...(statusChange ? { status: statusChange } : {})
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

    // Credit the block to the worker the admin picked, not the admin filling in the
    // form, so per-worker hours and labour reports are accurate.
    const { userId: workerId, error: workerError } = resolveWorkerId(data.workerId);
    if (workerError) {
      return res.status(400).json({ error: workerError });
    }

    const entryId = `timeentry:${uuidv4()}`;

    // Scrap is normally entered by the worker's stop-timer form, but an admin adding
    // a block by hand can record it too. Two destinations: binned and recycled.
    // Clamp blank/garbage to 0, same as the edit route.
    const scrapBinQty = Math.max(0, parseInt(data.scrapBinQty, 10) || 0);
    const scrapRecycleQty = Math.max(0, parseInt(data.scrapRecycleQty, 10) || 0);

    // Inspection checklist (Critical jobs only). On a finished block the admin must
    // answer all four, mirroring the worker's stop-timer form.
    const inspection = {
      firstOffInspection: toBoolFlag(data.firstOffInspection),
      inProcessValidation: toBoolFlag(data.inProcessValidation),
      measuringEquipmentVerification: toBoolFlag(data.measuringEquipmentVerification),
      equipmentChecks: toBoolFlag(data.equipmentChecks)
    };
    const equipmentChecksComments = data.equipmentChecksComments || null;
    const inspectionError = checkCriticalInspection(id, endTime != null, inspection);
    if (inspectionError) {
      return res.status(400).json({ error: inspectionError });
    }

    try {
      timeEntryQueries.create.run(
        entryId,
        id,
        workerId,
        itemId,
        data.machineNumber || null,
        data.qty || null,
        data.description || null,
        startTime,
        endTime,
        scrapBinQty,
        scrapRecycleQty,
        inspection.firstOffInspection,
        inspection.inProcessValidation,
        inspection.measuringEquipmentVerification,
        inspection.equipmentChecks,
        equipmentChecksComments
      );
    } catch (e) {
      // A manual block with no finish time counts as an open timer; if the credited
      // worker already has one running, the one-timer rule rejects it — tell them clearly.
      if (isOpenTimerConflict(e) && sendOpenTimerConflict(res, workerId)) return;
      throw e;
    }

    // Keep the job's assigned-people list accurate when crediting someone new.
    autoAssignWorker(id, workerId, req.user);

    // Recompute the job's status from the logged work (Done if fully counted), and
    // fold any change into the add-time-entry record so it reads as one event.
    const statusChange = syncStatusToWork(id, req.user);

    // Record the Critical-job inspection answers too (same keys/values as the edit
    // route), but only the ones actually set — a non-Critical block has all four as
    // null and would otherwise spam the log with empty "null → null" rows.
    const inspectionChanges = {};
    for (const [key, value] of [
      ['firstOffInspection', inspection.firstOffInspection],
      ['inProcessValidation', inspection.inProcessValidation],
      ['measuringEquipmentVerification', inspection.measuringEquipmentVerification],
      ['equipmentChecks', inspection.equipmentChecks],
      ['equipmentChecksComments', equipmentChecksComments],
    ]) {
      if (value !== null && value !== undefined && value !== '') {
        inspectionChanges[key] = { from: null, to: value };
      }
    }

    const workerName = userQueries.getById.get(workerId).name;
    recordHistory('jobcard', id, 'add_time_entry', req.user.userId, req.user.name || req.user.username, {
      worker: { from: null, to: workerName },
      machineNumber: { from: null, to: data.machineNumber || null },
      description: { from: null, to: data.description || null },
      scrapBin: { from: null, to: scrapBinQty },
      scrapRecycle: { from: null, to: scrapRecycleQty },
      ...inspectionChanges,
      startTime: { from: null, to: startTime },
      ...(statusChange ? { status: statusChange } : {})
    }, { timeEntryId: entryId });

    const entry = timeEntryQueries.getById.get(entryId);
    res.status(201).json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Add time entry error');
    res.status(500).json({ error: 'Failed to add time entry' });
  }
});

// Update time entry (owner or admin — a worker may edit their own record, e.g.
// filling in qty/machines/description after stopping their timer; editing anyone
// else's stays admin-only since manual time records affect labour hours and costs).
// A non-admin owner can never hand-edit the start/finish times (only an admin may
// correct the clock) — see the role guard below.
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

    // Start/finish times are the raw measurement of how long the job took and feed
    // directly into labour hours and cost, so a non-admin owner may never hand-edit
    // them — they may only fill in qty/scrap/machine/description on their own record.
    // Keep their stored start time as-is, and honour a finish-time change only when it
    // clears the field (resuming/reopening their own timer), never a different time.
    // Only admins may set an arbitrary start/finish time (manual corrections).
    if (req.user.role !== 'admin') {
      startTime = existing.start_time;
      endTime = endTime === null ? null : existing.end_time;
    }

    // Scrap comes from the worker's stop-timer form or the admin's time-entry
    // form (which has Scrap fields when editing too), split into binned and
    // recycled pieces. If an update omits a field entirely, keep the existing value.
    const scrapBinQty = data.scrapBinQty !== undefined
      ? Math.max(0, parseInt(data.scrapBinQty, 10) || 0)
      : (existing.scrap_bin_qty || 0);
    const scrapRecycleQty = data.scrapRecycleQty !== undefined
      ? Math.max(0, parseInt(data.scrapRecycleQty, 10) || 0)
      : (existing.scrap_recycle_qty || 0);

    // Inspection answers (Critical jobs). Each is kept as-is when the update omits
    // it, so an admin correcting one field never wipes the rest.
    const readFlag = (key, col) => data[key] !== undefined
      ? toBoolFlag(data[key])
      : (existing[col] != null ? existing[col] : null);
    const inspection = {
      firstOffInspection: readFlag('firstOffInspection', 'first_off_inspection'),
      inProcessValidation: readFlag('inProcessValidation', 'in_process_validation'),
      measuringEquipmentVerification: readFlag('measuringEquipmentVerification', 'measuring_equipment_verification'),
      equipmentChecks: readFlag('equipmentChecks', 'equipment_checks')
    };
    const equipmentChecksComments = data.equipmentChecksComments !== undefined
      ? (data.equipmentChecksComments || null)
      : (existing.equipment_checks_comments || null);

    // On a finished block on a Critical job, all four answers must be present.
    const inspectionError = checkCriticalInspection(id, endTime != null, inspection);
    if (inspectionError) {
      return res.status(400).json({ error: inspectionError });
    }

    // Only an admin may re-credit a block to a different worker, and only when they
    // actually send a worker. A regular worker editing their own block (filling in
    // qty/description after stopping) keeps it under themselves — they can't hand it
    // away. A change to a *different* worker must be a real, active account; leaving
    // the owner unchanged is always allowed (so an old block owned by a since-
    // deactivated worker can still have its other fields corrected).
    let workerId = existing.user_id;
    if (req.user.role === 'admin' && data.workerId !== undefined &&
        String(data.workerId) !== String(existing.user_id)) {
      const resolved = resolveWorkerId(data.workerId);
      if (resolved.error) {
        return res.status(400).json({ error: resolved.error });
      }
      workerId = resolved.userId;
    }

    const { itemId, error: itemError } = resolveItemId(id, data.itemNumber);
    if (itemError) {
      return res.status(400).json({ error: itemError });
    }

    try {
      timeEntryQueries.update.run(
        workerId,
        itemId,
        data.machineNumber || null,
        data.qty || null,
        data.description || null,
        scrapBinQty,
        scrapRecycleQty,
        inspection.firstOffInspection,
        inspection.inProcessValidation,
        inspection.measuringEquipmentVerification,
        inspection.equipmentChecks,
        equipmentChecksComments,
        startTime,
        endTime,
        entryId
      );
    } catch (e) {
      // Reopening an entry (clearing its finish time, e.g. resuming a timer) makes
      // it an open timer; if the credited worker already has one running elsewhere,
      // the one-timer rule rejects it — surface the stop & switch prompt, not a 500.
      if (isOpenTimerConflict(e) && sendOpenTimerConflict(res, workerId)) return;
      throw e;
    }

    // Keep the job's assigned-people list accurate when an admin re-credits a block
    // to someone not already on the job.
    if (workerId !== existing.user_id) {
      autoAssignWorker(id, workerId, req.user);
    }

    // Build proper diff of changed fields
    const changes = {};
    const fieldsToTrack = [
      ['machine_number', 'machineNumber', data.machineNumber || null],
      ['qty', 'qty', data.qty || null],
      ['description', 'description', data.description || null],
      ['scrap_bin_qty', 'scrapBin', scrapBinQty],
      ['scrap_recycle_qty', 'scrapRecycle', scrapRecycleQty],
      ['first_off_inspection', 'firstOffInspection', inspection.firstOffInspection],
      ['in_process_validation', 'inProcessValidation', inspection.inProcessValidation],
      ['measuring_equipment_verification', 'measuringEquipmentVerification', inspection.measuringEquipmentVerification],
      ['equipment_checks', 'equipmentChecks', inspection.equipmentChecks],
      ['equipment_checks_comments', 'equipmentChecksComments', equipmentChecksComments],
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

    // Show who the block was re-credited to, by name, when an admin changed the owner.
    if (workerId !== existing.user_id) {
      const toName = userQueries.getById.get(workerId).name;
      changes.worker = { from: existing.user_name, to: toName };
    }

    // Filling in / correcting the finished quantity changes completion — recompute
    // the job's status (Done if every line is now counted, else In Progress) and fold
    // any change into this edit's history so it reads as one event.
    const statusChange = syncStatusToWork(id, req.user);
    if (statusChange) {
      changes.status = statusChange;
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

    timeEntryQueries.delete.run(entryId);

    // Removing finished pieces changes completion — recompute the job's status (Done if
    // every line is still counted, else In Progress) against the post-delete state and fold
    // any change into this deletion's history so it reads as one event. Must run after the
    // delete: isJobComplete sums the remaining blocks' pieces, so the removed block has to be
    // gone first.
    const statusChange = syncStatusToWork(id, req.user);

    const changes = {
      timeEntryId: { from: entryId, to: null },
      machineNumber: { from: existing.machine_number, to: null },
      description: { from: existing.description, to: null },
      startTime: { from: existing.start_time, to: null }
    };
    if (statusChange) changes.status = statusChange;

    recordHistory('jobcard', id, 'delete_time_entry', req.user.userId, req.user.name || req.user.username, changes);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete time entry error');
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

module.exports = router;
