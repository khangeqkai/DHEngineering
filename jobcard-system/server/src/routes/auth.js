const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { validateLogin, validateCreateUser, validateUpdatePreferences } = require('../middleware/validation');
const { userQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Custom login rate limiter: first 5 FAILED attempts normal, then an ESCALATING
// cooldown that grows the more they fail. No hard account lockout (a workshop must
// never let one person lock a coworker out), but the wait climbs to discourage
// steady guessing. Only failed attempts count — successful logins do not consume them.
const loginFailures = new Map(); // IP -> { count, lastFailure, windowStart }
const LOGIN_FREE_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes - resets failure count after inactivity

// Cooldown grows with the number of failures already recorded for this IP.
// count 5-6 -> 30s, 7-8 -> 1m, 9-10 -> 2m, 11+ -> 5m (cap).
const cooldownMsForCount = (count) => {
  if (count <= 6) return 30 * 1000;
  if (count <= 8) return 60 * 1000;
  if (count <= 10) return 120 * 1000;
  return 300 * 1000;
};

const checkLoginRateLimit = (ip) => {
  const now = Date.now();
  let record = loginFailures.get(ip);

  // Reset if window expired (15 min of no failures)
  if (record && (now - record.lastFailure) > LOGIN_WINDOW_MS) {
    loginFailures.delete(ip);
    record = null;
  }

  if (!record || record.count < LOGIN_FREE_ATTEMPTS) {
    return null; // allowed
  }

  // Beyond free attempts - enforce an escalating cooldown
  const cooldownMs = cooldownMsForCount(record.count);
  const timeSinceLastFailure = now - record.lastFailure;
  if (timeSinceLastFailure < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - timeSinceLastFailure) / 1000);
    return waitSeconds; // blocked
  }

  return null; // cooldown passed, allowed
};

const recordLoginFailure = (ip) => {
  const now = Date.now();
  let record = loginFailures.get(ip);

  if (!record) {
    loginFailures.set(ip, { count: 1, lastFailure: now, windowStart: now });
  } else {
    record.count++;
    record.lastFailure = now;
  }
};

const clearLoginFailures = (ip) => {
  loginFailures.delete(ip);
};

