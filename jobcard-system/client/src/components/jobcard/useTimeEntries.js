import { useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getDefaultTimeEntryForm, isoToLocalInput, localInputToIso } from './mappers';
import { formatDate } from '../../utils/formatters';
import { roundTo } from '../../../../server/src/shared/round';
import { useFieldErrors, scrollFieldIntoView, fieldErrorsFromRefusal, showSaveRefusal } from '../../hooks/useFieldErrors';
import { INSPECTION_FIELDS, CRITICAL_INSPECTION_REFUSED } from '../../../../server/src/shared/qualityLevels';
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

export function useTimeEntries(jobCardId, { addTimeEntry, updateTimeEntry, deleteTimeEntry, showConfirm, isInvoiced = false, onJobClosed }) {
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [editingTimeEntryId, setEditingTimeEntryId] = useState(null);
  const [timeEntryForm, setTimeEntryForm] = useState(getDefaultTimeEntryForm());
  const { setFieldErrors, clearAll: resetFieldErrors, groupClass, errorFor } = useFieldErrors(
    (name) => timeEntryForm[name]
  );

  // The stored start/finish this form opened with, and whether the user has
  // actually touched each one since. A datetime-local input only carries
  // minute precision, so re-deriving an untouched field from it on save would
  // quietly drop any seconds/ms the stored value had — only a field the user
  // actually edited should be rebuilt from the input; an untouched one is sent
  // back exactly as it was stored. A brand-new entry has no original, so both
  // start out "touched" (there's nothing to fall back to).
  const originalTimesRef = useRef({ startTime: null, endTime: null });
  const touchedTimesRef = useRef({ startTime: true, endTime: true });
  // The edit form as it opened (null for a new block). Saving an edit sends only the
  // fields that differ from it, so pieces, machines or notes the worker saved on the
  // block while this form was open aren't overwritten by the copy taken at Edit.
  const openedFormRef = useRef(null);
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
    setTimeEntryForm({
      ...getDefaultTimeEntryForm(),
      startTime: isoToLocalInput(new Date().toISOString())
    });
    setEditingTimeEntryId(null);
    setShowTimeEntryForm(false);
    resetFieldErrors();
    setInspectionRequired(false);
    setEditingSignOffRequired(false);
    originalTimesRef.current = { startTime: null, endTime: null };
    touchedTimesRef.current = { startTime: true, endTime: true };
    openedFormRef.current = null;
  }, [resetFieldErrors]);

  const handleTimeEntryChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    // Pieces are counted, so the qty/scrap boxes only take digits (matches the
    // stop-timer form).
    const clean = (name === 'qty' || name === 'scrapBinQty' || name === 'scrapRecycleQty')
      ? value.replace(/\D/g, '')
      : value;
    if (name === 'startTime' || name === 'endTime') {
      touchedTimesRef.current = { ...touchedTimesRef.current, [name]: true };
    }
    setTimeEntryForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : clean
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
    resetFieldErrors();
    setInspectionRequired(false);
    // This run's own decided value, not the job's current level — set once, kept
    // for as long as this edit form stays open on this entry.
    setEditingSignOffRequired(entry.signOffRequired === true);
    setEditingTimeEntryId(entry.id);
    const opened = {
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
      endTime: isoToLocalInput(entry.endTime)
    };
    setTimeEntryForm(opened);
    openedFormRef.current = opened;
    originalTimesRef.current = { startTime: entry.startTime || null, endTime: entry.endTime || null };
    touchedTimesRef.current = { startTime: false, endTime: false };
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
    const start = new Date(startTime).getTime();
    if (isNaN(start)) {
      setFieldErrors({ startTime: 'Start time is not a valid date' });
      scrollFieldIntoView('startTime');
      return;
    }
    // Same 15-minute allowance for clock drift as the server gives.
    if (start > Date.now() + 15 * 60 * 1000) {
      setFieldErrors({ startTime: 'Start time cannot be in the future' });
      scrollFieldIntoView('startTime');
      return;
    }
    if (endTime) {
      const end = new Date(endTime).getTime();
      if (isNaN(end)) {
        setFieldErrors({ endTime: 'Finish time is not a valid date' });
        scrollFieldIntoView('endTime');
        return;
      }
      if (end <= start) {
        setFieldErrors({ endTime: 'Finish time must be after the start time' });
        scrollFieldIntoView('endTime');
        return;
      }
      // Same 15-minute allowance for clock drift as the server gives.
      if (end > Date.now() + 15 * 60 * 1000) {
        setFieldErrors({ endTime: 'Finish time cannot be in the future' });
        scrollFieldIntoView('endTime');
        return;
      }
    }

    try {
      const { workerName, ...rest } = timeEntryForm;
      // An edit sends only what changed since the form opened (the start and finish
      // always go, as the server judges them as a pair); a new block sends everything.
      const opened = openedFormRef.current;
      const fields = opened
        ? Object.fromEntries(Object.entries(rest).filter(([key, value]) => value !== opened[key]))
        : rest;
      if ('itemId' in fields || !opened) fields.itemId = timeEntryForm.itemId || null;
      const entryData = {
        ...fields,
        // Only a field the user actually changed is rebuilt from the
        // minute-precision input — an untouched one is sent back exactly as
        // it was stored, so editing one end of a block never truncates the
        // other end's seconds.
        startTime: touchedTimesRef.current.startTime
          ? localInputToIso(timeEntryForm.startTime)
          : originalTimesRef.current.startTime,
        endTime: touchedTimesRef.current.endTime
          ? localInputToIso(timeEntryForm.endTime)
          : originalTimesRef.current.endTime
      };

      if (editingTimeEntryId) {
        await updateTimeEntry(editingTimeEntryId, entryData);
      } else {
        await addTimeEntry(entryData);
      }

      resetTimeEntryForm();
    } catch (err) {
      if (isJobClosedError(err)) onJobClosed?.();
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
  }, [jobCardId, timeEntryForm, editingTimeEntryId, resetTimeEntryForm, addTimeEntry, updateTimeEntry, isInvoiced, setFieldErrors, onJobClosed]);

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
