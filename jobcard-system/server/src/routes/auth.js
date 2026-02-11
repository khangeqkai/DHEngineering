const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const config = require('../config');
const { authenticate, requireRole } = require('../middleware/auth');
const { userQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find user
    const user = userQueries.getByUsername.get(username);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Record login in history
    recordHistory('user', user.id, 'login', user.id, user.name, null, null);

    // Generate token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        name: user.name
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
    console.error('Login error:', err);
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
    console.error('List users error:', err);
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
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create user (admin only)
router.post('/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, role, name, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
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
    console.error('Create user error:', err);
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

    // Track changes for audit
    const changes = {};
    if (name && name !== user.name) changes.name = { from: user.name, to: name };
    if (email !== undefined && email !== user.email) changes.email = { from: user.email, to: email };
    if (role && role !== user.role) changes.role = { from: user.role, to: role };
    if (password) changes.password = { changed: true };

    // Update user
    userQueries.update.run(
      name || user.name,
      email !== undefined ? email : user.email,
      user.phone,       // preserve existing phone
      user.employee_id, // preserve existing employee_id
      role || user.role,
      id
    );

    // Update password if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      userQueries.updatePassword.run(hashedPassword, id);
    }

    // Record in history
    if (Object.keys(changes).length > 0) {
      recordHistory('user', id, 'update', req.user.userId, req.user.name, changes, null);
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
    console.error('Update user error:', err);
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

    recordHistory('user', id, 'deactivate', req.user.userId, req.user.name, null, null);

    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    console.error('Deactivate user error:', err);
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

    recordHistory('user', id, 'activate', req.user.userId, req.user.name, null, null);

    res.json({ success: true, message: 'User activated' });
  } catch (err) {
    console.error('Activate user error:', err);
    res.status(500).json({ error: 'Failed to activate user' });
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
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
