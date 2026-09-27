const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { machineQueries, timeEntryQueries, recordHistory, actorName } = require('../db/database');
const { authenticate, requireManagement } = require('../middleware/auth');
const { validateCreateMachine, validateUpdateMachine } = require('../middleware/validation');
const { diffFields } = require('../utils/historyChanges');
const { splitMachineCodes } = require('../shared/machineList');
const { setArchived } = require('../utils/archiveToggle');
const { findOr404 } = require('../utils/findOr404');

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
router.post('/', requireManagement, validateCreateMachine, (req, res) => {
  const { machineNumber, name, description } = req.body;

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
    recordHistory('machine', id, 'create', req.user.userId, actorName(req), {
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
router.put('/:id', requireManagement, validateUpdateMachine, (req, res) => {
  const { id } = req.params;
  const { machineNumber, name, description } = req.body;

  try {
    const existing = findOr404(res, machineQueries.getById.get(id), 'Machine not found');
    if (!existing) return;

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
        .some((row) => splitMachineCodes(row.machine_number).some((tok) => tok.toLowerCase() === oldKey));
      if (loggedAgainstOldNumber) {
        return res.status(400).json({
          error: 'This machine has logged work; archive it and add a new one instead.'
        });
      }
    }

    machineQueries.update.run(machineNumber, name || '', description || '', id);

    const machine = machineQueries.getById.get(id);

    // Build proper diff of changed fields
    const changes = diffFields(existing, [
      ['machine_number', 'machineNumber', machineNumber],
      ['name', 'name', name || ''],
      ['description', 'description', description || ''],
    ]);

    if (Object.keys(changes).length > 0) {
      recordHistory('machine', id, 'update', req.user.userId, actorName(req),
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
router.delete('/:id', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'machine',
    load: () => machineQueries.getById.get(id),
    notFound: 'Machine not found',
    isArchived: (row) => !row.active,
    archive: true,
    write: (row) => machineQueries.deactivate.run(row.id),
    respond: () => ({ success: true }),
    snapshot: (row) => toResponseFormat(row)
  });
});

// Restore archived machine (admin or manager)
router.post('/:id/activate', requireManagement, (req, res) => {
  const { id } = req.params;

  setArchived(req, res, {
    entityType: 'machine',
    load: () => machineQueries.getById.get(id),
    notFound: 'Machine not found',
    isArchived: (row) => !row.active,
    // Block restore if an active machine has since claimed this number.
    refuse: (row) => {
      const conflict = machineQueries.getActiveByNumber.get(row.machine_number);
      return conflict && conflict.id !== row.id
        ? { status: 400, error: `Machine number "${row.machine_number}" is already in use. Rename or archive the other machine first.` }
        : null;
    },
    archive: false,
    write: (row) => machineQueries.activate.run(row.id),
    respond: () => ({ success: true }),
    snapshot: (row) => toResponseFormat(row)
  });
});

module.exports = router;
