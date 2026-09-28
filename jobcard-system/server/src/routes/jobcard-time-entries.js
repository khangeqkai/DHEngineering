const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireManagement, isManagement } = require('../middleware/auth');
const { validateStartTimer, validateManualTimeEntry } = require('../middleware/validation');
const { db, timeEntryQueries, jobItemQueries, userQueries, recordHistory, actorName } = require('../db/database');
const { blankEqual, diffFields } = require('../utils/historyChanges');
const { syncStatusToWork } = require('../utils/jobStatusAuto');
const { discardIfAccidentalTap } = require('../utils/startTimerUndo');
const {
  normalizeTime,
  checkEntryDuration,
  resolveItemId,
  resolveWorkerId,
  autoAssignWorker,
  isOpenTimerConflict,
  sendOpenTimerConflict,
  toBoolFlag,
  wholeQty,
  findEntryForJob,
  criticalAtFinishForWrite,
  checkCriticalInspection,
  toCamelCase
} = require('../utils/timeEntryHelpers');
const { RUN_NOT_YOURS, RUN_STILL_RUNNING, RUN_ALREADY_FILLED_IN } = require('../shared/runRefusals');

const router = express.Router();

// A run's recorded fields, as [column, trail key] — the one list the add, edit and
// delete trail entries are all built from, so a field added later can't be left out
// of one of them (the delete entry once dropped the Critical sign-off answers).
const RUN_TRAIL_FIELDS = [
  ['machine_number', 'machineNumber'],
  ['qty', 'qty'],
  ['description', 'description'],
  ['scrap_bin_qty', 'scrapBin'],
  ['scrap_recycle_qty', 'scrapRecycle'],
  ['first_off_inspection', 'firstOffInspection'],
  ['in_process_validation', 'inProcessValidation'],
  ['measuring_equipment_verification', 'measuringEquipmentVerification'],
  ['equipment_checks', 'equipmentChecks'],
  ['equipment_checks_comments', 'equipmentChecksComments'],
  ['start_time', 'startTime'],
  ['end_time', 'endTime'],
];

