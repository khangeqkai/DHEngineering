const express = require('express');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { jobCostingQueries, jobcardQueries, recordHistory } = require('../db/database');
const {
  computeLiveCosting,
  persistCosting,
  buildCostingResponse,
  buildFrozenResponse
} = require('../utils/costingCompute');

const router = express.Router();

// Get job card costing (admin only)
router.get('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const jobId = req.params.id;
    const job = jobcardQueries.getById.get(jobId);
    const existing = jobCostingQueries.getByJobcard.get(jobId);

    // A filed-away (invoiced) job is locked: return a frozen response so the screen
    // shows the "locked" state and never looks editable. With a stored snapshot we
    // return it verbatim (no recompute, so a later rate/schedule change never moves
    // an already-billed total); a job invoiced with nothing costed has no row, so we
    // hand back an all-zero response still flagged frozen rather than an editable one.
    if (job && job.archived === 1) {
      if (existing) return res.json(buildFrozenResponse(existing));
      const computed = computeLiveCosting(jobId, null);
      const response = buildCostingResponse(jobId, computed);
      response.frozen = true;
      return res.json(response);
    }

    // Open job: recompute live from logged time + current overtime settings. Read-only
    // here (nothing is written); the stored snapshot is saved on Save and at invoicing.
    const computed = computeLiveCosting(jobId, null);
    res.json(buildCostingResponse(jobId, computed));
  } catch (err) {
    logger.error({ err }, 'Get costing error');
    res.status(500).json({ error: 'Failed to get costing' });
  }
});

// Update costing (admin only)
router.put('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const jobId = req.params.id;
    const job = jobcardQueries.getById.get(jobId);

    // Invoiced costing is frozen — refuse edits so the billed figures can't move.
    if (job && job.archived === 1) {
      return res.status(409).json({
        error: 'This job is invoiced and filed away — its costing is locked.'
      });
    }

    const existing = jobCostingQueries.getByJobcard.get(jobId);
    const computed = computeLiveCosting(jobId, req.body);
    persistCosting(computed);

    // Diff for the audit trail. The auto-tallied tier hours (labour_*_hours) are
    // excluded so an automatic recalculation isn't attributed to whoever saved; the
    // hand overrides and the resulting totals ARE admin actions, so they're tracked.
    const changes = {};
    const fieldsToTrack = [
      ['labour_hours_override', 'labourHoursOverride'],
      ['labour_rate', 'labourRate'],
      ['labour_ot1_override', 'labourOt1Override'],
      ['labour_ot1_total', 'labourOt1Total'],
      ['labour_ot2_override', 'labourOt2Override'],
      ['labour_ot2_total', 'labourOt2Total'],
      ['labour_holiday_override', 'labourHolidayOverride'],
      ['labour_holiday_total', 'labourHolidayTotal'],
      ['labour_special_hours', 'labourSpecialHours'],
      ['labour_special_rate', 'labourSpecialRate'],
      ['materials_cost', 'materialsCost'],
      ['materials_profit_percent', 'materialsProfitPercent'],
      ['subcontractor_cost', 'subcontractorCost'],
      ['subcontractor_profit_percent', 'subcontractorProfitPercent'],
      ['grand_total', 'grandTotal'],
    ];
    for (const [dbField, changeKey] of fieldsToTrack) {
      const oldVal = existing ? Number(existing[dbField]) || 0 : 0;
      const newVal = Number(computed.row[dbField]) || 0;
      if (oldVal !== newVal) {
        changes[changeKey] = { from: oldVal, to: newVal };
      }
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', jobId, 'update_costing', req.user.userId, req.user.name || req.user.username, changes, null);
    }

    res.json({ success: true, grandTotal: computed.row.grand_total });
  } catch (err) {
    logger.error({ err }, 'Update costing error');
    res.status(500).json({ error: 'Failed to update costing' });
  }
});

module.exports = router;
