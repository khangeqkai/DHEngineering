const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { machineQueries, recordHistory } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all machines
router.get('/', (req, res) => {
  try {
    const machines = machineQueries.getAll.all();
    res.json(machines);
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

  const { machine_number, name, description } = req.body;

  if (!machine_number) {
    return res.status(400).json({ error: 'Machine number is required' });
  }

  try {
    // Check if machine number already exists
    const existing = machineQueries.getByNumber.get(machine_number);
    if (existing) {
      return res.status(400).json({ error: 'Machine number already exists' });
    }

    const id = uuidv4();
    machineQueries.create.run(id, machine_number, name || '', description || '');

    const machine = machineQueries.getById.get(id);

    recordHistory('machine', id, 'created', req.user.id, req.user.name || req.user.username, {}, machine);

    res.status(201).json(machine);
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
  const { machine_number, name, description } = req.body;

  try {
    const existing = machineQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Machine not found' });
    }

    // Check for duplicate machine number
    if (machine_number !== existing.machine_number) {
      const duplicate = machineQueries.getByNumber.get(machine_number);
      if (duplicate) {
        return res.status(400).json({ error: 'Machine number already exists' });
      }
    }

    machineQueries.update.run(machine_number, name || '', description || '', id);

    const machine = machineQueries.getById.get(id);

    recordHistory('machine', id, 'updated', req.user.id, req.user.name || req.user.username,
      { machine_number, name, description }, machine);

    res.json(machine);
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
