import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { STATUS_LABELS } from '../JobCardList.constants';
import { BILLING_STATUSES } from './constants';
import { isJobClosedError } from '../../utils/jobLock';
import { confirmFilesAnyway, confirmWithoutSignOff, confirmMarkArchived, confirmStartBilling, confirmWithoutPo } from './jobCardPrompts';

// One status-change flow, shared by the job screen's own status control
// (JobIdentityStrip) and the job list's status badge — both used to run this
// sequence themselves, and drifted (different success wording, one of the two
// missing the closed-job handling). This is the order every caller follows: any
// save still on its way lands first (beforeSend); a billing move gets the caller's
// pricing check; then the write goes out, and the server's hard blocks answer first;
// each question the server asks back (the "are you sure?" with a fresh total, then
// each "carry on anyway?") is answered once and resent; a job closed elsewhere hands off to the
// caller's onJobClosed when it has one, else fails like any other error.
//
// A second call for a job whose change is still running is ignored — callers
// that show their own busy state (JobIdentityStrip's status picker) never reach
// this twice for the same job, but nothing stopped a second one from a caller
// that doesn't, so the guard lives here instead of in every caller.
const jobsInFlight = new Set();

// The server's checkpoints, in the order it asks them: each refusal names the
// question to put, and the flag a "yes" answer resends with. The first is the
// "are you sure?" for a move that bills or locks the job; the server only asks it
// once its hard blocks (a running timer, an unconfirmed clock) have passed, so
// nobody answers it for a move that was going to be refused anyway.
const CHECKPOINTS = [
  {
    matches: (data) => data?.error === 'CONFIRM_BILLING',
    flag: 'confirmBilling',
    ask: async (data, ctx) => {
      // The figure in the question is fetched now, after any pricing edits were saved.
      const prepared = ctx.prepareBilling ? await ctx.prepareBilling({ wantsTotal: true }) : {};
      if (!prepared) return false;
      const details = {
        total: prepared.total ?? null,
        costingChangesSaved: ctx.costingChangesSaved,
        jobNumber: prepared.jobNumber ?? ctx.jobNumber
      };
      return data.archiving
        ? confirmMarkArchived(ctx.showConfirm, details)
        : confirmStartBilling(ctx.showConfirm, { ...details, statusLabel: STATUS_LABELS[ctx.newStatus] });
    }
  },
  { matches: (data) => Boolean(data?.attachmentWarnings), flag: 'confirmMissingAttachments', ask: (data, ctx) => confirmFilesAnyway(data.attachmentWarnings, ctx.showConfirm) },
  { matches: (data) => Boolean(data?.inspectionWarnings), flag: 'confirmMissingInspection', ask: (data, ctx) => confirmWithoutSignOff(data.inspectionWarnings, ctx.showConfirm) },
  { matches: (data) => data?.error === 'MISSING_PO', flag: 'confirmMissingPo', ask: (data, ctx) => confirmWithoutPo(ctx.showConfirm) }
];

export async function changeJobStatus({
  jobId,
  newStatus,
  jobNumber = null,
  showConfirm,
  beforeSend,
  prepareBilling,
  onApplied,
  onJobClosed,
  onFailed
}) {
  if (jobsInFlight.has(jobId)) return;
  jobsInFlight.add(jobId);
  try {
    // A save still on its way (a PO number typed a moment ago) must land before the
    // move is judged, or the server asks about a PO number that is already there.
    await beforeSend?.();

    // A billing move first gets the caller's pricing check: a red pricing figure stops
    // it here, and unsaved pricing edits are saved so the bill uses them.
    let costingChangesSaved = false;
    if (BILLING_STATUSES.includes(newStatus) && prepareBilling) {
      const prepared = await prepareBilling({ wantsTotal: false });
      if (!prepared) return;
      costingChangesSaved = Boolean(prepared.costingChangesSaved);
    }
    const ctx = { showConfirm, prepareBilling, costingChangesSaved, jobNumber, newStatus };

    // Each checkpoint refusal in turn — the "are you sure?", then files, sign-off and
    // the PO number — resending with every answered flag kept set, so answering several
    // questions ends up sending all their flags. Going back on any one stops here and
    // sends nothing more. A resend goes through the exact same closed-job/failure
    // handling as the very first attempt.
    const attempt = async (confirms) => {
      try {
        // onApplied gets the server's reply — the job as it now stands. Archiving
        // files the job away server-side, and a caller that applies the change
        // locally needs that archived flag to lock itself (JobIdentityStrip).
        const updated = await api.updateJobcardStatus(jobId, newStatus, confirms);
        await onApplied?.(updated);
        toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
      } catch (err) {
        const checkpoint = err.status === 409 && CHECKPOINTS.find(c => c.matches(err.data));
        if (checkpoint) {
          const confirmed = await checkpoint.ask(err.data, ctx);
          if (!confirmed) return;
          await attempt({ ...confirms, [checkpoint.flag]: true });
          return;
        }
        // The job was archived elsewhere while this screen still had it open —
        // this write reached the server after that. A caller with no onJobClosed
        // gets the ordinary failure toast and onFailed instead.
        if (onJobClosed && isJobClosedError(err)) { await onJobClosed(); return; }
        toast.error(err.message || 'Failed to update status', { id: 'status-update-failed' });
        await onFailed?.();
      }
    };

    await attempt({});
  } finally {
    jobsInFlight.delete(jobId);
  }
}
