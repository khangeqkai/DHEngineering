import toast from 'react-hot-toast';

// A write's failure may be told after its window has closed and another job is open, so
// it always names its job. Its toast id is per job as well, so two jobs' failures for the
// same kind of write neither merge into one toast nor replace each other.
export function toastJobWriteFailure({ jobNumber, jobCardId }, message, idKey) {
  toast.error(jobNumber ? `Job ${jobNumber}: ${message}` : message, { id: `${idKey}-${jobCardId}` });
}
