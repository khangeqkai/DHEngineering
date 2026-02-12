const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { authenticate, requireAdmin } = require('../middleware/auth');
const { jobCostingQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Get job card costing (admin only)
router.get('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const costing = jobCostingQueries.getByJobcard.get(req.params.id);
    if (!costing) {
      return res.json(null);
    }
    res.json({
      id: costing.id,
      jobcardId: costing.jobcard_id,
      labourHours: costing.labour_hours,
      labourRate: costing.labour_rate,
      labourTotal: costing.labour_total,
      labourSpecialHours: costing.labour_special_hours,
      labourSpecialRate: costing.labour_special_rate,
      labourSpecialTotal: costing.labour_special_total,
      materialsCost: costing.materials_cost,
      materialsProfitPercent: costing.materials_profit_percent,
      materialsTotal: costing.materials_total,
      subcontractorCost: costing.subcontractor_cost,
      subcontractorProfitPercent: costing.subcontractor_profit_percent,
      subcontractorTotal: costing.subcontractor_total,
      grandTotal: costing.grand_total
    });
  } catch (err) {
    console.error('Get costing error:', err);
    res.status(500).json({ error: 'Failed to get costing' });
  }
});

// Update costing (admin only)
router.put('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const costingId = data.id || `costing:${Date.now()}:${uuidv4().slice(0, 8)}`;

    // Calculate totals
    const labourTotal = (data.labourHours || 0) * (data.labourRate || 0);
    const labourSpecialTotal = (data.labourSpecialHours || 0) * (data.labourSpecialRate || 0);
    const materialsTotal = (data.materialsCost || 0) * (1 + (data.materialsProfitPercent || 100) / 100);
    const subcontractorTotal = (data.subcontractorCost || 0) * (1 + (data.subcontractorProfitPercent || 0) / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    jobCostingQueries.createOrUpdate.run(
      costingId,
      id,
      data.labourHours || 0,
      data.labourRate || 0,
      labourTotal,
      data.labourSpecialHours || 0,
      data.labourSpecialRate || 0,
      labourSpecialTotal,
      data.materialsCost || 0,
      data.materialsProfitPercent || 100,
      materialsTotal,
      data.subcontractorCost || 0,
      data.subcontractorProfitPercent || 0,
      subcontractorTotal,
      grandTotal
    );

    recordHistory('jobcard', id, 'update_costing', req.user.userId, req.user.name, { grandTotal }, null);

    res.json({ success: true, grandTotal });
  } catch (err) {
    console.error('Update costing error:', err);
    res.status(500).json({ error: 'Failed to update costing' });
  }
});

module.exports = router;
