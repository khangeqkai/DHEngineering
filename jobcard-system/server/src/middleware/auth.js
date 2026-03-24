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

    // Single-session enforcement: validate session token against DB
    if (decoded.sessionToken) {
      const row = userQueries.getSessionToken.get(decoded.userId);
      if (!row || row.sessionToken !== decoded.sessionToken) {
        return res.status(401).json({ error: 'Session invalidated', code: 'SESSION_REPLACED' });
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
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

module.exports = { authenticate, requireRole, requireAdmin };
