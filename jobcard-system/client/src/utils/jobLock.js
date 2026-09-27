// One client rule for "is this job closed to changes?" — the same flag the server's
// closedJobGuard keys on (server/src/middleware/closedJob.js): once a job is invoiced
// it is archived, and nothing on it can change until it is unarchived. Every place in
// the client that used to guess this from the status string ('INVOICED') or from a
// screen-level toggle (the job list's "Show Archived" filter) reads this instead, so
// a job that's archived for any other reason still locks, and a filter that happens to
// be showing archived rows can never be mistaken for the row itself being archived.
export function isJobClosed(job) {
  return Boolean(job?.archived);
}

// The exact sentence closedJobGuard (server/src/middleware/closedJob.js) sends back on
// every refused write, repeated here so the client shows the identical wording rather
// than a second, slightly different one.
export const JOB_CLOSED_MESSAGE = 'This job is invoiced and closed. Unarchive it to make changes.';

// True for the one shape every write refused by closedJobGuard takes: a 409 carrying
// this code. A write can reach this — even from a screen that already renders the job
// read-only — when the job was invoiced and archived from another PC while this one
// still had it open; the write was sent before that screen's own copy of the job had
// any way to know.
export function isJobClosedError(err) {
  return err?.status === 409 && err?.data?.code === 'JOB_CLOSED';
}

// What a person sees when they try to open a job that has since been deleted (a
// stale list row or search result, or an activity entry for a deleted job) — one
// sentence, one stable toast id, instead of a "try again" that can never succeed.
export const JOB_DELETED_MESSAGE = 'This job no longer exists — it was deleted.';
export const JOB_DELETED_TOAST_ID = 'job-deleted';
