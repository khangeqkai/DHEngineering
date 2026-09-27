const jwt = require('jsonwebtoken');
const config = require('../config');
const { userQueries } = require('../db/database');
const { canSetStatus: sharedCanSetStatus } = require('../shared/jobStatus');
const permissions = require('../shared/permissions.json');

// Middleware to verify JWT token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid token format' });
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
      return res.status(401).json({ error: 'Account deactivated', code: 'ACCOUNT_DEACTIVATED' });
    }
    if (row.sessionToken !== decoded.sessionToken) {
      return res.status(401).json({ error: 'Session invalidated', code: 'SESSION_REPLACED' });
    }

    // Build req.user explicitly so a role can never arrive from the token: the
    // role comes from the row just read, so a demotion applies on the very next
    // request instead of at next sign-in. sessionToken is consumed above only.
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      name: decoded.name,
      role: row.role
    };
    next();
  } catch (err) {
    // Both of these mean the pass this person is holding can never work again,
    // so they carry a code: the client signs them out instead of leaving every
    // action failing silently (an admin is exempt from the inactivity timeout,
    // so a session left open past its expiry hit exactly that).
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
  }
}

// Middleware to require specific roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
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

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!can(req.user.role, permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Management roles: a manager can do everything an admin can except job
// costing and the labour rates/overtime configuration (money stays admin-only).
const MANAGEMENT_ROLES = permissions.management;
const isManagement = (role) => can(role, 'management');
const requireManagement = requirePermission('management');

// Every role that exists. Used wherever a role is checked against the full set
// (creating/updating a user) rather than just against management vs. not.
const ALL_ROLES = ['admin', 'manager', 'user'];

// Single source of truth for "may this role move this job from fromStatus to
// toStatus?" — used by both the status-only route and the general job update
// route so the rule can never drift between them. A no-op (status unchanged)
// is always allowed, for any role. The rule itself (which statuses a worker
// may move a job to/from) lives once in server/src/shared/jobStatus.js — also
// read by the client's copy, client/src/components/jobcard/constants.js — this
// is just the role-to-boolean seam.
function canSetStatus(role, fromStatus, toStatus) {
  return sharedCanSetStatus(isManagement(role), fromStatus, toStatus);
}

module.exports = {
  authenticate,
  requireRole,
  can,
  requirePermission,
  requireManagement,
  isManagement,
  MANAGEMENT_ROLES,
  ALL_ROLES,
  canSetStatus
};
