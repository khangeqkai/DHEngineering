const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { machineQueries, timeEntryQueries, recordHistory } = require('../db/database');
const { authenticate, isManagement } = require('../middleware/auth');
const { parseMachineTokens } = require('./statistics-helpers');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Helper to convert DB row to camelCase response
function toResponseFormat(m) {
  return {
    id: m.id,
    machineNumber: m.machine_number,
    name: m.name,
    description: m.description,
    active: m.active,
    createdAt: m.created_at,
    updatedAt: m.updated_at
  };
}

// Get all machines
router.get('/', (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const machines = includeInactive
      ? machineQueries.getAllIncludeInactive.all()
      : machineQueries.getAll.all();
    res.json(machines.map(toResponseFormat));
  } catch (err) {
    logger.error({ err }, 'Failed to get machines');
    res.status(500).json({ error: 'Failed to get machines' });
  }
});

// Create machine (admin or manager)
router.post('/', (req, res) => {
  if (!isManagement(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { machineNumber, name, description } = req.body;

  if (!machineNumber) {
    return res.status(400).json({ error: 'Machine number is required' });
  }

  try {
    // Check if an active machine already uses this number (archived ones don't count)
    const existing = machineQueries.getActiveByNumber.get(machineNumber);
    if (existing) {
      return res.status(400).json({ error: 'Machine number already exists' });
    }

    const id = uuidv4();
    machineQueries.create.run(id, machineNumber, name || '', description || '');

    const machine = machineQueries.getById.get(id);

    const created = toResponseFormat(machine);
    recordHistory('machine', id, 'create', req.user.userId, req.user.name || req.user.username, {
      machineNumber: { from: null, to: created.machineNumber },
      name: { from: null, to: created.name }
    });

    res.status(201).json(toResponseFormat(machine));
  } catch (err) {
    logger.error({ err }, 'Failed to create machine');
    res.status(500).json({ error: 'Failed to create machine' });
  }
});

// Update machine (admin or manager)
router.put('/:id', (req, res) => {
  if (!isManagement(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { id } = req.params;
  const { machineNumber, name, description } = req.body;

  if (!machineNumber) {
    return res.status(400).json({ error: 'Machine number is required' });
  }

  try {
    const existing = machineQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Check for duplicate machine number among active machines (archived ones don't count)
    // A capitals-only change ("cnc-01" → "CNC-01") is not a renumber: the check
    // below matches this machine itself, and logged work already matches its
    // number with capitals ignored, so it needs neither check.
    const numberChanged = String(machineNumber).trim().toLowerCase()
      !== String(existing.machine_number).trim().toLowerCase();
    if (numberChanged) {
      const duplicate = machineQueries.getActiveByNumber.get(machineNumber);
      if (duplicate && duplicate.id !== id) {
        return res.status(400).json({ error: 'Machine number already exists' });
      }

      // Time entries store machine numbers as a free-text list (e.g. "01, 02") that
      // can't be exactly matched, or safely rewritten token-by-token, for every
      // format logged over the years — so a renumber is refused outright once any
      // logged work references the old number, rather than risking a rewrite that
      // silently misses or mangles an entry. Only work logged since this machine
      // was added counts: a reused number's older work is a retired machine's.
      const oldKey = String(existing.machine_number).trim().toLowerCase();
      const loggedAgainstOldNumber = timeEntryQueries.getDistinctMachineNumbersSince.all(existing.created_at || '')
        .some((row) => parseMachineTokens(row.machine_number).some((tok) => tok.toLowerCase() === oldKey));
      if (loggedAgainstOldNumber) {
        return res.status(400).json({
          error: 'This machine has logged work; archive it and add a new one instead.'
        });
      }
    }

    machineQueries.update.run(machineNumber, name || '', description || '', id);

    const machine = machineQueries.getById.get(id);

    // Build proper diff of changed fields
    const changes = {};
    const fieldsToTrack = [
      ['machine_number', 'machineNumber', machineNumber],
      ['name', 'name', name || ''],
      ['description', 'description', description || ''],
    ];
    const normalizeEmpty = v => (v === null || v === undefined || v === '') ? '' : v;
    for (const [dbField, changeKey, newValue] of fieldsToTrack) {
      if (normalizeEmpty(newValue) !== normalizeEmpty(existing[dbField])) {
        changes[changeKey] = { from: existing[dbField], to: newValue };
      }
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('machine', id, 'update', req.user.userId, req.user.name || req.user.username,
        changes, toResponseFormat(machine));
    }

    res.json(toResponseFormat(machine));
  } catch (err) {
    logger.error({ err }, 'Failed to update machine');
    res.status(500).json({ error: 'Failed to update machine' });
  }
});

// Archive machine (admin or manager)
// Machines are never permanently deleted: time entries record which machine ran a
// job, so erasing one would leave that history pointing at nothing. Archiving keeps
// the record (existing time entries stay valid) and frees its number for reuse.
router.delete('/:id', (req, res) => {
  if (!isManagement(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { id } = req.params;

  try {
    const existing = machineQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    machineQueries.deactivate.run(id);

    recordHistory('machine', id, 'archive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Active', to: 'Archived' }
    }, toResponseFormat(existing));

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to archive machine');
    res.status(500).json({ error: 'Failed to archive machine' });
  }
});

// Restore archived machine (admin or manager)
router.post('/:id/activate', (req, res) => {
  if (!isManagement(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { id } = req.params;

  try {
    const existing = machineQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Block restore if an active machine has since claimed this number
    const conflict = machineQueries.getActiveByNumber.get(existing.machine_number);
    if (conflict && conflict.id !== id) {
      return res.status(400).json({
        error: `Machine number "${existing.machine_number}" is already in use. Rename or archive the other machine first.`
      });
    }

    machineQueries.activate.run(id);

    recordHistory('machine', id, 'unarchive', req.user.userId, req.user.name || req.user.username, {
      status: { from: 'Archived', to: 'Active' }
    }, toResponseFormat(existing));

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to restore machine');
    res.status(500).json({ error: 'Failed to restore machine' });
  }
});

module.exports = router;
