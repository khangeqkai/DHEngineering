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

// The "this job declared files it doesn't have — carry on anyway?" confirm, asked when
// a job first reaches billing and again when it is archived, by the one status-change
// flow (changeJobStatus.js), so the job screen and the job list speak the same words.
// Also asks, in its own words, when the job's files couldn't be checked at all.
// Returns true if the user chose to carry on.
export async function confirmFilesAnyway(warnings, showConfirm) {
  // The storage location couldn't be reached, so nothing is known about the
  // job's files — say that, rather than showing an empty list of gaps.
  if (warnings?.filesUnreachable) {
    return !!(await showConfirm?.({
      title: 'Files not checked',
      message: "This job's files couldn't be checked because the job folders location can't be reached right now. Carry on anyway?",
      confirmLabel: 'Carry on',
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
        Carry on anyway?
      </span>
    ),
    confirmLabel: 'Carry on',
    cancelLabel: 'Go back',
    confirmVariant: 'warning'
  }));
}

// The "this job has finished runs that needed the Critical sign-off but are still
// missing an answer — carry on anyway?" confirm. Written like confirmFilesAnyway
// above (same shape, same place in the flow, just the second checkpoint).
// Returns true if the user chose to carry on.
export async function confirmWithoutSignOff(warnings, showConfirm) {
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
        Carry on anyway?
      </span>
    ),
    confirmLabel: 'Carry on',
    cancelLabel: 'Go back',
    confirmVariant: 'warning'
  }));
}

// The "this customer needs a PO number for invoicing and the job has none" confirm —
// the third checkpoint, asked on any billing move (To be Invoiced, Call for Payment,
// Paid – Archived). A question, not a block: the PO may have come by phone or on paper.
// Returns true if the user chose to carry on.
export async function confirmWithoutPo(showConfirm) {
  return !!(await showConfirm?.({
    title: 'No PO number',
    message: 'This customer needs a PO number for invoicing and none is entered. Carry on anyway?',
    confirmLabel: 'Carry on',
    cancelLabel: 'Go back',
    confirmVariant: 'warning'
  }));
}

// The "mark paid and archive" confirm. Shared by the job screen's own
// status control (JobIdentityStrip) and the job list's status badge, so both speak the
// same words. `total` is a fresh figure fetched from the server (only the job screen
// can fetch one, since only it has costing access — the list passes nothing and gets
// the plain message); `costingChangesSaved` swaps in the sentence noting unsaved
// pricing was saved first. Returns true if the user chose to archive.
// The message under either billing question: what happens, then the saved-pricing
// note and the fresh total when there are any.
function billingMessage(baseMessage, { total, costingChangesSaved }) {
  if (!costingChangesSaved && typeof total !== 'number') return baseMessage;
  return (
    <>
      {baseMessage}
      {costingChangesSaved && <><br />Your costing changes have been saved.</>}
      {typeof total === 'number' && <><br />Total: {formatMoney(total)}</>}
    </>
  );
}

// The "send this job to billing" confirm, asked when a job first moves onto To be
// Invoiced or Call for Payment — the moment the figure is about to be billed, so the
// fresh total is shown here (same arguments as confirmMarkArchived below). Returns
// true if the user chose to go ahead.
export async function confirmStartBilling(showConfirm, { statusLabel, total = null, costingChangesSaved = false, jobNumber = null } = {}) {
  return !!(await showConfirm?.({
    title: jobNumber ? `Move job ${jobNumber} to ${statusLabel}?` : `Move this job to ${statusLabel}?`,
    message: billingMessage('Check the total is what the customer will be billed.', { total, costingChangesSaved }),
    confirmLabel: `Move to ${statusLabel}`,
    cancelLabel: 'Go back',
    confirmVariant: 'primary'
  }));
}

export async function confirmMarkArchived(showConfirm, { total = null, costingChangesSaved = false, jobNumber = null } = {}) {
  const message = billingMessage('It will be locked and moved to the archive. Unarchive it if it ever needs editing again.', { total, costingChangesSaved });
  return !!(await showConfirm?.({
    title: jobNumber ? `Mark job ${jobNumber} paid and archive it?` : 'Mark this job paid and archive it?',
    message,
    confirmLabel: 'Archive and lock',
    cancelLabel: 'Go back',
    confirmVariant: 'primary'
  }));
}
