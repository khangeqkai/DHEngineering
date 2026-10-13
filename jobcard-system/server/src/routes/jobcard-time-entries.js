const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireManagement, isManagement } = require('../middleware/auth');
const { validateStartTimer, validateConfirmFinish, validateManualTimeEntry, validateTimeEntryEdit } = require('../middleware/validation');
const { db, timeEntryQueries, jobcardQueries, jobItemQueries, userQueries, recordHistory, actorName } = require('../db/database');
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
const {
  RUN_NOT_YOURS, RUN_STILL_RUNNING, RUN_ALREADY_FILLED_IN, FINISH_ALREADY_CONFIRMED, FINISH_UNCONFIRMED, RUN_STOPPED_ITSELF,
  RESTART_REFUSED, RESUME_AFTER_HOURS, FINISH_CHANGED
} = require('../shared/runRefusals');
const { readOpeningRules, nextOpening, officeDayEndAfter } = require('../utils/openingHours');
const { checkFinishAnswer, CARRIED_ON_GAP_MS } = require('../shared/finishAnswer');
const { cutIsDue } = require('../utils/timerPause');

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

// The ceiling on when a worker can say they finished, for a clock that stopped itself: the
// start of the first opening on a LATER office day than the one it stopped on (by then they
// would have been on a new clock), in ms, or null when there is none. It is the next DAY, not
// the next opening, because a grid can open and close inside one day (normal, overtime,
// normal again) and a clock cut at the first close must still be able to say it ran on to
// the end of that day. "Not in the future" is judged separately, at the moment of the answer.
// The rules are passed in so a caller with several rows reads them once.
function finishCeilingMs(row, rules) {
  const stoppedMs = Math.max(Date.parse(row.end_time), Date.parse(row.start_time));
  return nextOpening(officeDayEndAfter(stoppedMs, rules), rules);
}