// Rate limiter for user creation - 10 attempts per 15 minutes per IP
const userCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { error: 'Too many user creation attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip;

    // Check rate limit before processing
    const waitSeconds = checkLoginRateLimit(ip);
    if (waitSeconds) {
      logger.warn({ ip, waitSeconds }, 'Login rate limited');
      return res.status(429).json({
        error: `Too many attempts. Please wait ${waitSeconds} seconds before trying again.`
      });
    }

    // Find user
    const user = userQueries.getByUsername.get(username);
    if (!user || !user.active) {
      recordLoginFailure(ip);
      logger.warn({ username, reason: 'user_not_found_or_archived' }, 'Failed login attempt');
      recordHistory('auth', 'login', 'login_failed', null, username, {
        reason: { from: null, to: 'user_not_found_or_archived' }
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      recordLoginFailure(ip);
      logger.warn({ username, userId: user.id, reason: 'invalid_password' }, 'Failed login attempt');
      recordHistory('auth', 'login', 'login_failed', user.id, username, {
        reason: { from: null, to: 'invalid_password' }
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login - clear any failure history for this IP
    clearLoginFailures(ip);

    // Record login in history
    recordHistory('user', user.id, 'login', user.id, user.name, {
      username: { from: null, to: user.username }
    });

    // Generate session token and store in DB (single-session enforcement)
    const sessionToken = uuidv4();
    userQueries.updateSessionToken.run(sessionToken, user.id);

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        sessionToken
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      }
    });
  } catch (err) {
    logger.error({ err }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  try {
    const user = userQueries.getById.get(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      jobcardColumnOrder: user.jobcard_column_order ? JSON.parse(user.jobcard_column_order) : null,
      jobcardHiddenColumns: user.jobcard_hidden_columns ? JSON.parse(user.jobcard_hidden_columns) : null
    });
  } catch (err) {
    res.status(404).json({ error: 'User not found' });
  }
});

// Update user preferences
router.put('/me/preferences', authenticate, validateUpdatePreferences, (req, res) => {
  try {
    const { jobcardColumnOrder, jobcardHiddenColumns } = req.body;

    if (jobcardColumnOrder) {
      userQueries.updateJobcardColumnOrder.run(JSON.stringify(jobcardColumnOrder), req.user.userId);
    }

    // An empty array is meaningful here ("show every column"), so save whenever the
    // field is present rather than only when non-empty.
    if (Array.isArray(jobcardHiddenColumns)) {
      userQueries.updateJobcardHiddenColumns.run(JSON.stringify(jobcardHiddenColumns), req.user.userId);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update preferences error');
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// List active employees (all authenticated users) - lightweight for dropdowns
router.get('/employees', authenticate, (req, res) => {
  try {
    const users = userQueries.getAllActive.all();
    res.json(users.map(user => ({
      id: user.id,
      username: user.username,
      name: user.name,
      active: true
    })));
  } catch (err) {
    logger.error({ err }, 'List employees error');
    res.status(500).json({ error: 'Failed to list employees' });
  }
});

// List all users (admin or manager)
router.get('/users', authenticate, requireManagement, (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const users = includeInactive
      ? userQueries.getAll.all()
      : userQueries.getAllActive.all();

    res.json(users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      active: Boolean(user.active),
      createdAt: user.created_at,
      updatedAt: user.updated_at
    })));
  } catch (err) {
    logger.error({ err }, 'List users error');
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Get single user (admin or manager)
router.get('/users/:id', authenticate, requireManagement, (req, res) => {
  try {
    const user = userQueries.getById.get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      active: Boolean(user.active),
      createdAt: user.created_at,
      updatedAt: user.updated_at
    });
  } catch (err) {
    logger.error({ err }, 'Get user error');
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create user (admin or manager; only admins can create admins)
router.post('/users', authenticate, requireManagement, userCreationLimiter, validateCreateUser, async (req, res) => {
  try {
    const { username, password, role, name, email } = req.body;

    // A manager can create accounts but never mint an admin — otherwise they
    // could grant themselves the costing access managers are barred from.
    if (role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create admin accounts' });
    }

    // Check if username exists
    const existing = userQueries.getByUsername.get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `user:${uuidv4()}`;

    userQueries.create.run(
      userId,
      username,
      hashedPassword,
      role || 'user',
      name,
      email || null,
      null,  // phone
      null   // employee_id
    );

    // Record in history
    recordHistory('user', userId, 'create', req.user.userId, req.user.name || req.user.username, {
      username: { from: null, to: username },
      role: { from: null, to: role || 'user' },
      name: { from: null, to: name }
    });

    res.status(201).json({
      id: userId,
      username,
      role: role || 'user',
      name,
      email,
      active: true
    });
  } catch (err) {
    logger.error({ err }, 'Create user error');
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (admin/manager, or self for limited fields; admin accounts stay admin-only)
router.put('/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, role, name, email } = req.body;

    // Check permissions
    const isAdmin = req.user.role === 'admin';
    const isManager = req.user.role === 'manager';
    const isSelf = req.user.userId === id;

    if (!isAdmin && !isManager && !isSelf) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Only admins and managers can change roles, and a role must be a real one.
    if (role && !isAdmin && !isManager) {
      return res.status(403).json({ error: 'Only admins or managers can change roles' });
    }
    if (role && !['admin', 'manager', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "admin", "manager" or "user"' });
    }
    // A manager can never promote anyone to admin — that would let them grant
    // themselves the costing access managers are barred from.
    if (role === 'admin' && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can grant the admin role' });
    }

    const user = userQueries.getById.get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Admin accounts are off-limits to managers (PIN resets, demotion, renames).
    if (user.role === 'admin' && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can modify admin accounts' });
    }

    // Track changes for audit (normalize empty string / null for comparison)
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    const changes = {};
    if (name && normalizeEmpty(name) !== normalizeEmpty(user.name)) changes.name = { from: user.name, to: name };
    if (email !== undefined && normalizeEmpty(email) !== normalizeEmpty(user.email)) {
      changes.email = { from: user.email || null, to: email || null };
    }
    if (role && normalizeEmpty(role) !== normalizeEmpty(user.role)) changes.role = { from: user.role, to: role };
    if (password) changes.password = { from: '(hidden)', to: '(changed)' };

    // Validate password before any DB writes
    if (password) {
      if (!/^\d{4}$/.test(password)) {
        return res.status(400).json({ error: 'Password must be exactly 4 digits' });
      }
    }

    // Update user (normalize empty email to null for DB consistency)
    const emailToStore = email !== undefined ? (email || null) : user.email;
    userQueries.update.run(
      name || user.name,
      emailToStore,
      user.phone,       // preserve existing phone
      user.employee_id, // preserve existing employee_id
      role || user.role,
      id
    );

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      userQueries.updatePassword.run(hashedPassword, id);
      // A reset PIN must end whoever is currently signed in with the old one.
      userQueries.updateSessionToken.run(null, id);
    }

    // Record in history
    if (Object.keys(changes).length > 0) {
      recordHistory('user', id, 'update', req.user.userId, req.user.name || req.user.username, changes, { username: user.username, name: user.name });
    }

    const updatedUser = userQueries.getById.get(id);

    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      role: updatedUser.role,
      name: updatedUser.name,
      email: updatedUser.email,
      active: Boolean(updatedUser.active)
    });
  } catch (err) {
    logger.error({ err }, 'Update user error');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Archive user (admin or manager) - soft delete
router.post('/users/:id/deactivate', authenticate, requireManagement, (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.userId === id) {
      return res.status(400).json({ error: 'Cannot archive yourself' });
    }

    const user = userQueries.getById.get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Admin accounts can only be archived by another admin.
    if (user.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can archive admin accounts' });
    }

    userQueries.deactivate.run(id);
    // End any open session for this account so the cutoff is immediate, not just
    // blocked at next login. (The per-request active check also covers this.)
    userQueries.updateSessionToken.run(null, id);

    recordHistory('user', id, 'archive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Active', to: 'Archived' }
    }, { username: user.username, name: user.name });

    res.json({ success: true, message: 'User archived' });
  } catch (err) {
    logger.error({ err }, 'Archive user error');
    res.status(500).json({ error: 'Failed to archive user' });
  }
});

// Restore archived user (admin or manager)
router.post('/users/:id/activate', authenticate, requireManagement, (req, res) => {
  try {
    const { id } = req.params;

    const user = userQueries.getById.get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Admin accounts can only be restored by another admin.
    if (user.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can restore admin accounts' });
    }

    userQueries.activate.run(id);

    recordHistory('user', id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Archived', to: 'Active' }
    }, { username: user.username, name: user.name });

    res.json({ success: true, message: 'User restored' });
  } catch (err) {
    logger.error({ err }, 'Restore user error');
    res.status(500).json({ error: 'Failed to restore user' });
  }
});

// Change password (any authenticated user, for their own account)
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (!/^\d{4}$/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must be exactly 4 digits' });
    }

    const user = userQueries.getById.get(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    userQueries.updatePassword.run(hashedPassword, req.user.userId);

    // Rotate the session so any OTHER device still signed in with the old PIN is
    // kicked, while the person making the change stays logged in via a fresh token.
    const sessionToken = uuidv4();
    userQueries.updateSessionToken.run(sessionToken, req.user.userId);
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        sessionToken
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    recordHistory('user', req.user.userId, 'update', req.user.userId, req.user.name || req.user.username, {
      password: { from: '(hidden)', to: '(changed)' }
    }, { username: user.username, name: user.name });

    res.json({ success: true, message: 'Password changed successfully', token });
  } catch (err) {
    logger.error({ err }, 'Change password error');
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