// The trail changes for a whole run being added (`{ from: null, to }`) or deleted
// (`{ from, to: null }`), read from its stored row. Blank fields are left out — a
// non-Critical run has no inspection answers, and "null → null" rows are only noise.
function runTrail(row, { deleted = false } = {}) {
  const changes = {};
  for (const [column, key] of RUN_TRAIL_FIELDS) {
    const value = row[column];
    if (value === null || value === undefined || value === '') continue;
    changes[key] = deleted ? { from: value, to: null } : { from: null, to: value };
  }
  return changes;
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
      // The part's permanent id — the job screen pairs the running timer to its
      // part by this, never by itemNumber (which shifts when a save renumbers).
      itemId: active.item_id,
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
    const { itemId, workerId } = req.body;

    // Decide whose timer this is. Normally it's the caller's own. An admin may
    // start a timer FOR another worker by naming them (workerId) — e.g. setting
    // someone up at a machine — so the hours land under the worker, not the admin.
    let targetWorkerId = req.user.userId;
    if (workerId && workerId !== req.user.userId) {
      if (!isManagement(req.user.role)) {
        return res.status(403).json({ error: 'Only management can start a timer for another worker' });
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
    // edited or reordered. The id is the part's identity — its item_number is only
    // a sort order the server owns, and gaps in it after a delete are expected.
    const items = jobItemQueries.getByJobcard.all(id);
    const targetItem = items.find(item => item.id === itemId);
    if (!targetItem) {
      return res.status(400).json({ error: 'That part does not exist on this job card' });
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
        null, // criticalAtFinish — no finish time yet
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
    recordHistory('jobcard', id, 'start_timer', req.user.userId, actorName(req), {
      timer: { from: null, to: startTime },
      // Named by description, not position — item_number is a sort order the
      // server owns and isn't stable enough to identify a part in the trail.
      item: { from: null, to: targetItem.description },
      ...(targetWorker ? { worker: { from: null, to: targetWorker.name || targetWorker.username } } : {}),
      ...(statusChange ? { status: statusChange } : {})
    }, null);

    // Auto-assign the worker to this job if they aren't already an assignee — recorded
    // as a self_assign when they started their own timer, otherwise as a management assign.
    autoAssignWorker(id, targetWorkerId, req.user, isSelf ? 'self_assign' : 'assign');

    res.status(201).json({
      id: entryId,
      jobcardId: id,
      userId: targetWorkerId,
      itemId: targetItem.id,
      itemNumber: targetItem.item_number,
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

    const existing = findEntryForJob(res, id, entryId);
    if (!existing) return;

    // Only the owner or an admin/manager can stop
    if (existing.user_id !== req.user.userId && !isManagement(req.user.role)) {
      return res.status(403).json({ error: 'You can only stop your own timer' });
    }

    if (existing.end_time) {
      return res.status(400).json({ error: 'Timer already stopped' });
    }

    // A start/stop tap inside seconds is an accident: discard the block and put back
    // what the Start changed, rather than logging it. See startTimerUndo.js.
    const discarded = discardIfAccidentalTap(id, existing, req.user);
    if (discarded) return res.json(discarded);

    const endTime = new Date().toISOString();
    // A stop always gives the block its FIRST finish time (it only runs on an open
    // timer, and existing.end_time is checked null just above), so this is always
    // the fresh decision, never a kept one.
    const criticalAtFinish = criticalAtFinishForWrite(id, existing, true);
    timeEntryQueries.stop.run(endTime, criticalAtFinish, entryId);

    // Recompute the job's status from the logged work (Done if fully counted), and
    // fold any change into the stop-timer entry so it reads as one event.
    const statusChange = syncStatusToWork(id, req.user);

    recordHistory('jobcard', id, 'stop_timer', req.user.userId, actorName(req), {
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

// Add time entry (admin or manager — manual time records affect labour hours and costs)
router.post('/:id/time-entries', authenticate, requireManagement, ...validateManualTimeEntry, (req, res) => {
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

    const durationError = checkEntryDuration(startTime, endTime);
    if (durationError) {
      return res.status(400).json({ error: durationError });
    }

    const { itemId, error: itemError } = resolveItemId(id, data.itemId);
    if (itemError) {
      return res.status(400).json({ error: itemError });
    }
    const itemRecord = jobItemQueries.getByJobcard.all(id).find(it => it.id === itemId);

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
    // A brand-new block (no `existing` row) that arrives already finished decides
    // critical_at_finish fresh, from today's job level — exactly like a stop.
    const criticalAtFinish = criticalAtFinishForWrite(id, null, endTime != null);
    const inspectionRefusal = checkCriticalInspection(criticalAtFinish, inspection);
    if (inspectionRefusal) {
      return res.status(400).json(inspectionRefusal);
    }

    try {
      timeEntryQueries.create.run(
        entryId,
        id,
        workerId,
        itemId,
        data.machineNumber || null,
        wholeQty(data.qty),
        data.description || null,
        startTime,
        endTime,
        criticalAtFinish,
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

    const entry = timeEntryQueries.getById.get(entryId);
    const workerRecord = userQueries.getById.get(workerId);
    const workerName = workerRecord.name || workerRecord.username;
    recordHistory('jobcard', id, 'add_time_entry', req.user.userId, actorName(req), {
      worker: { from: null, to: workerName },
      item: { from: null, to: itemRecord.description },
      ...runTrail(entry),
      ...(statusChange ? { status: statusChange } : {})
    }, { timeEntryId: entryId });

    res.status(201).json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Add time entry error');
    res.status(500).json({ error: 'Failed to add time entry' });
  }
});

// Update time entry (owner or management — a worker may write their own run only
// through its stop-timer form: filling in qty/machines/description while the run is
// still waiting for that form, or resuming the run they just stopped; correcting any
// run after that, or anyone else's, stays management-only since manual time records
// affect labour hours and costs). A worker owner can never hand-edit the start/finish
// times (only management may correct the clock) — see the role guard below.
// The refusals no retry can get past carry a code (shared/runRefusals.js), so the
// stop form can close itself on them instead of sticking.
router.put('/:id/time-entries/:entryId', authenticate, ...validateManualTimeEntry, (req, res) => {
  try {
    const { id, entryId } = req.params;
    const data = req.body;

    const existing = findEntryForJob(res, id, entryId);
    if (!existing) return;

    // Only the owner or an admin/manager may edit a time entry
    if (existing.user_id !== req.user.userId && !isManagement(req.user.role)) {
      return res.status(403).json({ error: 'You can only edit your own time entries', code: RUN_NOT_YOURS });
    }

    if (!existing.end_time) {
      return res.status(400).json({ error: 'Stop the timer before editing this entry', code: RUN_STILL_RUNNING });
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
    // Only admins/managers may set an arbitrary start/finish time (manual corrections).
    //
    // The stop-timer form's own writes (detailsConfirmed — its Save, its Resume, and
    // the resume at sign-out) carry the times as they were when the run stopped. They
    // never mean to change them, so for everyone — management included — the stored
    // start is kept, and the stored finish too unless the write is a resume. Otherwise
    // a stop form left open would put back the old times over a correction made meanwhile.
    if (data.detailsConfirmed === true) {
      startTime = existing.start_time;
      if (endTime !== null) endTime = existing.end_time;
    }
    if (!isManagement(req.user.role)) {
      startTime = existing.start_time;
      const isResuming = endTime === null;
      endTime = isResuming ? null : existing.end_time;

      // Anything but a resume is the stop form's Save, which only has a job while the
      // run is still waiting for it (the stop marks it, the Save clears it). Once filled
      // in, the pieces and the Critical sign-off answers are a record only management
      // corrects — otherwise a worker could rewrite an old run's count or sign-off by
      // sending the save straight to the server, long after the fact.
      if (!isResuming && existing.awaiting_details !== 1) {
        return res.status(403).json({
          error: 'The details of that run were already saved — ask a manager to correct them.',
          code: RUN_ALREADY_FILLED_IN
        });
      }

      // Resuming reopens a finished block — a worker may only reopen the run they
      // JUST stopped, never reach back into an older block of their own. All three
      // must hold: this is the most recently STARTED block they own (nothing else,
      // on any job, started later); it was stopped within the last 12 hours (a
      // "just stopped" run, not a wrap-up days later); and they have no other timer
      // running right now (reopening this one would give them two at once).
      if (isResuming) {
        const withinLast12h = !!existing.end_time &&
          (Date.now() - new Date(existing.end_time).getTime()) <= 12 * 60 * 60 * 1000;
        const isMostRecentStart =
          timeEntryQueries.hasLaterStartByUser.get(existing.user_id, existing.start_time).count === 0;
        const noOtherRunning = !timeEntryQueries.getActiveByUser.get(existing.user_id);
        if (!(withinLast12h && isMostRecentStart && noOtherRunning)) {
          return res.status(403).json({ error: 'Only the run you just stopped can be resumed.' });
        }
      }
    }

    // The 31-day cap catches a mistyped date on a hand-entered/edited block. It must
    // only fire when this request is actually changing the start/finish — not when
    // a worker is just filling in pieces on a long-running stopped timer whose own
    // times were reused as-is (a legitimately long-open block would otherwise block
    // every future save of it).
    const timesChanged = startTime !== existing.start_time || endTime !== existing.end_time;
    if (timesChanged) {
      const durationError = checkEntryDuration(startTime, endTime);
      if (durationError) {
        return res.status(400).json({ error: durationError });
      }
    }

    // Pieces, machines and notes: an update that leaves a field out keeps the stored
    // value. The manual edit form sends only what the manager changed, so a worker's
    // stop-form save made while that form was open isn't wiped by its old copy.
    const machineNumber = data.machineNumber !== undefined
      ? (data.machineNumber || null)
      : existing.machine_number;
    const qty = data.qty !== undefined ? wholeQty(data.qty) : existing.qty;
    const description = data.description !== undefined
      ? (data.description || null)
      : existing.description;

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

    // The run's own critical_at_finish, as it will be stored by this write: kept as
    // whatever was already there if it already had a finish time, decided fresh
    // (from today's job level) if this write is the one giving it its FIRST finish
    // time, or cleared to NULL if this write removes the finish time (a resume).
    const criticalAtFinish = criticalAtFinishForWrite(id, existing, endTime != null);

    // On a block whose run needed the Critical sign-off, all four answers must be
    // present before it can be saved finished.
    const inspectionRefusal = checkCriticalInspection(criticalAtFinish, inspection);
    if (inspectionRefusal) {
      return res.status(400).json(inspectionRefusal);
    }

    // Only management may re-credit a block to a different worker, and only when they
    // actually send a worker. A regular worker editing their own block (filling in
    // qty/description after stopping) keeps it under themselves — they can't hand it
    // away. A change to a *different* worker must be a real, active account; leaving
    // the owner unchanged is always allowed (so an old block owned by a since-
    // deactivated worker can still have its other fields corrected).
    let workerId = existing.user_id;
    if (isManagement(req.user.role) && data.workerId !== undefined &&
        String(data.workerId) !== String(existing.user_id)) {
      const resolved = resolveWorkerId(data.workerId);
      if (resolved.error) {
        return res.status(400).json({ error: resolved.error });
      }
      workerId = resolved.userId;
    }

    // Which part the block is credited to drives per-part progress, hours and the
    // job's automatic status, so — like the times and the worker above — only
    // management may move it. A worker's save keeps the stored part whatever it
    // sends (or leaves out), so it can neither re-credit the block nor detach it.
    // Management leaving the part out keeps it too.
    let itemId = existing.item_id;
    if (isManagement(req.user.role) && data.itemId !== undefined) {
      // Blank is accepted only for an old block that never had a part, so its other
      // fields stay correctable; a block with a part can't be detached from it.
      const resolvedItem = resolveItemId(id, data.itemId, { blankAllowed: !existing.item_id });
      if (resolvedItem.error) {
        return res.status(400).json({ error: resolvedItem.error });
      }
      itemId = resolvedItem.itemId;
    }

    // awaiting_details only ends the wait on the worker's own stop-timer form
    // save (detailsConfirmed, sent only by that form) or on a resume (clearing
    // the finish time of a stopped block reopens it, so there's no pending form
    // to wait on any more). A manager editing the block's other fields — or the
    // separate manual time-entry form — leaves it exactly as it was, so invoicing
    // still waits for the worker's own save.
    const isResume = !!existing.end_time && endTime === null;
    const awaitingDetails = (data.detailsConfirmed === true || isResume)
      ? 0
      : existing.awaiting_details;

    try {
      timeEntryQueries.update.run(
        workerId,
        itemId,
        machineNumber,
        qty,
        description,
        scrapBinQty,
        scrapRecycleQty,
        inspection.firstOffInspection,
        inspection.inProcessValidation,
        inspection.measuringEquipmentVerification,
        inspection.equipmentChecks,
        equipmentChecksComments,
        startTime,
        endTime,
        criticalAtFinish,
        awaitingDetails,
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

    // Build proper diff of changed fields — every recorded field, from the one list.
    const saved = {
      machine_number: machineNumber,
      qty,
      description,
      scrap_bin_qty: scrapBinQty,
      scrap_recycle_qty: scrapRecycleQty,
      first_off_inspection: inspection.firstOffInspection,
      in_process_validation: inspection.inProcessValidation,
      measuring_equipment_verification: inspection.measuringEquipmentVerification,
      equipment_checks: inspection.equipmentChecks,
      equipment_checks_comments: equipmentChecksComments,
      start_time: startTime,
      end_time: endTime
    };
    const changes = diffFields(existing, RUN_TRAIL_FIELDS.map(([column, key]) => [column, key, saved[column]]));

    // The entry's line is decided by its stable id, not its position number, so only
    // log a line change when it actually points at a different line. Named by
    // description, not number — item_number is a sort order the server owns and
    // isn't stable enough to identify a part in the trail (nothing renumbers on
    // delete, so two jobs' history could both say "part 2" about different parts).
    if (!blankEqual(itemId, existing.item_id)) {
      const jobItems = jobItemQueries.getByJobcard.all(id);
      const oldItem = jobItems.find(it => it.id === existing.item_id);
      const newItem = itemId ? jobItems.find(it => it.id === itemId) : null;
      changes.item = { from: oldItem ? oldItem.description : null, to: newItem ? newItem.description : null };
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
      recordHistory('jobcard', id, 'update_time_entry', req.user.userId, actorName(req), changes, {
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

// Delete time entry (admin or manager — manual time records affect labour hours and costs)
router.delete('/:id/time-entries/:entryId', authenticate, requireManagement, (req, res) => {
  try {
    const { id, entryId } = req.params;

    const existing = findEntryForJob(res, id, entryId);
    if (!existing) return;

    if (!existing.end_time) {
      return res.status(400).json({ error: 'Stop the timer before deleting this entry' });
    }

    // Named by description, not position — see the same note on the update route.
    const itemRecord = existing.item_id
      ? jobItemQueries.getByJobcard.all(id).find(it => it.id === existing.item_id)
      : null;

    timeEntryQueries.delete.run(entryId);

    // Removing finished pieces changes completion — recompute the job's status against the
    // post-delete state and fold any change into this deletion's history so it reads as one
    // event. Must run after the delete: isJobComplete sums the remaining blocks' pieces.
    // workRemoved: deleting the last block must still undo the Done that block caused.
    const statusChange = syncStatusToWork(id, req.user, { workRemoved: true });

    const changes = {
      timeEntryId: { from: entryId, to: null },
      worker: { from: existing.user_name, to: null },
      item: { from: itemRecord ? itemRecord.description : null, to: null },
      ...runTrail(existing, { deleted: true })
    };
    if (statusChange) changes.status = statusChange;

    recordHistory('jobcard', id, 'delete_time_entry', req.user.userId, actorName(req), changes);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete time entry error');
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

module.exports = router;
