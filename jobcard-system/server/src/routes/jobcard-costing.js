const express = require('express');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { jobCostingQueries, recordHistory } = require('../db/database');
const {
  computeLiveCosting,
  persistCosting,
  buildCostingResponse
} = require('../utils/costingCompute');

const router = express.Router();

// Get job card costing (admin only)
router.get('/:id/costing', authenticate, requireAdmin, (req, res) => {
  try {
    const jobId = req.params.id;

    // Every job — open or invoiced — owns its own overtime rules and rate, so recomputing
    // on the spot from logged time + those captured rules always reproduces the billed
    // number. There is nothing to lock or freeze; an invoiced job is edited behind an
    // on-screen confirm, not blocked here.
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
    const existing = jobCostingQueries.getByJobcard.get(jobId);

    // An invoiced job is not blocked here: the screen asks the user to confirm before
    // saving, and the edit simply recalculates from the job's own captured rules.
    const computed = computeLiveCosting(jobId, req.body);
    persistCosting(computed);

    // Diff for the audit trail. The auto-tallied tier hours (labour_*_hours) are
    // excluded so an automatic recalculation isn't attributed to whoever saved; the
    // hand overrides and the resulting totals ARE admin actions, so they're tracked.
    const changes = {};
    // Override columns are NULL when the job follows the automatic figure / standard
    // multiplier. Reading them as a plain number would show a cleared override as
    // "→ 0" (and hide a none→zero flip entirely), so they're audited with a word for
    // the NULL state: 'auto' for hours, 'standard' for multipliers. Every other field
    // is a real number.
    const HOURS_OVERRIDES = new Set([
      'labour_hours_override', 'labour_ot1_override', 'labour_ot2_override', 'labour_holiday_override',
    ]);
    const MULTIPLIER_OVERRIDES = new Set([
      'labour_ot1_multiplier_override', 'labour_ot2_multiplier_override',
    ]);
    // The three manual cost lines carry a free-text note saying what the cost covers.
    // They're text, so they're read as a string (an empty note shows as a dash rather
    // than the "0" a numeric read would produce).
    const TEXT_FIELDS = new Set([
      'labour_special_description', 'materials_description', 'subcontractor_description',
    ]);
    const auditValue = (dbField, row) => {
      const raw = row ? row[dbField] : null;
      if (TEXT_FIELDS.has(dbField)) return raw == null || raw === '' ? '—' : String(raw);
      if (HOURS_OVERRIDES.has(dbField)) return raw == null ? 'auto' : Number(raw) || 0;
      if (MULTIPLIER_OVERRIDES.has(dbField)) return raw == null ? 'standard' : Number(raw) || 0;
      return Number(raw) || 0;
    };
    const fieldsToTrack = [
      ['labour_hours_override', 'labourHoursOverride'],
      ['labour_rate', 'labourRate'],
      ['labour_ot1_override', 'labourOt1Override'],
      ['labour_ot1_multiplier_override', 'labourOt1MultiplierOverride'],
      ['labour_ot1_total', 'labourOt1Total'],
      ['labour_ot2_override', 'labourOt2Override'],
      ['labour_ot2_multiplier_override', 'labourOt2MultiplierOverride'],
      ['labour_ot2_total', 'labourOt2Total'],
      ['labour_holiday_override', 'labourHolidayOverride'],
      ['labour_holiday_total', 'labourHolidayTotal'],
      ['labour_special_hours', 'labourSpecialHours'],
      ['labour_special_rate', 'labourSpecialRate'],
      ['labour_special_description', 'labourSpecialDescription'],
      ['materials_cost', 'materialsCost'],
      ['materials_profit_percent', 'materialsProfitPercent'],
      ['materials_description', 'materialsDescription'],
      ['subcontractor_cost', 'subcontractorCost'],
      ['subcontractor_profit_percent', 'subcontractorProfitPercent'],
      ['subcontractor_description', 'subcontractorDescription'],
      ['grand_total', 'grandTotal'],
    ];
    for (const [dbField, changeKey] of fieldsToTrack) {
      const oldVal = auditValue(dbField, existing);
      const newVal = auditValue(dbField, computed.row);
      if (oldVal !== newVal) {
        changes[changeKey] = { from: oldVal, to: newVal };
      }
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', jobId, 'update_costing', req.user.userId, req.user.name || req.user.username, changes, null);
    }

    // Hand back the freshly computed figures, not just an acknowledgement: the server
    // folds in any time logged since the screen loaded, so the totals it just stored can
    // differ from the ones the screen worked out. The screen adopts these when nothing
    // was typed while the save was in flight, which keeps what's shown and what's stored
    // the same figure.
    res.json({ success: true, costing: buildCostingResponse(jobId, computed) });
  } catch (err) {
    logger.error({ err }, 'Update costing error');
    res.status(500).json({ error: 'Failed to update costing' });
  }
});

module.exports = router;
