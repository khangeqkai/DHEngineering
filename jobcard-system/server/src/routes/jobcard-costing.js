const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { jobCostingQueries, timeEntryQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Get job card costing (admin only)
router.get('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const costing = jobCostingQueries.getByJobcard.get(req.params.id);
    const hours = timeEntryQueries.getHoursByJobcard.get(req.params.id) || { labour_hours: 0, labour_special_hours: 0 };
    const labourHours = Math.round(hours.labour_hours * 100) / 100;
    const labourSpecialHours = Math.round(hours.labour_special_hours * 100) / 100;

    if (!costing) {
      return res.json({
        labourHours,
        labourRate: 0,
        labourTotal: 0,
        labourSpecialHours,
        labourSpecialRate: 0,
        labourSpecialTotal: 0,
        materialsCost: 0,
        materialsProfitPercent: 100,
        materialsTotal: 0,
        subcontractorCost: 0,
        subcontractorProfitPercent: 0,
        subcontractorTotal: 0,
        grandTotal: 0
      });
    }
    const labourTotal = labourHours * costing.labour_rate;
    const labourSpecialTotal = labourSpecialHours * costing.labour_special_rate;
    const materialsTotal = costing.materials_cost * (1 + costing.materials_profit_percent / 100);
    const subcontractorTotal = costing.subcontractor_cost * (1 + costing.subcontractor_profit_percent / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    res.json({
      id: costing.id,
      jobcardId: costing.jobcard_id,
      labourHours,
      labourRate: costing.labour_rate,
      labourTotal,
      labourSpecialHours,
      labourSpecialRate: costing.labour_special_rate,
      labourSpecialTotal,
      materialsCost: costing.materials_cost,
      materialsProfitPercent: costing.materials_profit_percent,
      materialsTotal,
      subcontractorCost: costing.subcontractor_cost,
      subcontractorProfitPercent: costing.subcontractor_profit_percent,
      subcontractorTotal,
      grandTotal
    });
  } catch (err) {
    logger.error({ err }, 'Get costing error');
    res.status(500).json({ error: 'Failed to get costing' });
  }
});

// Update costing (admin only)
router.put('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const costingId = data.id || `costing:${Date.now()}:${uuidv4().slice(0, 8)}`;

    // Get existing costing for diff
    const existing = jobCostingQueries.getByJobcard.get(id);

    const hours = timeEntryQueries.getHoursByJobcard.get(id) || { labour_hours: 0, labour_special_hours: 0 };
    const labourHours = Math.round(hours.labour_hours * 100) / 100;
    const labourSpecialHours = Math.round(hours.labour_special_hours * 100) / 100;

    // Calculate totals
    const labourTotal = labourHours * (data.labourRate || 0);
    const labourSpecialTotal = labourSpecialHours * (data.labourSpecialRate || 0);
    const materialsTotal = (data.materialsCost || 0) * (1 + (data.materialsProfitPercent ?? 100) / 100);
    const subcontractorTotal = (data.subcontractorCost || 0) * (1 + (data.subcontractorProfitPercent || 0) / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    jobCostingQueries.createOrUpdate.run(
      costingId,
      id,
      labourHours,
      data.labourRate || 0,
      labourTotal,
      labourSpecialHours,
      data.labourSpecialRate || 0,
      labourSpecialTotal,
      data.materialsCost || 0,
      data.materialsProfitPercent ?? 100,
      materialsTotal,
      data.subcontractorCost || 0,
      data.subcontractorProfitPercent ?? 0,
      subcontractorTotal,
      grandTotal
    );

    // Build proper diff of changed fields
    const changes = {};
    const fieldsToTrack = [
      ['labour_hours', 'labourHours', labourHours],
      ['labour_rate', 'labourRate', data.labourRate || 0],
      ['labour_special_hours', 'labourSpecialHours', labourSpecialHours],
      ['labour_special_rate', 'labourSpecialRate', data.labourSpecialRate || 0],
      ['materials_cost', 'materialsCost', data.materialsCost || 0],
      ['materials_profit_percent', 'materialsProfitPercent', data.materialsProfitPercent ?? 100],
      ['subcontractor_cost', 'subcontractorCost', data.subcontractorCost || 0],
      ['subcontractor_profit_percent', 'subcontractorProfitPercent', data.subcontractorProfitPercent ?? 0],
      ['grand_total', 'grandTotal', grandTotal],
    ];
    for (const [dbField, changeKey, newValue] of fieldsToTrack) {
      const oldVal = existing ? Number(existing[dbField]) || 0 : 0;
      const newVal = Number(newValue) || 0;
      if (oldVal !== newVal) {
        changes[changeKey] = { from: oldVal, to: newVal };
      }
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update_costing', req.user.userId, req.user.name || req.user.username, changes, null);
    }

    res.json({ success: true, grandTotal });
  } catch (err) {
    logger.error({ err }, 'Update costing error');
    res.status(500).json({ error: 'Failed to update costing' });
  }
});

module.exports = router;
