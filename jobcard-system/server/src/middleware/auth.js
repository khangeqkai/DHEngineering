const jwt = require('jsonwebtoken');
const config = require('../config');
const { userQueries } = require('../db/database');
const { canSetStatus: sharedCanSetStatus } = require('../shared/jobStatus');
const permissions = require('../shared/permissions.json');

// Middleware to verify JWT token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'You need to sign in to do that.' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'You need to sign in to do that.' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    // Single-session enforcement + live account check against the DB.
    // One lookup covers both: the account must still be active, and the
    // session token must still match (latest login wins). Run unconditionally
    // so a token missing its session marker can never skip the check — a
    // marker-less token simply fails the match and is rejected.
    const row = userQueries.getAuthState.get(decoded.userId);
    if (!row || row.active !== 1) {
      return res.status(401).json({ error: 'Your account was turned off. Ask the office.', code: 'ACCOUNT_DEACTIVATED' });
    }
    // An empty marker means the session was ended here (a PIN reset, archiving the
    // account, a backup restore, signing out) — not that someone signed in
    // elsewhere, so it gets its own code and the person isn't told it was another device.
    if (!row.sessionToken) {
      return res.status(401).json({ error: 'You were signed out. Sign in again.', code: 'SESSION_ENDED' });
    }
    if (row.sessionToken !== decoded.sessionToken) {
      return res.status(401).json({ error: 'This account was signed in on another computer. Sign in again.', code: 'SESSION_REPLACED' });
    }

    // Build req.user explicitly so a role can never arrive from the token: the
    // role comes from the row just read, so a demotion applies on the very next
    // request instead of at next sign-in. The name comes from the same row, so a
    // rename shows on every comment and trail entry straight away rather than
    // after the person next signs in. sessionToken is consumed above only.
    req.user = {
      userId: decoded.userId,
      username: row.username,
      name: row.name,
      role: row.role
    };
    next();
  } catch (err) {
    // Both of these mean the pass this person is holding can never work again,
    // so they carry a code: the client signs them out instead of leaving every
    // action failing silently (an admin is exempt from the inactivity timeout,
    // so a session left open past its expiry hit exactly that).
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Your sign-in has expired. Sign in again.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'You need to sign in to do that.', code: 'TOKEN_INVALID' });
  }
}

// One name per permission, and the roles that carry it — read from the shared
// JSON (server/src/shared/permissions.json) so a role's access can never drift
// between here and the client's copy of the same rule (client/src/utils/roles.js).
// Throws on an unknown permission name so a typo fails loudly rather than
// silently refusing (or silently allowing) everyone.
function can(role, permission) {
  const roles = permissions[permission];
  if (!Array.isArray(roles)) throw new Error(`Unknown permission: ${permission}`);
  return roles.includes(role);
}

// What a refused person is told, per permission, in plain words.
const REFUSAL_MESSAGES = {
  management: "You don't have access to this. Ask an admin or manager.",
  pricing: 'Only an admin can see or change job pricing.',
  activityTrail: 'Only an admin can see the activity log.',
  systemData: 'Only an admin can change backups and where job files are kept.',
  adminAccounts: 'Only an admin can change admin accounts.',
  deleteJob: 'Only an admin can delete a job.'
};

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'You need to sign in to do that.' });
    }
    if (!can(req.user.role, permission)) {
      return res.status(403).json({ error: REFUSAL_MESSAGES[permission] || "You don't have access to do that." });
    }
    next();
  };
}

// Management roles: a manager can do everything an admin can except job
// costing and the labour rates/overtime configuration (money stays admin-only).
const isManagement = (role) => can(role, 'management');
const requireManagement = requirePermission('management');

// Every role that exists. Used wherever a role is checked against the full set
// (creating/updating a user) rather than just against management vs. not.
const ALL_ROLES = ['admin', 'manager', 'user'];

// The caller's role as it stands NOW. req.user.role is read when the request arrives;
// a route that waits (hashing a PIN) re-reads it after the wait, so a demotion or an
// archive that landed meanwhile applies to this request too. Null when the caller is
// no longer an active account.
function liveRole(req) {
  const row = userQueries.getAuthState.get(req.user.userId);
  return row && row.active === 1 ? row.role : null;
}

// Single source of truth for "may this role move this job from fromStatus to
// toStatus?" — called only by PATCH /jobcards/:id/status, the one status route a
// worker can reach (PUT /jobcards/:id is management-only). A no-op (status unchanged)
// is always allowed, for any role. The rule itself (which statuses a worker
// may move a job to/from) lives once in server/src/shared/jobStatus.js — also
// read by the client's copy, client/src/components/jobcard/constants.js — this
// is just the role-to-boolean seam.
function canSetStatus(role, fromStatus, toStatus) {
  return sharedCanSetStatus(isManagement(role), fromStatus, toStatus);
}

module.exports = {
  authenticate,
  can,
  requirePermission,
  requireManagement,
  isManagement,
  liveRole,
  ALL_ROLES,
  canSetStatus
};
