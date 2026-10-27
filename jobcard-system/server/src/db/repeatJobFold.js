// The Repeat Job tick box was removed from the job card: a job is a repeat when it names
// the previous job it repeats, and not otherwise. Before the tick's column goes, its
// meaning is folded into what stays. Pure — no database, no requires: columnDrops.js (a
// live database, just before the column is dropped) and backup-helpers.js (an older
// backup's rows, before they are restored) both use it and write the results themselves.
//
//   - ticked, with a previous job named: nothing to do — the reference says it;
//   - ticked, with none named: the tick would be lost, so it is kept as a comment on the
//     job (written by "System", dated when the job was created, like the quote-reference
//     comments — db/quoteReferenceFold.js);
//   - not ticked, but a reference still stored (older builds only hid the box): the
//     reference is cleared, or the job would turn into a repeat it never was.
const SYSTEM_AUTHOR = { userId: 'system', userName: 'System' };
const TICK_ONLY_TEXT = 'Marked as a repeat job (moved here from the old Repeat Job tick box — no previous job number was entered).';

const hasReference = (job) => typeof job.repeat_job_reference === 'string' && job.repeat_job_reference.trim() !== '';

// jobs: rows carrying { id, is_repeat_job, repeat_job_reference, created_at }.
// makeId: () => a fresh comment id.
// → { notes: job_notes rows to add, clearReferenceIds: job ids whose reference goes }
function repeatJobFold(jobs, makeId) {
  const notes = [];
  const clearReferenceIds = [];
  for (const job of jobs) {
    const ticked = job.is_repeat_job === 1 || job.is_repeat_job === true;
    if (ticked && !hasReference(job)) {
      notes.push({
        id: makeId(),
        jobcard_id: job.id,
        user_id: SYSTEM_AUTHOR.userId,
        user_name: SYSTEM_AUTHOR.userName,
        text: TICK_ONLY_TEXT,
        created_at: job.created_at
      });
    } else if (!ticked && job.repeat_job_reference != null) {
      clearReferenceIds.push(job.id);
    }
  }
  return { notes, clearReferenceIds };
}

module.exports = { repeatJobFold };
