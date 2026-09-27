import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { isActiveRecord } from '../../../../server/src/shared/records';

/**
 * The lists every picker on this screen draws from — suppliers, workers, machines,
 * quality levels — loaded once, because JobCardModal stays mounted behind the job
 * list rather than unmounting on close. Also covers a failed load's retry: only the
 * moment the modal is next opened retries, never a re-render while it's already up.
 * Pulled out of JobCardModal.jsx purely to keep that file from growing further, the
 * same reason useJobCardTimerActions.js and useJobCardCloseGuard.js exist; the only
 * thing this needs from the modal is `isOpen`.
 */
export function useJobCardReferenceData({ isOpen }) {
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);
  const [qaLevels, setQaLevels] = useState([]);
  const [referenceLoadFailed, setReferenceLoadFailed] = useState(false);
  // Whether the job window is actually up. The load below runs as soon as the job
  // list appears, so it can fail before anyone has opened anything — and what to
  // do about it is different in the two places.
  const wasOpenRef = useRef(false);

  const loadReferenceData = useCallback(async () => {
    try {
      const [suppliersRes, usersRes, machinesRes, qaLevelsRes] = await Promise.all([
        // Include archived suppliers: the pickers filter to active themselves, but a job
        // that already chose a since-archived supplier needs it here to show it "(retired)".
        api.getSuppliers(true),
        api.getEmployees(),
        // Include archived machines too, for the same reason — the time-entry
        // Machines picker (TimeEntryForm.jsx) filters to active itself, but a
        // block already ticked against a since-archived machine needs it here
        // to show it "(retired)" instead of silently hiding it.
        api.getMachines(true),
        api.getQaLevels()
      ]);
      setSuppliers(suppliersRes || []);
      setQaLevels(qaLevelsRes || []);
      const activeEmployees = (usersRes || [])
        .filter(isActiveRecord)
        .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || ''));
      setEmployees(activeEmployees);
      setMachines(machinesRes || []);
      setReferenceLoadFailed(false);
    } catch (err) {
      // Every picker on this screen — suppliers, workers, machines, quality levels —
      // is empty until this lands, which on its own just looks like an app with
      // nothing in it. Say what is missing, and say what gets it back — which is
      // opening a job card, whether or not one is open now.
      setReferenceLoadFailed(true);
      toast.error(
        wasOpenRef.current
          ? 'Could not load the suppliers, workers, machines and quality levels. Close this job card and open it again to retry.'
          : 'Could not load the suppliers, workers, machines and quality levels. Open a job card to try again.',
        { id: 'jobcard-reference-load-failed' }
      );
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  // ...and that reopen really does retry: this component stays mounted while the job
  // list is up, so without this the first failure left every picker empty for the rest
  // of the session with no way back. Only the moment of opening retries — a failure
  // while the window is already up must not re-fire on its own state change.
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (justOpened && referenceLoadFailed) loadReferenceData();
  }, [isOpen, referenceLoadFailed, loadReferenceData]);

  // Re-fetch suppliers after one is created or linked to a treatment on a line item,
  // so the new name and its updated services show up in the pickers right away.
  const reloadSuppliers = useCallback(async () => {
    try {
      const res = await api.getSuppliers(true);
      setSuppliers(res || []);
    } catch (err) {
      // Non-fatal: the picker keeps its current list until the next load.
    }
  }, []);

  return { suppliers, employees, machines, qaLevels, reloadSuppliers };
}
