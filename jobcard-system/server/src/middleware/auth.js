const jwt = require('jsonwebtoken');
const config = require('../config');
const { userQueries } = require('../db/database');

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

// Convenience middleware for admin-only routes
const requireAdmin = requireRole('admin');

// Management roles: a manager can do everything an admin can except job
// costing and the labour rates/overtime configuration (money stays admin-only).
const MANAGEMENT_ROLES = ['admin', 'manager'];
const isManagement = (role) => MANAGEMENT_ROLES.includes(role);
const requireManagement = requireRole(...MANAGEMENT_ROLES);

// Which statuses a non-management user (a worker) may move a job TO, and which
// current statuses they're allowed to move it FROM. In Progress and Done are
// normally driven by logged work (see utils/jobStatusAuto.js); the one manual
// nudge a worker needs is flagging "waiting on material" and clearing it again.
// Every other status change is an office decision and stays management-only.
const WORKER_SETTABLE_STATUSES = ['IN_PROGRESS', 'AWAITING_MATERIAL'];
const WORKER_STATUS_FROM = ['OPEN', 'IN_PROGRESS', 'AWAITING_MATERIAL'];

// Single source of truth for "may this role move this job from fromStatus to
// toStatus?" — used by both the status-only route and the general job update
// route so the rule can never drift between them. A no-op (status unchanged)
// is always allowed, for any role.
function canSetStatus(role, fromStatus, toStatus) {
  if (fromStatus === toStatus) return true;
  if (isManagement(role)) return true;
  return WORKER_SETTABLE_STATUSES.includes(toStatus) && WORKER_STATUS_FROM.includes(fromStatus);
}

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requireManagement,
  isManagement,
  MANAGEMENT_ROLES,
  WORKER_SETTABLE_STATUSES,
  WORKER_STATUS_FROM,
  canSetStatus
};
