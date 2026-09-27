import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { STATUS_LABELS } from '../JobCardList.constants';
import { isJobClosedError } from '../../utils/jobLock';
import { confirmInvoiceAnyway, confirmMarkInvoiced } from './jobCardPrompts';

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

    const send = async (confirmMissingAttachments) => {
      await api.updateJobcardStatus(jobId, newStatus, confirmMissingAttachments);
      await onApplied?.();
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
    };

    try {
      await send(false);
    } catch (err) {
      // Invoicing with declared-but-missing files: confirm once, then resend.
      if (err.status === 409 && err.data?.attachmentWarnings) {
        const confirmed = await confirmInvoiceAnyway(err.data.attachmentWarnings, showConfirm);
        if (!confirmed) return;
        try {
          await send(true);
        } catch (e2) {
          if (onJobClosed && isJobClosedError(e2)) { await onJobClosed(); return; }
          toast.error(e2.message || 'Failed to update status', { id: 'status-update-failed' });
          await onFailed?.();
        }
        return;
      }
      // The job was invoiced/archived elsewhere while this screen still had it
      // open — this write reached the server after that. A caller with no
      // onJobClosed gets the ordinary failure toast and onFailed instead.
      if (onJobClosed && isJobClosedError(err)) { await onJobClosed(); return; }
      toast.error(err.message || 'Failed to update status', { id: 'status-update-failed' });
      await onFailed?.();
    }
  } finally {
    jobsInFlight.delete(jobId);
  }
}
