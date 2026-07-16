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
    const hours = timeEntryQueries.getHoursByJobcard.get(req.params.id) || { labour_hours: 0 };
    // Round to thousandths of an hour (~3.6 s) so short entries still register instead of
    // rounding away to zero. Costs are derived from this, so tiny durations keep a tiny cost.
    // Only normal labour hours are auto-tallied from time entries; special-labour hours are
    // a manually-entered figure the admin types, read straight from the stored costing.
    // This is the "original calculated time" — always returned as labourHoursCalculated so
    // the screen can show it even when the admin has typed their own override.
    const labourHoursCalculated = Math.round(hours.labour_hours * 1000) / 1000;

    if (!costing) {
      return res.json({
        labourHours: labourHoursCalculated,
        labourHoursCalculated,
        labourHoursOverride: null,
        labourRate: 0,
        labourTotal: 0,
        labourSpecialHours: 0,
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
    // Special-labour hours are a manually-entered figure; guard against a stray null
    // so the total never comes back NaN.
    const labourSpecialHours = costing.labour_special_hours || 0;
    // A NULL override means "use the live tally"; a number means the admin typed their
    // own hours. The effective figure drives the labour total either way.
    const labourHoursOverride = costing.labour_hours_override == null ? null : costing.labour_hours_override;
    const effectiveLabourHours = labourHoursOverride == null ? labourHoursCalculated : labourHoursOverride;
    const labourTotal = effectiveLabourHours * costing.labour_rate;
    const labourSpecialTotal = labourSpecialHours * costing.labour_special_rate;
    const materialsTotal = costing.materials_cost * (1 + costing.materials_profit_percent / 100);
    const subcontractorTotal = costing.subcontractor_cost * (1 + costing.subcontractor_profit_percent / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    res.json({
      id: costing.id,
      jobcardId: costing.jobcard_id,
      labourHours: effectiveLabourHours,
      labourHoursCalculated,
      labourHoursOverride,
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

    const costingId = data.id || `costing:${uuidv4()}`;

    // Get existing costing for diff
    const existing = jobCostingQueries.getByJobcard.get(id);

    const hours = timeEntryQueries.getHoursByJobcard.get(id) || { labour_hours: 0 };
    // Round to thousandths of an hour (~3.6 s) so short entries still register instead of
    // rounding away to zero. Costs are derived from this, so tiny durations keep a tiny cost.
    // This is always kept as the "original calculated time", even when overridden.
    const labourHours = Math.round(hours.labour_hours * 1000) / 1000;

    // Labour hours can be overridden by hand. The client sends null (or omits it) to use
    // the live tally, or a number to type over it. Clamp a supplied number to non-negative.
    const labourHoursOverride =
      data.labourHoursOverride == null || data.labourHoursOverride === ''
        ? null
        : Math.max(0, Number(data.labourHoursOverride) || 0);
    const effectiveLabourHours = labourHoursOverride == null ? labourHours : labourHoursOverride;

    // Special-labour hours are entered by hand (not tallied from time entries), so take
    // them from the submitted form and clamp to a non-negative number.
    const labourSpecialHours = Math.max(0, Number(data.labourSpecialHours) || 0);
    const labourSpecialRate = Math.max(0, Number(data.labourSpecialRate) || 0);

    // Calculate totals — labour uses the effective (overridden or calculated) hours
    const labourTotal = effectiveLabourHours * (data.labourRate || 0);
    const labourSpecialTotal = labourSpecialHours * labourSpecialRate;
    const materialsTotal = (data.materialsCost || 0) * (1 + (data.materialsProfitPercent ?? 100) / 100);
    const subcontractorTotal = (data.subcontractorCost || 0) * (1 + (data.subcontractorProfitPercent || 0) / 100);
    const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;

    jobCostingQueries.createOrUpdate.run(
      costingId,
      id,
      labourHours,
      labourHoursOverride,
      data.labourRate || 0,
      labourTotal,
      labourSpecialHours,
      labourSpecialRate,
      labourSpecialTotal,
      data.materialsCost || 0,
      data.materialsProfitPercent ?? 100,
      materialsTotal,
      data.subcontractorCost || 0,
      data.subcontractorProfitPercent ?? 0,
      subcontractorTotal,
      grandTotal
    );

    // Build proper diff of changed fields.
    // The auto-tallied labour hours (labour_hours) are excluded so the audit trail doesn't
    // attribute an automatic recalculation to whoever opened and saved. A manual hours
    // override IS an admin action, so it is tracked (null/using-the-tally reads as 0).
    const changes = {};
    const fieldsToTrack = [
      ['labour_hours_override', 'labourHoursOverride', labourHoursOverride],
      ['labour_rate', 'labourRate', data.labourRate || 0],
      ['labour_special_hours', 'labourSpecialHours', labourSpecialHours],
      ['labour_special_rate', 'labourSpecialRate', labourSpecialRate],
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
