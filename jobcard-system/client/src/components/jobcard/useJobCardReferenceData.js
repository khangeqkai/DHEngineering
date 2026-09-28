import { useState, useRef, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { isActiveRecord } from '../../../../server/src/shared/records';

/**
 * The lists every picker on this screen draws from — suppliers, workers, machines.
 * JobCardModal stays mounted behind the job list rather than unmounting on close, so
 * a list loaded once would go stale for the whole visit: a supplier added or archived
 * elsewhere, a new worker, a retired machine. So they are loaded when the job list
 * appears and again every time a job window opens (the customer list does the same,
 * useContactSearch.js) — only the moment of opening, never a re-render while the
 * window is already up. The same reload is what retries a failed load. Pulled out of
 * JobCardModal.jsx purely to keep that file from growing further, the same reason
 * useJobCardTimerActions.js and useJobCardCloseGuard.js exist; the only thing this
 * needs from the modal is `isOpen`.
 */
export function useJobCardReferenceData({ isOpen }) {
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [machines, setMachines] = useState([]);
  // Only the newest load may land — the one fired when the list appears can still
  // be on its way when a job window opens and fires another.
  const loadSeqRef = useRef(0);
  // Whether the job window is actually up. The load below runs as soon as the job
  // list appears, so it can fail before anyone has opened anything — and what to
  // do about it is different in the two places.
  const wasOpenRef = useRef(false);

  const loadReferenceData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const [suppliersRes, usersRes, machinesRes] = await Promise.all([
        // Include archived suppliers: the pickers filter to active themselves, but a job
        // that already chose a since-archived supplier needs it here to show it "(retired)".
        api.getSuppliers(true),
        api.getEmployees(),
        // Include archived machines too, for the same reason — the time-entry
        // Machines picker (TimeEntryForm.jsx) filters to active itself, but a
        // block already ticked against a since-archived machine needs it here
        // to show it "(retired)" instead of silently hiding it.
        api.getMachines(true)
      ]);
      if (seq !== loadSeqRef.current) return;
      setSuppliers(suppliersRes || []);
      const activeEmployees = (usersRes || [])
        .filter(isActiveRecord)
        .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || ''));
      setEmployees(activeEmployees);
      setMachines(machinesRes || []);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      // Every picker on this screen — suppliers, workers, machines — is empty
      // until this lands, which on its own just looks like an app with nothing
      // in it. Say what is missing, and say what gets it back — which is
      // opening a job card, whether or not one is open now.
      toast.error(
        wasOpenRef.current
          ? 'Could not load the suppliers, workers and machines. Close this job card and open it again to retry.'
          : 'Could not load the suppliers, workers and machines. Open a job card to try again.',
        { id: 'jobcard-reference-load-failed' }
      );
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  // ...and again on every opening, so each job window starts from the current lists
  // (and a failed load gets its retry). Only the moment of opening — never a re-render
  // while the window is already up.
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (justOpened) loadReferenceData();
  }, [isOpen, loadReferenceData]);

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

  return { suppliers, employees, machines, reloadSuppliers };
}
