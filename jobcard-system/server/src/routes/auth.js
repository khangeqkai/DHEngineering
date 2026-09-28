const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const logger = require('../utils/logger');
const { authenticate, requireManagement, can, ALL_ROLES } = require('../middleware/auth');
const { validateLogin, validateCreateUser, validateUpdateUser, validateUpdatePreferences, PIN_REGEX, PIN_MESSAGE } = require('../middleware/validation');
const { db, userQueries, jobNoteQueries, timeEntryQueries, recordHistory, actorName, getSettings } = require('../db/database');
const { diffFields } = require('../utils/historyChanges');
const { isViaTunnel, clientIp } = require('../utils/homeAccess');
const { setArchived } = require('../utils/archiveToggle');
const { findOr404 } = require('../utils/findOr404');
const { createPinAttemptLimiter } = require('../utils/pinAttempts');
const { nameConflictOr409 } = require('./name-conflict');

const router = express.Router();

// Wrong-PIN throttles (see utils/pinAttempts.js). Sign-in is keyed on the
// computer the guesses come from, and each failure remembers the username it was
// aimed at. Change PIN is keyed on the account itself — only its own session can
// reach that route, so no coworker can be slowed down by someone else's guessing.
const loginAttempts = createPinAttemptLimiter();
const changePinAttempts = createPinAttemptLimiter();

