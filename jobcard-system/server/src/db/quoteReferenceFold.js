// The Quote Reference box was removed from the job card. Anything typed into it is kept
// as a comment on its job instead, so no reference is lost. Pure — no database, no
// requires: columnDrops.js (a live database, just before the column is dropped) and
// backup-helpers.js (an older backup's rows, before they are restored) both build the
// comments here and write them themselves.
//
// The comment is dated when the job was created, so it sits at the start of the job's
// comments where the reference always belonged, and is written by "System" — nobody
// typed it as a comment.
const SYSTEM_AUTHOR = { userId: 'system', userName: 'System' };

function quoteReferenceText(reference) {
  return `Quote reference (moved here from the old Quote Reference box): ${reference}`;
}

// jobs: rows carrying { id, quote_reference, created_at }. makeId: () => a fresh comment id.
// → job_notes rows, one per job whose reference holds anything but spaces.
function quoteReferenceNotes(jobs, makeId) {
  return jobs
    .filter((job) => typeof job.quote_reference === 'string' && job.quote_reference.trim() !== '')
    .map((job) => ({
      id: makeId(),
      jobcard_id: job.id,
      user_id: SYSTEM_AUTHOR.userId,
      user_name: SYSTEM_AUTHOR.userName,
      text: quoteReferenceText(job.quote_reference.trim()),
      created_at: job.created_at
    }));
}

module.exports = { quoteReferenceNotes };