// The refusal for an answer about a clock that no longer waits for one. It says who settled
// it — the worker's own earlier answer (finish_confirmed_at is stamped only by that) or the
// office (a management save or reopen) — and the finish now stored, so the screen can tell a
// repeated press from an answer that was not kept.
function alreadyConfirmedRefusal(row) {
  return {
    error: 'This clock has already been confirmed.',
    code: FINISH_ALREADY_CONFIRMED,
    settledBy: row.finish_confirmed_at ? 'worker' : 'office',
    endTime: row.end_time
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

// The caller's own clocks that stopped themselves and still await their answer about when
// they really finished, oldest first. Defined before the '/:id' routes so it isn't
// captured by them.
router.get('/unconfirmed-finish', authenticate, (req, res) => {
  try {
    const rows = timeEntryQueries.getUnconfirmedByUser.all(req.user.userId);
    const rules = rows.length > 0 ? readOpeningRules() : null;
    res.json(rows.map(row => {
      const ceiling = finishCeilingMs(row, rules);
      return {
        id: row.id,
        jobcardId: row.jobcard_id,
        jobNumber: row.job_number,
        itemId: row.item_id,
        itemNumber: row.item_number,
        startTime: row.start_time,
        endTime: row.end_time,
        finishKnown: row.end_time !== row.start_time,
        // The next opening after the stop, or null — the screen adds "not in the future" itself.
        latestFinish: ceiling === null ? null : new Date(ceiling).toISOString()
      };
    }));
  } catch (err) {
    logger.error({ err }, 'Get unconfirmed finishes error');
    res.status(500).json({ error: 'Failed to get unconfirmed clocks' });
  }
});

// The caller's own finished blocks whose stop form is still waiting for a save (the worker
// signed out instead), oldest first — every such block, whether the worker stopped it
// themselves or answered the forgotten-clock question and left the form. Offered again
// until saved, whatever the description says; a block drops out when the worker's own
// save clears its awaiting-details mark. Each is shaped exactly like the entry
// confirm-finish returns, plus the job number.
router.get('/unfilled-stop-forms', authenticate, (req, res) => {
  try {
    const rows = timeEntryQueries.getUnfilledStopFormsByUser.all(req.user.userId);
    res.json(rows.map(row => ({ ...toCamelCase(row), jobNumber: row.job_number })));
  } catch (err) {
    logger.error({ err }, 'Get unfilled stop forms error');
    res.status(500).json({ error: 'Failed to get unfilled stop forms' });
  }
});

// The refusal for a worker who still owes an answer about a clock that stopped itself,
// worded for the office (it names the worker).
function unconfirmedRefusalFor(userId) {
  const owner = userQueries.getById.get(userId);
  return {
    error: `${owner.name || owner.username} has to confirm when their last clock finished first.`,
    code: FINISH_UNCONFIRMED
  };
}

// The core of starting a clock, shared by the Start route and a "still working" answer
// (confirm-finish): insert the open row for a worker on a part of a job. Check-for-existing +
// insert as one all-or-nothing step. The partial unique index (one open timer per user) is
// the real guard against a double-tap or two devices slipping a second timer through; the
// transaction keeps the check and insert atomic (and nests as a savepoint inside a caller's
// own transaction). Throws when the worker already has a clock open (e.activeTimer, or the
// index's own error). continuesRun marks a clock started by a "still working" answer.
function insertOpenClock(jobcardId, workerId, item, continuesRun) {
  const entryId = `timeentry:${uuidv4()}`;
  const startTime = new Date().toISOString();
  db.transaction(() => {
    const active = timeEntryQueries.getActiveByUser.get(workerId);
    if (active) {
      const e = new Error('Timer already running');
      e.activeTimer = active;
      throw e;
    }
    timeEntryQueries.create.run(
      entryId,
      jobcardId,
      workerId,
      item.id,
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
    if (continuesRun) timeEntryQueries.markContinuesRun.run(entryId);
  })();
  return { entryId, startTime };
}

// Everything a start does once its row exists, and the shape it answers with. `req` carries
// the actor (whoever pressed the button); isSelf is whether the clock is the actor's own.
function afterClockStarted(jobcardId, workerId, item, startTime, req, isSelf, entryId) {
  // Starting work puts the job "In Progress" (or back to Done if it's already
  // fully counted). Fold any resulting status change into the start-timer entry so
  // the timeline shows one event. Never blocks the timer if it can't.
  const statusChange = syncStatusToWork(jobcardId, req.user);

  // The event is attributed to whoever pressed Start (the admin, for an on-behalf
  // start); name the worker as well when it isn't the admin's own timer, so the
  // timeline reads "started for <worker>".
  const targetWorker = isSelf ? null : userQueries.getById.get(workerId);
  recordHistory('jobcard', jobcardId, 'start_timer', req.user.userId, actorName(req), {
    timer: { from: null, to: startTime },
    // Named by description, not position — item_number is a sort order the
    // server owns and isn't stable enough to identify a part in the trail.
    item: { from: null, to: item.description },
    ...(targetWorker ? { worker: { from: null, to: targetWorker.name || targetWorker.username } } : {}),
    ...(statusChange ? { status: statusChange } : {})
  }, null);

  // Auto-assign the worker to this job if they aren't already an assignee — recorded
  // as a self_assign when they started their own timer, otherwise as a management assign.
  autoAssignWorker(jobcardId, workerId, req.user, isSelf ? 'self_assign' : 'assign');

  return {
    id: entryId,
    jobcardId,
    userId: workerId,
    itemId: item.id,
    itemNumber: item.item_number,
    startTime
  };
}

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

    // A worker who still owes an answer about a clock that stopped itself can't start
    // another until they give it. Refused before any write.
    if (timeEntryQueries.countUnconfirmedByUser.get(targetWorkerId).count > 0) {
      return res.status(409).json(isSelf
        ? { error: 'Answer the question about your last clock first.', code: FINISH_UNCONFIRMED }
        : unconfirmedRefusalFor(targetWorkerId));
    }

    // Verify the item exists on this jobcard, and bind the timer to the line's
    // stable id so it keeps pointing at the same line even if the lines are later
    // edited or reordered. The id is the part's identity — its item_number is only
    // a sort order the server owns, and gaps in it after a delete are expected.
    const items = jobItemQueries.getByJobcard.all(id);
    const targetItem = items.find(item => item.id === itemId);
    if (!targetItem) {
      return res.status(400).json({ error: 'That part does not exist on this job card' });
    }

    let started;
    try {
      started = insertOpenClock(id, targetWorkerId, targetItem, false);
    } catch (e) {
      if ((e.activeTimer || isOpenTimerConflict(e)) &&
          sendOpenTimerConflict(res, targetWorkerId, e.activeTimer)) {
        return;
      }
      throw e;
    }

    res.status(201).json(afterClockStarted(id, targetWorkerId, targetItem, started.startTime, req, isSelf, started.entryId));
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
      if (existing.finish_unconfirmed === 1) {
        const error = existing.user_id === req.user.userId
          ? 'Your clock had already stopped by itself.'
          : `That clock had already stopped by itself. ${existing.user_name} needs to confirm when they finished.`;
        return res.status(409).json({ error, code: RUN_STOPPED_ITSELF });
      }
      return res.status(400).json({ error: 'Timer already stopped' });
    }

    // A start/stop tap inside seconds is an accident: discard the block and put back
    // what the Start changed, rather than logging it. See startTimerUndo.js.
    // A clock started by a "still working" answer is exempt: it continues work the worker
    // just said was still going, so a quick stop is a real (if short) stretch of work, and
    // discarding it would skip the stop form — and with it the Critical sign-off that
    // stretch of work always has to be asked for.
    const discarded = existing.continues_run === 1 ? null : discardIfAccidentalTap(id, existing, req.user);
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

    // The office can't open a clock by hand for a worker who still owes an answer about a
    // clock that stopped itself (the same rule the worker's own Start follows).
    if (endTime == null && timeEntryQueries.countUnconfirmedByUser.get(workerId).count > 0) {
      return res.status(409).json(unconfirmedRefusalFor(workerId));
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
      db.transaction(() => {
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
      // A block the office adds with no finish is hand-entered open time: the roll never cuts it.
      if (endTime == null) timeEntryQueries.markAutoStopExempt.run(entryId);
      })();
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
router.put('/:id/time-entries/:entryId', authenticate, ...validateTimeEntryEdit, (req, res) => {
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

    // A time left out keeps the stored one, like every other field of an edit: the manual
    // edit form sends a start or finish only when the manager changed it, so a form opened
    // before the worker answered "when did you finish?" (or before another correction)
    // can't put the old time back. A finish sent blank is a resume, not "left out".
    let startTime, endTime;
    try {
      startTime = data.startTime !== undefined ? normalizeTime(data.startTime) : existing.start_time;
      endTime = data.endTime !== undefined ? normalizeTime(data.endTime) : existing.end_time;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid start or finish time' });
    }

    // Every hand edit that sends a finish (typed, ticked "this finish is right", or cleared)
    // must also say what its form saw when it opened: the stored finish (expectedEndTime,
    // null for a clock that was still running), when the worker confirmed it
    // (expectedFinishConfirmedAt, or null) and whether it was still unconfirmed
    // (expectedFinishUnconfirmed). All three are required; a request missing one is out of
    // date and is refused 400. The stop form's own writes (detailsConfirmed) never set a
    // finish time, so they carry none and skip the check.
    // A finish is those three stored values. Any one having moved means the worker answered
    // or another correction landed meanwhile, and writing this finish would undo it. That
    // includes a worker who confirmed the very same time: the confirmation stamp differs even
    // though the time does not. Nothing is written; the refusal carries the current entry so
    // the form can show it and stay open.
    if (data.endTime !== undefined && data.detailsConfirmed !== true) {
      if (data.expectedEndTime === undefined || data.expectedFinishConfirmedAt === undefined ||
          data.expectedFinishUnconfirmed === undefined) {
        return res.status(400).json({ error: 'This page is out of date. Refresh it and try again.' });
      }
      // Both sides go through normalizeTime, so the same moment written two ways still matches.
      let expectedEnd = null;
      let storedEnd = null;
      try {
        expectedEnd = normalizeTime(data.expectedEndTime);
        storedEnd = normalizeTime(existing.end_time);
      } catch (e) {
        expectedEnd = null;
      }
      const stampMoved = (existing.finish_confirmed_at || null) !== (data.expectedFinishConfirmedAt || null);
      // Another manager ticking the same finish clears only the flag, not the time or stamp.
      const flagMoved = (existing.finish_unconfirmed === 1) !== (data.expectedFinishUnconfirmed === true);
      if (stampMoved || flagMoved || expectedEnd === null || expectedEnd !== storedEnd) {
        // A stamp that is there now means the worker answered; one that has gone was taken
        // off by another correction. The stored finish may also have been corrected by the
        // office after that answer, which is why the reply states facts (reason + the whole
        // current entry) and the screen words them.
        let reason;
        if (stampMoved && existing.finish_confirmed_at) reason = 'workerAnswered';
        else if (data.expectedEndTime === null || data.expectedEndTime === '') reason = 'clockStopped';
        else if (flagMoved && existing.finish_unconfirmed !== 1 && expectedEnd === storedEnd) reason = 'confirmed';
        else reason = 'changed';
        return res.status(409).json({
          error: 'This finish was changed since you opened it.',
          code: FINISH_CHANGED,
          reason,
          current: toCamelCase(existing)
        });
      }
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
        // A run whose finish the worker already confirmed (from the question) is not
        // "just stopped" any more: resuming it would undo their answer. One still waiting
        // for its answer (finish_unconfirmed) can't be resumed either: the question comes first.
        const notAnswered = !existing.finish_confirmed_at && existing.finish_unconfirmed !== 1;
        if (!(withinLast12h && isMostRecentStart && noOtherRunning && notAnswered)) {
          return res.status(403).json({ error: 'Only the run you just stopped can be resumed.' });
        }
      }
    }

    // A hand edit's start and finish are judged as the pair that will be stored — one may
    // be the manager's and the other the stored one, which the validator never saw. Only a
    // request that sent a time is judged, and the mark goes on the box it sent (the finish
    // when it sent that, else the start). A note-only correction on a block the roll finished
    // at its own start (zero length, finish unknown) therefore goes through and leaves the
    // block still waiting for its answer; typing a real finish is what settles it.
    if (isManagement(req.user.role) && data.detailsConfirmed !== true &&
        (data.startTime !== undefined || data.endTime !== undefined) &&
        endTime !== null && Date.parse(endTime) <= Date.parse(startTime)) {
      const field = data.endTime !== undefined ? 'endTime' : 'startTime';
      const message = field === 'endTime'
        ? 'Finish time must be after the start time'
        : 'Start time must be before the finish time';
      return res.status(400).json({ error: message, fields: [{ field, message }] });
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

    // A finish its worker never confirmed is settled by the office only when the office gives
    // a finish: a management hand edit (not the stop form's detailsConfirmed) whose request
    // carries a finish — the stored value sent back counts, it is the office saying that
    // finish is right. A resume clears the flag too (the block is open again) but is not the
    // office confirming anything, so only the first is written to the trail. Any other save,
    // a note corrected or a worker's, leaves the flag exactly as it was.
    const officeConfirmsFinish = isManagement(req.user.role) && existing.finish_unconfirmed === 1 &&
      data.detailsConfirmed !== true && data.endTime !== undefined && endTime !== null;
    const clearsUnconfirmedFlag = existing.finish_unconfirmed === 1 && (isResume || officeConfirmsFinish);

    // The question about an unconfirmed finish belongs to the worker who owes it; moving the
    // block to someone else without settling the finish would hand them a question about
    // time they never worked.
    if (workerId !== existing.user_id && existing.finish_unconfirmed === 1 && !officeConfirmsFinish && !isResume) {
      // A block cut at midnight is stored with finish == start: that finish can never be
      // confirmed as it stands (the pair check refuses it), so the tick is not offered.
      const message = existing.end_time === existing.start_time
        ? 'Enter the real finish time before moving this to another worker'
        : 'Confirm the finish before moving this to another worker — tick "This finish is right" or correct the time';
      return res.status(400).json({ error: message, fields: [{ field: 'endTime', message }] });
    }

    // Management clearing a stopped block's finish through the edit form (without the stop
    // form's own detailsConfirmed) is the office reopening time by hand: the roll must never
    // cut it. The stop form's Resume carries detailsConfirmed and stays an ordinary clock.
    // (CLAUDE.md: hand-entered time is never touched.)
    const reopenedByHand = isResume && isManagement(req.user.role) && data.detailsConfirmed !== true;

    // The office can't reopen a block for a worker who owes an answer about a different clock
    // (reopening the flagged block itself is fine: it clears its own flag).
    if (isResume && timeEntryQueries.countUnconfirmedByUserExcluding.get(workerId, entryId).count > 0) {
      return res.status(409).json(unconfirmedRefusalFor(workerId));
    }

    // A worker's resume, or the stop form's own Resume by anyone, makes an ordinary clock that
    // the roll would cut at once if normal hours have already ended since its start. Refused
    // instead of pretending to succeed; a hand reopen by the office is never cut, so is exempt.
    if (isResume && !reopenedByHand && cutIsDue(existing, Date.now())) {
      return res.status(409).json({
        error: 'Normal hours have ended, so this clock can\'t be resumed. Save the form instead.',
        code: RESUME_AFTER_HOURS
      });
    }

    try {
      db.transaction(() => {
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
        if (clearsUnconfirmedFlag) timeEntryQueries.clearUnconfirmed.run(entryId);
        if (isResume) timeEntryQueries.clearFinishConfirmedAt.run(entryId);
        if (reopenedByHand) timeEntryQueries.markAutoStopExempt.run(entryId);
      })();
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

    if (officeConfirmsFinish) {
      changes.finish = { from: 'not confirmed', to: 'confirmed by the office' };
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

// The worker's answer about a clock that stopped itself: when did they really finish, and are
// they still working. Every refusal comes before any write. A "still working" answer closes the
// old run AND starts the new clock in one step (one transaction), so there is no moment where
// the old run is closed and no clock runs; the screen does not call Start afterwards.
router.post('/:id/time-entries/:entryId/confirm-finish', authenticate, ...validateConfirmFinish, (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { stillWorking } = req.body;

    const existing = findEntryForJob(res, id, entryId);
    if (!existing) return;

    if (!existing.end_time || existing.finish_unconfirmed !== 1) {
      return res.status(409).json(alreadyConfirmedRefusal(existing));
    }
    if (existing.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the worker whose clock it was can answer this.' });
    }

    // Earlier or later than the stored finish are both fine. "Not in the future" is judged at
    // this moment of pressing, and the ceiling (the start of the next office day's first
    // opening) caps it. The one shared rule (shared/finishAnswer.js) holds the wording.
    // A missing or empty finishTime never reaches here: the validator refuses it.
    const newEnd = normalizeTime(req.body.finishTime);
    const finishMs = Date.parse(newEnd);
    const nowMs = Date.now();
    const refusal = checkFinishAnswer({
      finishMs,
      startMs: Date.parse(existing.start_time),
      nowMs,
      ceilingMs: finishCeilingMs(existing, readOpeningRules())
    });
    if (refusal) {
      return res.status(400).json({ error: refusal, fields: [{ field: 'finishTime', message: refusal }] });
    }

    // An answer that carried the old block on (no sign-off, no stop form) with no new clock
    // behind it lost the work's record, so "still working" is refused before any write when the
    // new clock could not be started.
    const jobIsArchived = jobcardQueries.getById.get(id)?.archived === 1;
    const restartRefusal = {
      error: 'Your clock can\'t be started again on this job. Choose "No, I\'m done with it" instead.',
      code: RESTART_REFUSED
    };
    let partToRestart = null;
    if (stillWorking) {
      partToRestart = existing.item_id
        ? jobItemQueries.getByJobcard.all(id).find(item => item.id === existing.item_id) || null
        : null;
      // Another unanswered clock of theirs would have refused the ordinary Start too: the
      // questions are answered before any new clock runs.
      if (jobIsArchived || !partToRestart || timeEntryQueries.getActiveByUser.get(req.user.userId) ||
          timeEntryQueries.countUnconfirmedByUserExcluding.get(req.user.userId, entryId).count > 0) {
        return res.status(409).json(restartRefusal);
      }
    }

    // An answer inside the clock-drift leeway but later than the server's now is stored as now,
    // so no block ever ends in the future.
    const storedEndMs = Math.min(finishMs, nowMs);
    const storedEnd = new Date(storedEndMs).toISOString();
    // The old run and the new clock are ONE run only when the finish given is close to now.
    // Then the new clock carries the sign-off and the stop form. An older finish is a run of
    // its own: it is answered like "done" (sign-off and note kept, stop form owed) while the
    // new clock still starts.
    const carriedOn = stillWorking && (nowMs - storedEndMs) <= CARRIED_ON_GAP_MS;
    const criticalAtFinish = carriedOn ? 0 : existing.critical_at_finish;
    const description = carriedOn && !(existing.description && existing.description.trim())
      ? 'Carried on in a later run'
      : existing.description;
    // A job archived since the clock stopped can't have its stop form saved (closed jobs refuse
    // every write), so no form is left waiting there whatever the worker said. A carried-on run
    // owes none either: the new clock's form covers it.
    // For "still working" the answer and the new clock are one all-or-nothing step: a lost
    // race on the answer, or a refused insert (the one-open-clock rule), rolls both back.
    let restarted = null;
    const answerAndRestart = db.transaction(() => {
      const answered = timeEntryQueries.confirmFinish.run(
        storedEnd, new Date().toISOString(), carriedOn || jobIsArchived ? 0 : 1, criticalAtFinish, description, entryId
      );
      // Another answer got there first (the statement only matches a still-unconfirmed block).
      if (answered.changes === 0) {
        const e = new Error('Finish already confirmed');
        e.alreadyConfirmed = true;
        throw e;
      }
      if (stillWorking) {
        try {
          restarted = insertOpenClock(id, req.user.userId, partToRestart, true);
        } catch (e) {
          e.restartRefused = true;
          throw e;
        }
      }
    });
    try {
      answerAndRestart();
    } catch (e) {
      if (e.alreadyConfirmed) {
        return res.status(409).json(alreadyConfirmedRefusal(timeEntryQueries.getById.get(entryId) || existing));
      }
      if (e.restartRefused) return res.status(409).json(restartRefusal);
      throw e;
    }

    const changes = storedEndMs === Date.parse(existing.end_time)
      ? { finish: { from: 'not confirmed', to: 'confirmed' } }
      : { endTime: { from: existing.end_time, to: storedEnd }, reportedBy: { from: null, to: 'worker' } };
    // Everything else this answer wrote goes in the same entry: the note, through the one
    // list of a run's trailed fields, and the sign-off a carried-on answer lifted.
    // (awaiting_details is not a trailed field anywhere.)
    const saved = { description };
    Object.assign(changes, diffFields(existing, RUN_TRAIL_FIELDS
      .filter(([column]) => column in saved)
      .map(([column, key]) => [column, key, saved[column]])));
    if (existing.critical_at_finish === 1 && criticalAtFinish === 0) {
      changes.criticalSignOff = { from: 'needed', to: 'carried by the later run' };
    }
    const statusChange = syncStatusToWork(id, req.user);
    if (statusChange) changes.status = statusChange;

    recordHistory('jobcard', id, 'confirm_finish', req.user.userId, actorName(req), changes,
      { timeEntryId: entryId, startTime: existing.start_time });

    const confirmed = toCamelCase(timeEntryQueries.getById.get(entryId));
    if (restarted) {
      // The new clock's own trail entry, side effects and reply shape are the Start route's.
      const restartedTimer = afterClockStarted(id, req.user.userId, partToRestart, restarted.startTime, req, true, restarted.entryId);
      return res.json({ ...confirmed, restartedTimer });
    }
    res.json(confirmed);
  } catch (err) {
    logger.error({ err }, 'Confirm finish error');
    res.status(500).json({ error: 'Failed to confirm the finish time' });
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
