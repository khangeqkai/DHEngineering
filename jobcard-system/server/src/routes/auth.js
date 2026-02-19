const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const logger = require('../utils/logger');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateLogin, validateCreateUser } = require('../middleware/validation');
const { userQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Custom login rate limiter: first 5 attempts normal, then 30 second cooldown between attempts
// Designed for workshop environments where a hard lockout would block all workers
const loginAttempts = new Map(); // IP -> { count, lastAttempt, windowStart }
const LOGIN_FREE_ATTEMPTS = 5;
const LOGIN_COOLDOWN_MS = 30 * 1000; // 30 seconds
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes - resets attempt count after inactivity

const loginLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  let record = loginAttempts.get(ip);

  // Reset if window expired (15 min of no attempts)
  if (record && (now - record.lastAttempt) > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    record = null;
  }

  if (!record) {
    // First attempt from this IP
    loginAttempts.set(ip, { count: 1, lastAttempt: now, windowStart: now });
    return next();
  }

  // Within free attempts (1-5)
  if (record.count < LOGIN_FREE_ATTEMPTS) {
    record.count++;
    record.lastAttempt = now;
    return next();
  }

  // Beyond free attempts - enforce 30 second cooldown
  const timeSinceLastAttempt = now - record.lastAttempt;
  if (timeSinceLastAttempt < LOGIN_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((LOGIN_COOLDOWN_MS - timeSinceLastAttempt) / 1000);
    logger.warn({ ip, attempts: record.count, waitSeconds }, 'Login rate limited');
    return res.status(429).json({
      error: `Too many attempts. Please wait ${waitSeconds} seconds before trying again.`
    });
  }

  // Cooldown passed, allow attempt
  record.count++;
  record.lastAttempt = now;
  next();
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
router.post('/login', loginLimiter, validateLogin, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = userQueries.getByUsername.get(username);
    if (!user || !user.active) {
      logger.warn({ username, reason: 'user_not_found_or_inactive' }, 'Failed login attempt');
      recordHistory('auth', 'login', 'login_failed', null, username, { reason: 'user_not_found_or_inactive' }, null);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      logger.warn({ username, userId: user.id, reason: 'invalid_password' }, 'Failed login attempt');
      recordHistory('auth', 'login', 'login_failed', user.id, username, { reason: 'invalid_password' }, null);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Record login in history
    recordHistory('user', user.id, 'login', user.id, user.name, null, { username: user.username, name: user.name });

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
      email: user.email
    });
  } catch (err) {
    res.status(404).json({ error: 'User not found' });
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

// List all users (admin only)
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
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

// Get single user (admin only)
router.get('/users/:id', authenticate, requireRole('admin'), (req, res) => {
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

// Create user (admin only)
router.post('/users', authenticate, requireRole('admin'), userCreationLimiter, validateCreateUser, async (req, res) => {
  try {
    const { username, password, role, name, email } = req.body;

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
      name || username,
      email || null,
      null,  // phone
      null   // employee_id
    );

    // Record in history
    recordHistory('user', userId, 'create', req.user.userId, req.user.name, null, {
      username,
      role: role || 'user',
      name: name || username,
      email
    });

    res.status(201).json({
      id: userId,
      username,
      role: role || 'user',
      name: name || username,
      email,
      active: true
    });
  } catch (err) {
    logger.error({ err }, 'Create user error');
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only, or self for limited fields)
router.put('/users/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, role, name, email } = req.body;

    // Check permissions
    const isAdmin = req.user.role === 'admin';
    const isSelf = req.user.userId === id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Only admins can change roles
    if (role && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can change roles' });
    }

    const user = userQueries.getById.get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Track changes for audit (normalize empty string / null for comparison)
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    const changes = {};
    if (name && normalizeEmpty(name) !== normalizeEmpty(user.name)) changes.name = { from: user.name, to: name };
    if (email !== undefined && normalizeEmpty(email) !== normalizeEmpty(user.email)) {
      changes.email = { from: user.email || null, to: email || null };
    }
    if (role && normalizeEmpty(role) !== normalizeEmpty(user.role)) changes.role = { from: user.role, to: role };
    if (password) changes.password = { changed: true };

    // Validate password before any DB writes
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      if (!/[A-Z]/.test(password)) {
        return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
      }
      if (!/[0-9]/.test(password)) {
        return res.status(400).json({ error: 'Password must contain at least one number' });
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
    }

    // Record in history
    if (Object.keys(changes).length > 0) {
      recordHistory('user', id, 'update', req.user.userId, req.user.name, changes, { username: user.username, name: user.name });
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

// Deactivate user (admin only) - soft delete
router.post('/users/:id/deactivate', authenticate, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.userId === id) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    const user = userQueries.getById.get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    userQueries.deactivate.run(id);

    recordHistory('user', id, 'deactivate', req.user.userId, req.user.name, {
      status: { from: 'Active', to: 'Inactive' }
    }, { username: user.username, name: user.name });

    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    logger.error({ err }, 'Deactivate user error');
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// Activate user (admin only)
router.post('/users/:id/activate', authenticate, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;

    const user = userQueries.getById.get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    userQueries.activate.run(id);

    recordHistory('user', id, 'activate', req.user.userId, req.user.name, {
      status: { from: 'Inactive', to: 'Active' }
    }, { username: user.username, name: user.name });

    res.json({ success: true, message: 'User activated' });
  } catch (err) {
    logger.error({ err }, 'Activate user error');
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

// Change password (any authenticated user, for their own account)
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain at least one uppercase letter' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must contain at least one number' });
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

    recordHistory('user', req.user.userId, 'update', req.user.userId, req.user.name, {
      password: { changed: true }
    }, { username: user.username, name: user.name });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    logger.error({ err }, 'Change password error');
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Delete user permanently (admin only) - hard delete
router.delete('/users/:id', authenticate, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.userId === id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    const user = userQueries.getById.get(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Record before deleting
    recordHistory('user', id, 'delete', req.user.userId, req.user.name, null, {
      username: user.username,
      name: user.name,
      role: user.role
    });

    userQueries.delete.run(id);

    res.json({ success: true, message: 'User deleted permanently' });
  } catch (err) {
    logger.error({ err }, 'Delete user error');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
