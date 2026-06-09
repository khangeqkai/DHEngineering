// Restore-in-progress guard.
//
// While a backup restore is running, the database is being wiped and reloaded
// and the job folders are being swapped. Any other client that writes during
// that window could corrupt the restore or lose its own change. This module
// holds an in-memory flag the restore handler raises for the duration, plus a
// middleware that turns away mutating requests from everyone else while it's up.
//
// Reads (GET) are still allowed so people can keep viewing, and auth routes stay
// open so the forced sign-out flow can run when the restore finishes.

let maintenance = false;

function setMaintenance(on) {
  maintenance = !!on;
}

function maintenanceGuard(req, res, next) {
  if (!maintenance) return next();

  // Allow reads and pre-flight, and let auth routes through (login/logout/me)
  // so sessions can resolve while a restore is in progress.
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const isAuthRoute = req.path.startsWith('/api/auth');
  if (!isMutating || isAuthRoute) return next();

  return res.status(503).json({
    error: 'A restore is in progress. Please wait a moment and try again.',
    code: 'RESTORE_IN_PROGRESS'
  });
}

module.exports = { setMaintenance, maintenanceGuard };
