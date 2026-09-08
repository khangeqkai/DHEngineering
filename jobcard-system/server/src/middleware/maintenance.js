// Restore-in-progress guard.
//
// While a backup restore is running, the database is being wiped and reloaded
// and the job folders are being swapped. Any other client that writes during
// that window could corrupt the restore or lose its own change. This module
// holds an in-memory flag the restore handler raises for the duration, plus a
// middleware that turns away mutating requests from everyone else while it's up.
//
// Reads (GET) are still allowed so people can keep viewing, and sign-in and
// sign-out are let through so a session can resolve while the restore runs.
// Both touch only the signed-in person's own session marker, which the restore
// replaces wholesale anyway. Other auth routes (create/update/deactivate user,
// change PIN) write real user records, so they stay blocked like every other
// mutation.

let maintenance = false;

function setMaintenance(on) {
  maintenance = !!on;
}

function maintenanceGuard(req, res, next) {
  if (!maintenance) return next();

  // Allow reads and pre-flight, and let sign-in and sign-out through so a
  // session can resolve while a restore is in progress. Signing out only clears
  // the person's own session marker, and turning it away would leave them
  // looking signed out while the server still honoured their pass. Other auth
  // routes (create/update/deactivate user, change PIN) write real user records,
  // so they must stay blocked like every other mutation.
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const isSession = req.path === '/api/auth/login' || req.path === '/api/auth/logout';
  if (!isMutating || isSession) return next();

  return res.status(503).json({
    error: 'A restore is in progress. Please wait a moment and try again.',
    code: 'RESTORE_IN_PROGRESS'
  });
}

module.exports = { setMaintenance, maintenanceGuard };