// Usernames are matched ignoring case (the column is COLLATE NOCASE), so the
// failure record is too — a mistyped "Admin" is forgiven by a correct "admin".
const loginTarget = (username) => username.toLowerCase();

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
    const ip = clientIp(req);

    // Check rate limit before processing
    const waitSeconds = loginAttempts.check(ip);
    if (waitSeconds) {
      logger.warn({ ip, waitSeconds }, 'Login rate limited');
      return res.status(429).json({
        error: `Too many attempts. Please wait ${waitSeconds} seconds before trying again.`
      });
    }

    // Count the attempt NOW, before any awaiting work. bcrypt.compare yields, so
    // checking the limit and recording the failure afterwards left a gap wide
    // enough for a whole burst of guesses to pass the check together — one
    // cooldown wait bought unlimited tries. A successful login forgives it below.
    loginAttempts.recordFailure(ip, loginTarget(username));

    // A visitor through the home-access tunnel must give the shared home access
    // code before the PIN is even looked at: the tunnel address is public, and
    // a 4-digit PIN alone is not enough of a lock out there. No code set = home
    // access is off.
    if (isViaTunnel(req)) {
      const codeHash = getSettings().home_access_code;
      if (!codeHash) {
        return res.status(403).json({ error: 'Home access is not switched on. Ask an admin to set a home access code.' });
      }
      const { homeAccessCode } = req.body;
      const codeOk = typeof homeAccessCode === 'string' && await bcrypt.compare(homeAccessCode, codeHash);
      if (!codeOk) {
        logger.warn({ username, reason: 'invalid_home_access_code' }, 'Failed login attempt');
        recordHistory('auth', 'login', 'login_failed', null, username, {
          reason: { from: null, to: 'invalid_home_access_code' }
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    // Find user
    const user = userQueries.getByUsername.get(username);
    if (!user || !user.active) {
      logger.warn({ username, reason: 'user_not_found_or_archived' }, 'Failed login attempt');
      recordHistory('auth', 'login', 'login_failed', null, username, {
        reason: { from: null, to: 'user_not_found_or_archived' }
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      logger.warn({ username, userId: user.id, reason: 'invalid_password' }, 'Failed login attempt');
      recordHistory('auth', 'login', 'login_failed', user.id, username, {
        reason: { from: null, to: 'invalid_password' }
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Successful login - forgive the failures from this computer that were aimed
    // at THIS account only. Guesses at anyone else's keep counting, or signing in
    // to your own account between guesses would buy unlimited tries at theirs.
    loginAttempts.forgive(ip, loginTarget(username));

    // Record login in history
    recordHistory('user', user.id, 'login', user.id, user.name, {
      username: { from: null, to: user.username }
    });

    // Generate session token and store in DB (single-session enforcement)
    const sessionToken = uuidv4();
    userQueries.updateSessionToken.run(sessionToken, user.id);

    // Generate token. Identity only — role is looked up per request from the DB
    // (see middleware/auth.js), so a token can never carry a stale access level.
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
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

// Sign out: cancel this session on the server so the pass this person is
// holding can never be used again. Without it the pass stayed good for days
// after they left the machine.
router.post('/logout', authenticate, (req, res) => {
  try {
    userQueries.updateSessionToken.run(null, req.user.userId);
    recordHistory('user', req.user.userId, 'logout', req.user.userId, actorName(req), {
      username: { from: req.user.username, to: null }
    });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Logout error');
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  try {
    const user = findOr404(res, userQueries.getById.get(req.user.userId), 'User not found');
    if (!user) return;
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

// List employees (all authenticated users) - lightweight for dropdowns.
// Active only by default; ?includeInactive=true also returns archived accounts
// so a record that still points at one (an assignee, a time block, a search
// filter) can name it and let it be removed.
router.get('/employees', authenticate, (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const users = includeInactive ? userQueries.getAll.all() : userQueries.getAllActive.all();
    res.json(users.map(user => ({
      id: user.id,
      username: user.username,
      name: user.name,
      active: !!user.active
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
    const user = findOr404(res, userQueries.getById.get(req.params.id), 'User not found');
    if (!user) return;

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
    if (role === 'admin' && !can(req.user.role, 'adminAccounts')) {
      return res.status(403).json({ error: 'Only admins can create admin accounts' });
    }

    // Usernames are unique, archived accounts included — an archived match is
    // pointed at "restore it" rather than a flat "already exists".
    const existing = userQueries.getByUsername.get(username);
    if (nameConflictOr409(res, existing, null, { entityLabel: 'user', nameLabel: 'username', field: 'username', isArchived: (row) => !row.active })) {
      return;
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
    recordHistory('user', userId, 'create', req.user.userId, actorName(req), {
      username: { from: null, to: username },
      role: { from: null, to: role || 'user' },
      name: { from: null, to: name },
      ...(email ? { email: { from: null, to: email } } : {})
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

// Update user (admin or manager only — a worker can never rename/re-email their
// own or anyone else's account here; admin accounts stay admin-only below).
// Renaming/changing email is management-only, so nothing on this route is left
// for a non-management caller to do to their own account — requireManagement
// gates the whole thing rather than leaving a self-only branch with no purpose.
router.put('/users/:id', authenticate, requireManagement, validateUpdateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, role, name, email } = req.body;

    // Check permissions
    const canManageAdmins = can(req.user.role, 'adminAccounts');
    const isSelf = req.user.userId === id;

    // Changing your OWN PIN always goes through PUT /auth/change-password, which
    // asks for the current one first. Allowing it here would let anyone who walks
    // up to a signed-in session set a PIN of their own without ever proving they
    // knew the old one — and lock the real owner out. Resetting SOMEONE ELSE'S PIN
    // (the management reset below) is deliberately different: that's the point of a reset.
    if (password && isSelf) {
      return res.status(403).json({ error: 'To change your own PIN, use Change PIN in Settings — it asks for your current PIN first.' });
    }

    // A role must be a real one (requireManagement already limits this route to admins and managers).
    if (role && !ALL_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Role must be "admin", "manager" or "user"' });
    }
    // A manager can never promote anyone to admin — that would let them grant
    // themselves the costing access managers are barred from.
    if (role === 'admin' && !canManageAdmins) {
      return res.status(403).json({ error: 'Only admins can grant the admin role' });
    }

    const user = findOr404(res, userQueries.getById.get(id), 'User not found');
    if (!user) return;

    // Admin accounts are off-limits to managers (PIN resets, demotion, renames).
    if (user.role === 'admin' && !canManageAdmins) {
      return res.status(403).json({ error: 'Only admins can modify admin accounts' });
    }

    // The last admin can't demote themselves (or be demoted) — with nobody left in
    // the role, nobody could ever grant it back. Checked against OTHER active admins,
    // so this only ever blocks the very last one.
    if (user.role === 'admin' && role && role !== 'admin' &&
        userQueries.countOtherActiveAdmins.get(id).count === 0) {
      return res.status(400).json({ error: 'This is the only admin account. Make another person an admin first.' });
    }

    // Track changes for audit. Each field is only tracked when the caller actually
    // sent it — name/role only when truthy (a falsy value here means "not provided",
    // since neither can legitimately be cleared to blank), email whenever it's
    // present at all (an empty string is a legitimate "clear the email" value).
    const fieldsToTrack = [];
    if (name) fieldsToTrack.push(['name', 'name', name]);
    if (email !== undefined) fieldsToTrack.push(['email', 'email', email || null, user.email || null]);
    if (role) fieldsToTrack.push(['role', 'role', role]);
    const changes = diffFields(user, fieldsToTrack);
    if (password) changes.password = { from: '(hidden)', to: '(changed)' };

    // Validate password before any DB writes
    if (password) {
      if (!PIN_REGEX.test(password)) {
        return res.status(400).json({ error: PIN_MESSAGE });
      }
    }

    // Update user (normalize empty email to null for DB consistency)
    const emailToStore = email !== undefined ? (email || null) : user.email;
    const newName = name || user.name;
    // A comment's author name is a snapshot frozen at write time; when the name
    // actually changes, fold every one of that user's past job notes onto the new
    // name in the same transaction, so a rename doesn't leave old comments reading
    // whoever they used to be called.
    const updateUserAndNotes = db.transaction(() => {
      userQueries.update.run(
        newName,
        emailToStore,
        user.phone,       // preserve existing phone
        user.employee_id, // preserve existing employee_id
        role || user.role,
        id
      );
      if (changes.name) {
        jobNoteQueries.updateAuthorNameByUserId.run(newName, id);
      }
    });
    updateUserAndNotes();

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      userQueries.updatePassword.run(hashedPassword, id);
      // A reset PIN must end whoever is currently signed in with the old one.
      userQueries.updateSessionToken.run(null, id);
    }

    // Record in history
    if (Object.keys(changes).length > 0) {
      recordHistory('user', id, 'update', req.user.userId, actorName(req), changes, { username: user.username, name: user.name });
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
  const { id } = req.params;

  if (req.user.userId === id) {
    return res.status(400).json({ error: 'Cannot archive yourself' });
  }

  setArchived(req, res, {
    entityType: 'user',
    load: () => userQueries.getById.get(id),
    notFound: 'User not found',
    isArchived: (row) => !row.active,
    // Admin accounts can only be archived by another admin. A running timer
    // refuses too, like invoicing does: timers outlive sign-out, so an archived
    // worker's block would keep counting labour with nobody told it was there.
    refuse: (row) => {
      if (row.role === 'admin' && !can(req.user.role, 'adminAccounts')) {
        return { status: 403, error: 'Only admins can archive admin accounts' };
      }
      const running = timeEntryQueries.getActiveByUser.get(row.id);
      if (running) {
        const where = running.item_number
          ? `job ${running.job_number}, part ${running.item_number}`
          : `job ${running.job_number}`;
        return { status: 409, error: `This person has a timer running on ${where}. Stop it before archiving.` };
      }
      return null;
    },
    archive: true,
    write: (row) => {
      userQueries.deactivate.run(row.id);
      // End any open session for this account so the cutoff is immediate, not
      // just blocked at next login. (The per-request active check also covers this.)
      userQueries.updateSessionToken.run(null, row.id);
    },
    respond: () => ({ success: true, message: 'User archived' }),
    snapshot: (row) => ({ username: row.username, name: row.name })
  });
});

// Restore archived user (admin or manager)
router.post('/users/:id/activate', authenticate, requireManagement, (req, res) => {
  const { id } = req.params;

  setArchived(req, res, {
    entityType: 'user',
    load: () => userQueries.getById.get(id),
    notFound: 'User not found',
    isArchived: (row) => !row.active,
    // Admin accounts can only be restored by another admin.
    refuse: (row) => (row.role === 'admin' && !can(req.user.role, 'adminAccounts')
      ? { status: 403, error: 'Only admins can restore admin accounts' }
      : null),
    archive: false,
    write: (row) => userQueries.activate.run(row.id),
    respond: () => ({ success: true, message: 'User restored' }),
    snapshot: (row) => ({ username: row.username, name: row.name })
  });
});

// Change password (any authenticated user, for their own account)
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Each refusal names the box it belongs to, so the Change PIN form marks
    // that box instead of popping up a message.
    if (!currentPassword || !newPassword) {
      const fields = [];
      if (!currentPassword) fields.push({ field: 'currentPassword', message: 'Enter your current PIN' });
      if (!newPassword) fields.push({ field: 'newPassword', message: 'Enter a new PIN' });
      return res.status(400).json({ error: 'Your current PIN and a new PIN are both needed', fields });
    }

    if (!PIN_REGEX.test(newPassword)) {
      return res.status(400).json({ error: PIN_MESSAGE, fields: [{ field: 'newPassword', message: PIN_MESSAGE }] });
    }

    const user = findOr404(res, userQueries.getById.get(req.user.userId), 'User not found');
    if (!user) return;

    // The current PIN is the lock that stops someone at a session left signed in
    // from setting a PIN of their own, so guessing it gets the same limit as
    // signing in. Counted before the comparison, for the same reason as sign-in.
    const pinKey = req.user.userId;
    const waitSeconds = changePinAttempts.check(pinKey);
    if (waitSeconds) {
      logger.warn({ userId: pinKey, waitSeconds }, 'Change PIN rate limited');
      return res.status(429).json({
        error: `Too many attempts. Please wait ${waitSeconds} seconds before trying again.`
      });
    }
    changePinAttempts.recordFailure(pinKey, pinKey);

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      logger.warn({ userId: pinKey, reason: 'invalid_current_password' }, 'Failed PIN change attempt');
      recordHistory('user', pinKey, 'pin_change_failed', pinKey, actorName(req), {
        reason: { from: null, to: 'invalid_current_password' }
      }, { username: user.username, name: user.name });
      const message = 'Your current PIN is not right';
      return res.status(401).json({ error: message, fields: [{ field: 'currentPassword', message }] });
    }
    changePinAttempts.forgive(pinKey, pinKey);

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
        name: user.name,
        sessionToken
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    recordHistory('user', req.user.userId, 'update', req.user.userId, actorName(req), {
      password: { from: '(hidden)', to: '(changed)' }
    }, { username: user.username, name: user.name });

    res.json({ success: true, message: 'PIN changed', token });
  } catch (err) {
    logger.error({ err }, 'Change password error');
    res.status(500).json({ error: 'Failed to change PIN' });
  }
});

module.exports = router;
