import toast from 'react-hot-toast';

// A job's recorded time (its timer and its time entries) is locked the moment
// it's invoiced — the server refuses any change outright, and reopening the
// job is the only way back in. One place says so, read by both the timer
// actions hook and the time-entries hook, so the two can never drift on what
// "locked" means or how it's said.
export function isTimeLocked(isInvoiced) {
  return Boolean(isInvoiced);
}

// Same wording and toast id everywhere it fires, so a worker who tries both a
// manual save and a live Start on a reopened-then-reinvoiced job sees one
// message replace itself rather than two stacking.
export function showTimeLockedToast() {
  toast.error('Reopen the job to change its time', { id: 'invoiced-time-locked' });
}
