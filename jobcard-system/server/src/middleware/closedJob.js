const { jobcardQueries } = require('../db/database');

// One lock for every write to an already-invoiced (archived) job: once a job
// is filed away, nothing on it changes until it is unarchived. Mounted once
// in index.js ahead of every /api/jobcards/:id route (app.use('/api/jobcards/:id', ...)),
// so a route added later is locked by default instead of needing its own
// pasted-in check. This replaces the old per-route checks: refuseIfArchived
// (utils/timeEntryHelpers.js), the four inline assignee checks in jobcards.js,
// and the archived checks in PATCH /:id/status and PUT /:id.
//
// The handful of writes that must still work on an already-closed job, kept as
// one named constant with the reason for each entry. Matched on method + the
// path remaining under /:id (e.g. '/time-entries/abc/stop') — nothing else.
const ALLOWED_ON_CLOSED_JOB = [
  // The way out of the lock — a job can't stay closed forever with no route back.
  { method: 'POST', pattern: /^\/unarchive$/, reason: 'unarchiving is how a closed job is reopened' },
  // Deleting the job itself is a separate, admin-only decision made in its own route.
  { method: 'DELETE', pattern: /^\/$/, reason: 'deleting the job is guarded admin-only in its own route' },
  // CLAUDE.md invariant: stopping a timer always works, even on a job that
  // somehow got archived while one was still running.
  { method: 'POST', pattern: /^\/time-entries\/[^/]+\/stop$/, reason: 'stopping a running timer always works' },
  // These two build the printout (the preview, and the combined PDF of the
  // paperwork) from the job's current data — they are sent as POST but only
  // read. A closed job's paperwork must still be viewable and printable.
  { method: 'POST', pattern: /^\/print$/, reason: "builds the printout from the job's current data; never changes the job" },
  { method: 'POST', pattern: /^\/packet$/, reason: "builds the printout from the job's current data; never changes the job" },
  // These two only record that paperwork was printed/saved — they never change
  // the job itself.
  { method: 'POST', pattern: /^\/printed$/, reason: 'records that paperwork was printed, does not change the job' },
  { method: 'POST', pattern: /^\/saved$/, reason: 'records that paperwork was saved, does not change the job' }
];

function isAllowedOnClosedJob(method, path) {
  return ALLOWED_ON_CLOSED_JOB.some((entry) => entry.method === method && entry.pattern.test(path));
}

function closedJobGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const jobcard = jobcardQueries.getById.get(req.params.id);
  if (!jobcard) {
    // No job under this id — including POST /api/jobcards/attachment-warnings,
    // which matches this mount with "attachment-warnings" standing in for :id.
    // The route itself answers (its own 404 or handling); this guard has
    // nothing to lock.
    return next();
  }

  if (jobcard.archived === 1 && !isAllowedOnClosedJob(req.method, req.path)) {
    return res.status(409).json({
      error: 'This job is invoiced and closed. Unarchive it to make changes.',
      code: 'JOB_CLOSED'
    });
  }

  next();
}

module.exports = { closedJobGuard, ALLOWED_ON_CLOSED_JOB };
