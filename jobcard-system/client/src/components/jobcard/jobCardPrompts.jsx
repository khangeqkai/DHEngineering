import toast from 'react-hot-toast';
import { describeAttachmentGaps } from '../../utils/attachmentWarnings';
import { formatMoney, formatDate, formatTime } from '../../utils/formatters';

// Show the job-card form validation errors as a toast: a single error plainly, or a
// bulleted list when there are several.
export function showFormErrors(errors) {
  toast.dismiss();
  if (errors.length === 1) {
    toast.error(errors[0]);
    return;
  }
  toast.error(
    <div>
      <strong>Please fix the following:</strong>
      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem' }}>
        {errors.map((msg, i) => <li key={i}>{msg}</li>)}
      </ul>
    </div>
  );
}

// The "this job declared files it doesn't have — invoice anyway?" confirm. Shared by
// the job card save (JobCardModal) and the header status dropdown (JobIdentityStrip)
// so both speak the same words. Also asks, in its own words, when the job's files
// couldn't be checked at all. Returns true if the user chose to invoice anyway.
export async function confirmInvoiceAnyway(warnings, showConfirm) {
  // The storage location couldn't be reached, so nothing is known about the
  // job's files — say that, rather than showing an empty list of gaps.
  if (warnings?.filesUnreachable) {
    return !!(await showConfirm?.({
      title: 'Files not checked',
      message: "This job's files couldn't be checked because the job folders location can't be reached right now. Invoice anyway?",
      confirmLabel: 'Invoice anyway',
      cancelLabel: 'Go back',
      confirmVariant: 'warning'
    }));
  }
  const gaps = describeAttachmentGaps(warnings);
  return !!(await showConfirm?.({
    title: 'Files not attached',
    message: (
      <span>
        This job was marked as having the following, but no file is attached yet:
        <br />
        {gaps.map((g, i) => <span key={i}>• {g}<br /></span>)}
        <br />
        Invoice anyway?
      </span>
    ),
    confirmLabel: 'Invoice anyway',
    cancelLabel: 'Go back',
    confirmVariant: 'warning'
  }));
}

// The "this job has finished runs that needed the Critical sign-off but are still
// missing an answer — invoice anyway?" confirm. Written like confirmInvoiceAnyway
// above (same shape, same place in the invoicing flow, just the second checkpoint).
// Returns true if the user chose to invoice anyway.
export async function confirmInvoiceWithoutSignOff(warnings, showConfirm) {
  const list = warnings || [];
  return !!(await showConfirm?.({
    title: 'Inspection sign-off missing',
    message: (
      <span>
        This job has finished work that needed the Critical inspection sign-off, but
        it was never answered:
        <br />
        {list.map((w, i) => (
          <span key={w.id || i}>
            • {w.workerName || 'Unknown worker'} — {formatDate(w.startTime)}{' '}
            {formatTime(w.startTime, { hour: '2-digit', minute: '2-digit' })}
            {w.endTime && <> – {formatTime(w.endTime, { hour: '2-digit', minute: '2-digit' })}</>}
            {w.itemNumber != null && <> (part {w.itemNumber})</>}
            <br />
          </span>
        ))}
        <br />
        Invoice anyway?
      </span>
    ),
    confirmLabel: 'Invoice anyway',
    cancelLabel: 'Go back',
    confirmVariant: 'warning'
  }));
}

// The "mark as invoiced" confirm — archiving the job. Shared by the job screen's own
// status control (JobIdentityStrip) and the job list's status badge, so both speak the
// same words. `total` is a fresh figure fetched from the server (only the job screen
// can fetch one, since only it has costing access — the list passes nothing and gets
// the plain message); `costingChangesSaved` swaps in the sentence noting unsaved
// pricing was saved first. Returns true if the user chose to archive.
export async function confirmMarkInvoiced(showConfirm, { total = null, costingChangesSaved = false } = {}) {
  const baseMessage = costingChangesSaved
    ? 'This will archive the job card. Your costing changes have been saved and will be billed. Continue?'
    : 'This will archive the job card. Continue?';
  const message = typeof total === 'number'
    ? <>{baseMessage}<br />Total: {formatMoney(total)}</>
    : baseMessage;
  return !!(await showConfirm?.({
    title: 'Mark as Invoiced',
    message,
    confirmLabel: 'Archive',
    cancelLabel: 'Cancel',
    confirmVariant: 'danger'
  }));
}
