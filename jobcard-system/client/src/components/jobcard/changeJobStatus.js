import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { STATUS_LABELS } from '../JobCardList.constants';
import { isJobClosedError } from '../../utils/jobLock';
import { confirmInvoiceAnyway, confirmInvoiceWithoutSignOff, confirmMarkInvoiced } from './jobCardPrompts';

// One status-change flow, shared by the job screen's own status control
// (JobIdentityStrip) and the job list's status badge — both used to run this
// sequence themselves, and drifted (different success wording, one of the two
// missing the closed-job handling). This is the order every caller follows:
// invoicing confirms first (with a fresh total when the caller can fetch one),
// any pending work is flushed, then the write goes out; a declared-but-missing
// files refusal is confirmed once and resent; a job closed elsewhere hands off
// to the caller's onJobClosed when it has one, else fails like any other error.
//
// A second call for a job whose change is still running is ignored — callers
// that show their own busy state (JobIdentityStrip's status picker) never reach
// this twice for the same job, but nothing stopped a second one from a caller
// that doesn't, so the guard lives here instead of in every caller.
const jobsInFlight = new Set();

export async function changeJobStatus({
  jobId,
  newStatus,
  showConfirm,
  prepareInvoice,
  beforeSend,
  onApplied,
  onJobClosed,
  onFailed
}) {
  if (jobsInFlight.has(jobId)) return;
  jobsInFlight.add(jobId);
  try {
    if (newStatus === 'INVOICED') {
      let total = null;
      let costingChangesSaved = false;
      if (prepareInvoice) {
        const prepared = await prepareInvoice();
        if (!prepared) return;
        total = prepared.total ?? null;
        costingChangesSaved = Boolean(prepared.costingChangesSaved);
      }
      const proceed = await confirmMarkInvoiced(showConfirm, { total, costingChangesSaved });
      if (!proceed) return;
    }

    await beforeSend?.();

    const send = async (confirmMissingAttachments, confirmMissingInspection) => {
      // onApplied gets the server's reply — the job as it now stands. Invoicing
      // archives the job server-side, and a caller that applies the change locally
      // needs that archived flag to lock itself (JobIdentityStrip).
      const updated = await api.updateJobcardStatus(jobId, newStatus, confirmMissingAttachments, confirmMissingInspection);
      await onApplied?.(updated);
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
    };

    // Handles either invoicing warning 409 in turn — attachments first, then
    // inspection sign-off — resending with each confirmed flag kept set, so
    // answering both questions ends up sending both flags true. Going back on
    // either stops here and sends nothing more. A resend goes through the exact
    // same closed-job/failure handling as the very first attempt.
    const attempt = async (confirmMissingAttachments, confirmMissingInspection) => {
      try {
        await send(confirmMissingAttachments, confirmMissingInspection);
      } catch (err) {
        // Invoicing with declared-but-missing files: confirm once, then resend.
        if (err.status === 409 && err.data?.attachmentWarnings) {
          const confirmed = await confirmInvoiceAnyway(err.data.attachmentWarnings, showConfirm);
          if (!confirmed) return;
          await attempt(true, confirmMissingInspection);
          return;
        }
        // Invoicing with finished runs still missing their Critical sign-off:
        // confirm once, then resend.
        if (err.status === 409 && err.data?.inspectionWarnings) {
          const confirmed = await confirmInvoiceWithoutSignOff(err.data.inspectionWarnings, showConfirm);
          if (!confirmed) return;
          await attempt(confirmMissingAttachments, true);
          return;
        }
        // The job was invoiced/archived elsewhere while this screen still had it
        // open — this write reached the server after that. A caller with no
        // onJobClosed gets the ordinary failure toast and onFailed instead.
        if (onJobClosed && isJobClosedError(err)) { await onJobClosed(); return; }
        toast.error(err.message || 'Failed to update status', { id: 'status-update-failed' });
        await onFailed?.();
      }
    };

    await attempt(false, false);
  } finally {
    jobsInFlight.delete(jobId);
  }
}
