const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { machineQueries, recordHistory } = require('../db/database');
const { authenticate } = require('../middleware/auth');

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
    const machines = machineQueries.getAll.all();
    res.json(machines.map(toResponseFormat));
  } catch (err) {
    logger.error({ err }, 'Failed to get machines');
    res.status(500).json({ error: 'Failed to get machines' });
  }
});

// Create machine (admin only)
router.post('/', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { machineNumber, name, description } = req.body;

  if (!machineNumber) {
    return res.status(400).json({ error: 'Machine number is required' });
  }

  try {
    // Check if machine number already exists
    const existing = machineQueries.getByNumber.get(machineNumber);
    if (existing) {
      return res.status(400).json({ error: 'Machine number already exists' });
    }

    const id = uuidv4();
    machineQueries.create.run(id, machineNumber, name || '', description || '');

    const machine = machineQueries.getById.get(id);

    recordHistory('machine', id, 'created', req.user.id, req.user.name || req.user.username, {}, machine);

    res.status(201).json(toResponseFormat(machine));
  } catch (err) {
    logger.error({ err }, 'Failed to create machine');
    res.status(500).json({ error: 'Failed to create machine' });
  }
});

// Update machine (admin only)
router.put('/:id', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { id } = req.params;
  const { machineNumber, name, description } = req.body;

  try {
    const existing = machineQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Check for duplicate machine number
    if (machineNumber !== existing.machine_number) {
      const duplicate = machineQueries.getByNumber.get(machineNumber);
      if (duplicate) {
        return res.status(400).json({ error: 'Machine number already exists' });
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
    for (const [dbField, changeKey, newValue] of fieldsToTrack) {
      if (newValue !== existing[dbField]) {
        changes[changeKey] = { from: existing[dbField], to: newValue };
      }
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('machine', id, 'updated', req.user.id, req.user.name || req.user.username,
        changes, machine);
    }

    res.json(toResponseFormat(machine));
  } catch (err) {
    logger.error({ err }, 'Failed to update machine');
    res.status(500).json({ error: 'Failed to update machine' });
  }
});

// Delete machine (admin only)
router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { id } = req.params;

  try {
    const existing = machineQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    machineQueries.deactivate.run(id);

    recordHistory('machine', id, 'deactivated', req.user.id, req.user.name || req.user.username, {}, existing);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete machine');
    res.status(500).json({ error: 'Failed to delete machine' });
  }
});

module.exports = router;
