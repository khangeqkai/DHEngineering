// The refusal every write to an invoiced (archived) job gets from the closed-job guard
// (server/src/middleware/closedJob.js), read by both sides (see CLAUDE.md "Shared rule
// files"): the client keys on the code to show the closed-job sentence and reload the job,
// and shows the same sentence the server sends.

const JOB_CLOSED = 'JOB_CLOSED';
const JOB_CLOSED_MESSAGE = 'This job is invoiced and closed. Unarchive it to make changes.';

module.exports = { JOB_CLOSED, JOB_CLOSED_MESSAGE };
