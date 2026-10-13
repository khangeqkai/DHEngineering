import { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getDefaultTimeEntryForm, isoToLocalInput, localInputToIso } from './mappers';
import { formatDate, formatDateTime } from '../../utils/formatters';
import { roundTo } from '../../../../server/src/shared/round';
import { FUTURE_LEEWAY_MS } from '../../../../server/src/shared/finishAnswer';
import { useFieldErrors, scrollFieldIntoView, fieldErrorsFromRefusal, showSaveRefusal } from '../../hooks/useFieldErrors';
import { INSPECTION_FIELDS, CRITICAL_INSPECTION_REFUSED } from '../../../../server/src/shared/qualityLevels';
import { FINISH_CHANGED } from '../../../../server/src/shared/runRefusals';
import { isJobClosedError } from '../../utils/jobLock';
import { isTimeLocked, showTimeLockedToast } from './timeLock';

// A Critical-inspection refusal names each missing answer by the field name this
// form already uses for it.
const INSPECTION_BOXES = Object.fromEntries(INSPECTION_FIELDS.map(field => [field, field]));

// Every box on this form that shows a mark of its own, by the server field name that
// lands on it (the same names). A refusal naming anything else stays a pop-up.
const FORM_BOXES = {
  workerId: 'workerId',
  itemId: 'itemId',
  startTime: 'startTime',
  endTime: 'endTime',
  ...INSPECTION_BOXES
};

// What the form knows about the stored finish as it stood when it opened (or was last
// refreshed from a refusal's current entry). All form-only; none of it is sent as a field.
function storedFactsFromEntry(entry) {
  return {
    // Only drives the hint under the finish box.
    finishUnconfirmed: entry.finishUnconfirmed === true,
    // The stored finish exactly as stored (seconds kept); what the finish box is compared
    // against to tell the tick from a typed time.
    storedEndTime: entry.endTime || null,
    // The server's own value for the finish, echoed back with a finish action, never read.
    finishVersion: entry.finishVersion,
    // The stored start, kept beside it only so the form can tell a block stored with
    // finish == start (cut at midnight, finish not known).
    storedStartTime: entry.startTime || null
  };
}

// The edit form as it opens on a stored entry.
function openedFormFromEntry(entry) {
  return {
    workerId: entry.userId || '',
    // Fallback label for an archived worker, who won't be in the active
    // dropdown any more — see TimeEntryForm.jsx.
    workerName: entry.userName || '',
    itemId: entry.itemId || '',
    machineNumber: entry.machineNumber || '',
    qty: entry.qty ?? '',
    scrapBinQty: entry.scrapBinQty ?? '',
    scrapRecycleQty: entry.scrapRecycleQty ?? '',
    firstOffInspection: entry.firstOffInspection ?? null,
    inProcessValidation: entry.inProcessValidation ?? null,
    measuringEquipmentVerification: entry.measuringEquipmentVerification ?? null,
    equipmentChecks: entry.equipmentChecks ?? null,
    equipmentChecksComments: entry.equipmentChecksComments || '',
    description: entry.description || '',
    startTime: isoToLocalInput(entry.startTime),
    endTime: isoToLocalInput(entry.endTime),
    ...storedFactsFromEntry(entry),
    // Set when a refusal showed the stored finish moved; drives the standing "Stored finish
    // is now" line under the finish box. Never sent.
    storedFinishMoved: false
  };
}

// Whether the finish box still holds exactly the stored finish (to the minute the box can show).
export function finishBoxShowsStored(form) {
  return form.endTime === isoToLocalInput(form.storedEndTime);
}

