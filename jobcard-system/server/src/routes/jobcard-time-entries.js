const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { timeEntryQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Convert database row (snake_case) to API response (camelCase)
function toCamelCase(e) {
  return {
    id: e.id,
    userId: e.user_id,
    userName: e.user_name,
    itemNumber: e.item_number,
    machineNumber: e.machine_number,
    qty: e.qty,
    description: e.description,
    startTime: e.start_time,
    endTime: e.end_time,
    equipmentChecksDone: e.equipment_checks_done === 1,
    measuringVerificationDone: e.measuring_verification_done === 1,
    firstOffInspection: e.first_off_inspection,
    firstOffInspectionNotes: e.first_off_inspection_notes,
    inProcessValidation: e.in_process_validation,
    inProcessValidationNotes: e.in_process_validation_notes,
    scrapAllGood: e.scrap_all_good === 1,
    scrapRecycleInhouseQty: e.scrap_recycle_inhouse_qty,
    scrapRecycleBinQty: e.scrap_recycle_bin_qty,
    createdAt: e.created_at
  };
}

// Get job card time entries
router.get('/:id/time-entries', authenticate, (req, res) => {
  try {
    const entries = timeEntryQueries.getByJobcard.all(req.params.id);
    res.json(entries.map(toCamelCase));
  } catch (err) {
    logger.error({ err }, 'Get time entries error');
    res.status(500).json({ error: 'Failed to get time entries' });
  }
});

// Add time entry
router.post('/:id/time-entries', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const entryId = `timeentry:${Date.now()}:${uuidv4().slice(0, 8)}`;

    timeEntryQueries.create.run(
      entryId,
      id,
      req.user.userId,
      data.itemNumber || null,
      data.machineNumber || null,
      data.qty || null,
      data.description || null,
      data.startTime,
      data.endTime || null,
      data.equipmentChecksDone ? 1 : 0,
      data.measuringVerificationDone ? 1 : 0,
      data.firstOffInspection || null,
      data.firstOffInspectionNotes || null,
      data.inProcessValidation || null,
      data.inProcessValidationNotes || null,
      data.scrapAllGood !== false ? 1 : 0,
      data.scrapRecycleInhouseQty || 0,
      data.scrapRecycleBinQty || 0
    );

    recordHistory('jobcard', id, 'add_time_entry', req.user.userId, req.user.name, {
      timeEntryId: entryId,
      startTime: data.startTime,
      machineNumber: data.machineNumber,
      description: data.description
    }, null);

    const entry = timeEntryQueries.getById.get(entryId);
    res.status(201).json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Add time entry error');
    res.status(500).json({ error: 'Failed to add time entry' });
  }
});

// Update time entry
router.put('/:id/time-entries/:entryId', authenticate, (req, res) => {
  try {
    const { id, entryId } = req.params;
    const data = req.body;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    timeEntryQueries.update.run(
      data.itemNumber || null,
      data.machineNumber || null,
      data.qty || null,
      data.description || null,
      data.startTime,
      data.endTime || null,
      data.equipmentChecksDone ? 1 : 0,
      data.measuringVerificationDone ? 1 : 0,
      data.firstOffInspection || null,
      data.firstOffInspectionNotes || null,
      data.inProcessValidation || null,
      data.inProcessValidationNotes || null,
      data.scrapAllGood !== false ? 1 : 0,
      data.scrapRecycleInhouseQty || 0,
      data.scrapRecycleBinQty || 0,
      entryId
    );

    recordHistory('jobcard', id, 'update_time_entry', req.user.userId, req.user.name, {
      timeEntryId: entryId,
      machineNumber: data.machineNumber,
      description: data.description
    }, null);

    const entry = timeEntryQueries.getById.get(entryId);
    res.json(toCamelCase(entry));
  } catch (err) {
    logger.error({ err }, 'Update time entry error');
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// Delete time entry
router.delete('/:id/time-entries/:entryId', authenticate, (req, res) => {
  try {
    const { id, entryId } = req.params;

    const existing = timeEntryQueries.getById.get(entryId);
    if (!existing) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    recordHistory('jobcard', id, 'delete_time_entry', req.user.userId, req.user.name, {
      timeEntryId: entryId,
      startTime: existing.start_time,
      description: existing.description
    }, null);

    timeEntryQueries.delete.run(entryId);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete time entry error');
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

module.exports = router;
