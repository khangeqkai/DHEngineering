import toast from 'react-hot-toast';
import { describeAttachmentGaps } from '../../utils/attachmentWarnings';

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
// so both speak the same words. Returns true if the user chose to invoice anyway.
export async function confirmInvoiceAnyway(warnings, showConfirm) {
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