// The sentence a FINISH_CHANGED refusal is worded as. The server states facts (reason and the
// current entry); the screen words them. The box adds what to do next after it.
function finishRefusalHead(reason, current) {
  const who = current.userName || 'The worker';
  const finish = formatDateTime(current.endTime);
  // The worker's answer may itself have been corrected by the office since; nothing stored says
  // whose time the current finish is, so the sentence doesn't credit it to the worker.
  if (reason === 'workerAnswered') return `${who} has answered since you opened this. The stored finish is now ${finish} (theirs, or a later office correction).`;
  if (reason === 'clockStopped') return `This clock was stopped since you opened it. Its finish is now ${finish}.`;
  if (reason === 'confirmed') return 'This finish was confirmed since you opened it.';
  return `This finish was changed since you opened it. The stored finish is now ${finish}.`;
}

export function useTimeEntries(jobCardId, { addTimeEntry, updateTimeEntry, deleteTimeEntry, reloadTimeEntries, showConfirm, isInvoiced = false, onJobClosed }) {
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [timeEntryForm, setTimeEntryForm] = useState(getDefaultTimeEntryForm());
  const { setFieldErrors, clearAll: resetFieldErrors, groupClass, errorFor } = useFieldErrors(
    (name) => timeEntryForm[name]
  );

  // The edit form as it opened (null for a new block). Saving an edit sends only the
  // fields that differ from it, so pieces, machines or notes the worker saved on the
  // block while this form was open aren't overwritten by the copy taken at Edit.
  const openedFormRef = useRef(null);
  // Counts every opening and closing of this form. A save's reply only touches the form it
  // was sent from: if the session moved on while it was in flight, the reply writes nothing to it.
  const formSessionRef = useRef(0);
  // Set when the server refused a save because the job is Critical and inspection
  // answers are missing. The job screen's own copy of the level can be older than
  // the server's (a manager changed it after the screen loaded), so this switches
  // the checklist on regardless, until the form is closed.
  const [inspectionRequired, setInspectionRequired] = useState(false);
  // Whether the run being EDITED itself needs the sign-off — decided once, at the
  // moment it got its finish time, and read from the entry rather than the job's
  // live level (see docs/notes/files-and-qa.md's Critical sign-off note). Only set
  // while editing an existing entry; a brand-new hand entry still goes by the
  // job's current level, so this stays false for that case.
  const [editingSignOffRequired, setEditingSignOffRequired] = useState(false);

  const resetTimeEntryForm = useCallback(() => {
    formSessionRef.current += 1;
    setTimeEntryForm({
      ...getDefaultTimeEntryForm(),
      startTime: isoToLocalInput(new Date().toISOString())
    });
    setEditingTimeEntryId(null);
    setShowTimeEntryForm(false);
    resetFieldErrors();
    setInspectionRequired(false);
    setEditingSignOffRequired(false);
    openedFormRef.current = null;
  }, [resetFieldErrors]);

  const handleTimeEntryChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    // Pieces are counted, so the qty/scrap boxes only take digits (matches the
    // stop-timer form).
    const clean = (name === 'qty' || name === 'scrapBinQty' || name === 'scrapRecycleQty')
      ? value.replace(/\D/g, '')
      : value;
    setTimeEntryForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : clean,
      // The tick confirms the stored finish as it stands, so any change to the box withdraws it.
      ...(name === 'endTime' ? { confirmFinish: false } : {})
    }));
  }, []);

  const handleAddTimeEntry = useCallback((itemId = '') => {
    if (isTimeLocked(isInvoiced)) {
      showTimeLockedToast();
      return;
    }
    resetTimeEntryForm();
    setTimeEntryForm(prev => ({
      ...prev,
      itemId: itemId || '',
      startTime: isoToLocalInput(new Date().toISOString())
    }));
    setShowTimeEntryForm(true);
  }, [resetTimeEntryForm, isInvoiced]);

  const handleEditTimeEntry = useCallback((entry) => {
    if (isTimeLocked(isInvoiced)) {
      showTimeLockedToast();
      return;
    }
    formSessionRef.current += 1;
    resetFieldErrors();
    setInspectionRequired(false);
    // This run's own decided value, not the job's current level — set once, kept
    // for as long as this edit form stays open on this entry.
    setEditingSignOffRequired(entry.signOffRequired === true);
    setEditingTimeEntryId(entry.id);
    const opened = openedFormFromEntry(entry);
    setTimeEntryForm(opened);
    openedFormRef.current = opened;
    setShowTimeEntryForm(true);
  }, [resetFieldErrors, isInvoiced]);

  const handleSaveTimeEntry = useCallback(async () => {
    if (!jobCardId) return;

    // The server refuses this outright once a job is invoiced (reopen it
    // first) — don't even ask; just say so and stop here.
    if (isTimeLocked(isInvoiced)) {
      showTimeLockedToast();
      return;
    }

    // Sanity-check hand-entered times before saving: both must be real,
    // and the finish must come after the start, so bad times can't poison
    // the job's labour hours and cost totals.
    // A hand-entered block must be credited to the worker who actually did the
    // work, so per-worker hours stay accurate — not to the admin filling the form.
    if (!timeEntryForm.workerId) {
      setFieldErrors({ workerId: 'Please choose the worker who did this work' });
      scrollFieldIntoView('workerId');
      return;
    }

    // Every block belongs to a part — the job screen lists work only under its part,
    // so a block with none could never be seen, edited or stopped again. The one
    // exception is editing an old block that was recorded before that rule and never
    // had a part: its other fields can still be corrected.
    const openedWithoutPart = !!openedFormRef.current && !openedFormRef.current.itemId;
    if (!timeEntryForm.itemId && !openedWithoutPart) {
      setFieldErrors({ itemId: 'Please choose the part this work was on' });
      scrollFieldIntoView('itemId');
      return;
    }

    const { startTime, endTime } = timeEntryForm;
    if (!startTime) {
      setFieldErrors({ startTime: 'Please enter a start time' });
      scrollFieldIntoView('startTime');
      return;
    }
    // An edit judges a time only when it is going to be sent: a time left alone is not
    // re-checked (a block cut at midnight is stored with finish == start, and its
    // description must still be correctable). A new block judges everything.
    const opened = openedFormRef.current;
    const editing = !!opened;
    // What an edit does with the finish, stated by comparing the boxes with the form as it
    // opened: the tick confirms the STORED finish (only while the box still shows it), a
    // different box is the office's own time (or, emptied, a reopen), an untouched box is
    // not part of the save. A new block has no stored finish and sends its boxes as they are.
    let finishAction;
    if (editing) {
      if (timeEntryForm.confirmFinish && finishBoxShowsStored(timeEntryForm)) finishAction = 'confirm';
      else if (timeEntryForm.endTime !== opened.endTime) finishAction = timeEntryForm.endTime ? 'correct' : 'reopen';
    }
    const startChanged = !editing || timeEntryForm.startTime !== opened.startTime;
    // The tick sends no time: the server judges the stored finish, seconds and all, so the
    // minute-precision box is not checked for it.
    const endSent = !editing || finishAction === 'correct';
    const start = new Date(startTime).getTime();
    if (startChanged) {
      if (isNaN(start)) {
        setFieldErrors({ startTime: 'Start time is not a valid date' });
        scrollFieldIntoView('startTime');
        return;
      }
      // Same allowance for clock drift as the server gives.
      if (start > Date.now() + FUTURE_LEEWAY_MS) {
        setFieldErrors({ startTime: 'Start time cannot be in the future' });
        scrollFieldIntoView('startTime');
        return;
      }
    }
    if (endTime && (startChanged || endSent)) {
      const end = new Date(endTime).getTime();
      if (endSent && isNaN(end)) {
        setFieldErrors({ endTime: 'Finish time is not a valid date' });
        scrollFieldIntoView('endTime');
        return;
      }
      if (end <= start) {
        setFieldErrors({ endTime: 'Finish time must be after the start time' });
        scrollFieldIntoView('endTime');
        return;
      }
      // Same allowance for clock drift as the server gives.
      if (endSent && end > Date.now() + FUTURE_LEEWAY_MS) {
        setFieldErrors({ endTime: 'Finish time cannot be in the future' });
        scrollFieldIntoView('endTime');
        return;
      }
    }

    const session = formSessionRef.current;
    // Names the block this save is about, for a refusal that arrives after the form moved on.
    const blockLabel = editingTimeEntryId
      ? `${timeEntryForm.workerName || 'The worker'}'s block from ${formatDateTime(timeEntryForm.storedStartTime)}`
      : 'New time entry';
    try {
      // The stored* facts, the finish version, the worker's name, the moved flag and the tick
      // (confirmFinish, "this finish is right") are form-only and never sent as plain fields.
      const { workerName, finishUnconfirmed, confirmFinish, storedEndTime, finishVersion, storedStartTime, storedFinishMoved, ...rest } = timeEntryForm;
      // An edit sends only what changed since the form opened: the start when its box
      // differs, the finish only as a stated action (the server judges the pair it will
      // store); a new block sends everything.
      const { startTime: startBox, endTime: endBox, ...others } = rest;
      const entryData = opened
        ? Object.fromEntries(Object.entries(others).filter(([key, value]) => value !== opened[key]))
        : others;
      if ('itemId' in entryData || !opened) entryData.itemId = timeEntryForm.itemId || null;
      if (startChanged) entryData.startTime = localInputToIso(startBox);
      if (!opened) {
        // A new block: its finish is whatever the box holds (empty means an open clock).
        entryData.endTime = localInputToIso(endBox);
      } else if (finishAction) {
        // The stored finish is never sent for 'confirm' or 'reopen'; the version says which
        // finish this form was looking at.
        entryData.finishAction = finishAction;
        entryData.finishVersion = opened.finishVersion;
        if (finishAction === 'correct') entryData.endTime = localInputToIso(endBox);
      }

      if (editingTimeEntryId) {
        await updateTimeEntry(editingTimeEntryId, entryData);
      } else {
        await addTimeEntry(entryData);
      }

      if (session === formSessionRef.current) resetTimeEntryForm();
    } catch (err) {
      if (isJobClosedError(err)) onJobClosed?.();
      else if (session !== formSessionRef.current) {
        // The form this save came from is gone, so nothing is written to the form now open;
        // the pop-up names the block so it can't be mistaken for the one on screen.
        const refusedFinish = err?.status === 409 && err?.data?.code === FINISH_CHANGED;
        const message = refusedFinish && err.data.current
          ? `${blockLabel}: ${finishRefusalHead(err.data.reason, err.data.current)} Your change was not saved.`
          : `${blockLabel}: ${err.message || 'Failed to save time entry'}`;
        toast.error(message, { id: 'time-entry-save-refused' });
        if (refusedFinish) reloadTimeEntries?.()?.catch?.(() => {});
      }
      else if (err?.status === 409 && err?.data?.code === FINISH_CHANGED && err.data.current) {
        // The finish moved since this form opened. The form stays open with everything the
        // manager typed; the stored facts take the current values. The other opened fields are
        // not rebased: a save sends only fields that differ from them, so rebasing would
        // overwrite what the worker saved meanwhile.
        const { current, reason } = err.data;
        const facts = storedFactsFromEntry(current);
        const currentBox = isoToLocalInput(current.endTime);
        // The box is locked while saving, so this is what it still holds. A typed finish (or a
        // cleared one) is never overwritten; only the tick's box follows the stored finish.
        const sentBox = timeEntryForm.endTime;
        const keepsTyped = finishAction !== 'confirm' && sentBox !== currentBox;
        const boxAfter = keepsTyped ? sentBox : currentBox;
        const moved = facts.storedEndTime !== openedFormRef.current.storedEndTime;
        let tail;
        if (keepsTyped) tail = sentBox ? ' Save again to use your time instead.' : ' Save again to restart the clock anyway.';
        else tail = reason === 'confirmed' ? ' Change it and save again if it is still wrong.' : ' The finish box now shows it.';
        setTimeEntryForm(prev => ({ ...prev, ...facts, endTime: boxAfter, confirmFinish: false, storedFinishMoved: prev.storedFinishMoved || moved }));
        // The baseline for "did the finish change" is now the stored finish, so a second Save
        // sends a still-different typed finish against the new version on purpose, and a box set
        // back to the stored finish sends no finish at all.
        openedFormRef.current = { ...openedFormRef.current, ...facts, endTime: currentBox };
        // Raised against the text the box will hold: it has not re-rendered yet, so its live value is still the old one.
        setFieldErrors({ endTime: finishRefusalHead(reason, current) + tail }, { endTime: boxAfter });
        scrollFieldIntoView('endTime');
        reloadTimeEntries?.()?.catch?.(() => {});
      }
      else if (err?.data?.code === CRITICAL_INSPECTION_REFUSED) {
        // The job is Critical on the server even if this screen's copy says not:
        // show the checklist and mark each unanswered check instead of a pop-up.
        setInspectionRequired(true);
        const { marks } = fieldErrorsFromRefusal(err, INSPECTION_BOXES);
        if (marks) setFieldErrors(marks);
      }
      // Anything else the server refused on a named box (e.g. a start or finish that
      // this PC's clock thought was fine) marks that box; the rest is a pop-up.
      else showSaveRefusal(err, { boxFor: FORM_BOXES, setFieldErrors, fallback: 'Failed to save time entry' });
    }
  }, [jobCardId, timeEntryForm, editingTimeEntryId, resetTimeEntryForm, addTimeEntry, updateTimeEntry, reloadTimeEntries, isInvoiced, setFieldErrors, onJobClosed]);

  const handleDeleteTimeEntry = useCallback(async (entry) => {
    if (!jobCardId) return;
    if (isTimeLocked(isInvoiced)) {
      showTimeLockedToast();
      return;
    }

    // Spell out exactly what's being erased — whose hours, how many, and when —
    // so an admin can't wipe a worker's recorded labour (which feeds the job's
    // totals) on the strength of a vague one-liner.
    const who = entry?.userName || 'this worker';
    const hours = entry?.startTime && entry?.endTime
      ? roundTo((new Date(entry.endTime) - new Date(entry.startTime)) / 3600000, 1)
      : null;
    const day = entry?.startTime ? formatDate(entry.startTime) : null;
    const message = hours != null && day
      ? `Delete ${who}'s ${hours} ${hours === 1 ? 'hour' : 'hours'} from ${day}? This removes the time from the job's total and can't be undone.`
      : `Delete ${who}'s recorded time? This removes it from the job's total and can't be undone.`;

    const confirmed = await showConfirm({
      title: 'Delete recorded time',
      message,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    });
    if (!confirmed) return;

    try {
      await deleteTimeEntry(entry.id);
    } catch (err) {
      if (isJobClosedError(err)) onJobClosed?.();
      else toast.error(err.message || 'Failed to delete time entry');
    }
  }, [jobCardId, deleteTimeEntry, showConfirm, isInvoiced, onJobClosed]);

  const resetTimeEntries = useCallback(() => {
    resetTimeEntryForm();
  }, [resetTimeEntryForm]);

  return {
    showTimeEntryForm,
    setShowTimeEntryForm,
    editingTimeEntryId,
    timeEntryForm,
    resetTimeEntryForm,
    handleTimeEntryChange,
    handleAddTimeEntry,
    handleEditTimeEntry,
    handleSaveTimeEntry,
    handleDeleteTimeEntry,
    resetTimeEntries,
    inspectionRequired,
    editingSignOffRequired,
    groupClass,
    errorFor
  };
}
