// Shared costing computation. Turns a job's logged time + the job's own captured
// overtime rules + the submitted (or stored) form into the full set of costing values.
// Used by the costing GET/PUT routes so the numbers are worked out in exactly one place.

const { v4: uuidv4 } = require('uuid');
const { jobCostingQueries, timeEntryQueries } = require('../db/database');
const { splitHours } = require('./overtimeSplit');
const { readOvertimeSettings, parseSchedule, parseHolidays, num } = require('./overtimeSettings');
const { roundTo } = require('../shared/round');
const { COSTING_DEFAULTS } = require('./costingDefaults');

// This job's own captured overtime rules (schedule, holidays, timezone, base
// multipliers) if it has one, else today's live company settings. `existing` is
// a job_costings row (or null/undefined for a not-yet-captured job); `ot` is
// readOvertimeSettings()'s live snapshot. Never taken from a submitted form —
// the client can't change a job's rules, only its rate/overrides — so the
// rules stay write-once from creation. The one lookup every reader of a job's
// overtime baseline goes through: computeLiveCosting below, and the Workshop
// Statistics route (server/src/routes/statistics.js), which only needs the
// schedule/holidays/timezone piece of it.
function jobOvertimeBaseline(existing, ot) {
  return {
    schedule: existing && existing.labour_schedule
      ? parseSchedule(existing.labour_schedule) : ot.schedule,
    holidays: existing && existing.labour_public_holidays
      ? parseHolidays(existing.labour_public_holidays) : ot.holidays,
    timezone: (existing && existing.labour_timezone) || ot.timezone,
    ot1Mult: existing && existing.labour_base_ot1_multiplier != null
      ? num(existing.labour_base_ot1_multiplier, ot.ot1Mult) : ot.ot1Mult,
    ot2Mult: existing && existing.labour_base_ot2_multiplier != null
      ? num(existing.labour_base_ot2_multiplier, ot.ot2Mult) : ot.ot2Mult,
    holidayMult: existing && existing.labour_base_holiday_multiplier != null
      ? num(existing.labour_base_holiday_multiplier, ot.holidayMult) : ot.holidayMult
  };
}

// Compute all costing values for a job from its OWN captured overtime rules + logged
// time. `incoming` is the submitted form (PUT); pass null to recompute purely from the
// stored row, keeping the admin's saved rate/overrides.
//
// The overtime rules (schedule, holidays, timezone, base multipliers) are read from the
// job's own stored copy — captured once when the job was created and never moved by a
// later change to the company settings, exactly how labour_rate already works. Live
// settings are used only as the fallback for a job that has no captured copy yet (a
// brand-new job on its first compute, or an old pre-feature row), and that first compute
// writes the captured copy into the row, so from then on the job owns its rules.
function computeLiveCosting(jobId, incoming) {
  return computeCosting(
    jobId,
    jobCostingQueries.getByJobcard.get(jobId) || null,
    timeEntryQueries.getCompletedByJobcard.all(jobId),
    readOvertimeSettings(),
    incoming
  );
}

// The working behind computeLiveCosting, from values already read: the job's stored
// costing row (or null), its completed time blocks, and readOvertimeSettings()'s
// snapshot. Reads nothing itself, so a caller pricing many jobs at once (Workshop
// Statistics' invoiced totals) can load every row and block in one read each and
// still get exactly the figure the pricing sheet shows.
function computeCosting(jobId, existing, entries, ot, incoming) {
  const src = incoming || {};
  // Decided per figure, not per request: a save that carries some boxes and not others
  // keeps the stored value for the ones it left out. (Checking only "was anything
  // sent?" made a partial body zero every figure it didn't mention.) The screen sends
  // only the figures it changed, so another admin's saved figures are never overwritten
  // by this screen's out-of-date copy of them.
  const has = (key) => Object.prototype.hasOwnProperty.call(src, key);
  // A figure only counts as sent when it is a real, finite number. One too long to fit
  // (a pasted 400-digit figure reads as Infinity) or junk text is treated as not sent —
  // the stored value stands — rather than read as 0, or as "use the automatic figure".
  const sentFigure = (key) => has(key) && Number.isFinite(Number(src[key]));

  const baseline = jobOvertimeBaseline(existing, ot);
  const split = splitHours(entries, baseline);

  const normalCalc = roundTo(split.normalHours, 2);
  const ot1Calc = roundTo(split.ot1Hours, 2);
  const ot2Calc = roundTo(split.ot2Hours, 2);
  const holidayCalc = roundTo(split.holidayHours, 2);

  // An override is null (= use the auto value) or a hand-typed number floored at
  // `min` (0 for hours; 1 for multipliers, since below 1 would undercharge OT).
  // Take it from the submitted form on a save, else keep whatever the row holds.
  const pickOverride = (incomingKey, existingCol, min = 0) => {
    if (has(incomingKey)) {
      const v = src[incomingKey];
      if (v == null || v === '') return null;
      if (sentFigure(incomingKey)) return Math.max(min, Number(v));
    }
    return existing && existing[existingCol] != null ? existing[existingCol] : null;
  };
  const pickNum = (incomingKey, existingCol, dflt) => {
    if (sentFigure(incomingKey)) return Math.max(0, Number(src[incomingKey]));
    return existing ? num(existing[existingCol], dflt) : dflt;
  };
  // Like pickNum but with a non-zero default for an omitted field. Submitted values
  // are floored at 0 (a negative margin is a typo, not a pricing strategy — matching
  // the client, which snaps a minus sign to 0); a stored value is used as-is, so an
  // old row that already holds a negative margin keeps it until someone edits it.
  const pickRaw = (incomingKey, existingCol, dflt) => {
    if (sentFigure(incomingKey)) return Math.max(0, Number(src[incomingKey]));
    return existing ? num(existing[existingCol], dflt) : dflt;
  };
  // Free-text note on a manual cost line. Trimmed and length-capped; an empty note is
  // stored as NULL so "no note" is one value rather than a mix of null and ''.
  const pickText = (incomingKey, existingCol) => {
    const raw = has(incomingKey) ? src[incomingKey] : (existing ? existing[existingCol] : null);
    const text = typeof raw === 'string' ? raw.trim().slice(0, 300) : '';
    return text || null;
  };

  const normalOverride = pickOverride('labourHoursOverride', 'labour_hours_override');
  const ot1Override = pickOverride('labourOt1Override', 'labour_ot1_override');
  const ot2Override = pickOverride('labourOt2Override', 'labour_ot2_override');
  const holidayOverride = pickOverride('labourHolidayOverride', 'labour_holiday_override');

  // Per-job overtime multipliers — same override pattern as the hours: NULL means
  // "follow this job's own captured baseline", a number is a hand-typed deviation. The
  // effective multiplier is what gets stored in labour_*_multiplier and charged.
  const ot1MultOverride = pickOverride('labourOt1MultiplierOverride', 'labour_ot1_multiplier_override', 1);
  const ot2MultOverride = pickOverride('labourOt2MultiplierOverride', 'labour_ot2_multiplier_override', 1);
  const effOt1Mult = ot1MultOverride == null ? baseline.ot1Mult : ot1MultOverride;
  const effOt2Mult = ot2MultOverride == null ? baseline.ot2Mult : ot2MultOverride;

  // Per-job base hourly rate. A saved job owns its rate (stored in labour_rate); a job
  // that has never been costed yet has no row, so it falls back to the current company
  // default as a starting suggestion. The default only ever seeds a rate — once the job
  // has a rate of its own, a later change to the company default never moves it.
  const rate = pickNum('labourRate', 'labour_rate', ot.defaultRate);

  const effNormal = normalOverride == null ? normalCalc : normalOverride;
  const effOt1 = ot1Override == null ? ot1Calc : ot1Override;
  const effOt2 = ot2Override == null ? ot2Calc : ot2Override;
  const effHoliday = holidayOverride == null ? holidayCalc : holidayOverride;

  // Every money line is rounded to whole cents where it is worked out, and the grand
  // total adds up those rounded lines — otherwise plain multiplication stores and audits
  // figures like 51.74999999999999 for 1.15 h at $45.
  const normalTotal = roundTo(effNormal * rate, 2);
  const ot1Total = roundTo(effOt1 * rate * effOt1Mult, 2);
  const ot2Total = roundTo(effOt2 * rate * effOt2Mult, 2);
  const holidayTotal = roundTo(effHoliday * rate * baseline.holidayMult, 2);

  const specialHours = pickNum('labourSpecialHours', 'labour_special_hours', 0);
  const specialRate = pickNum('labourSpecialRate', 'labour_special_rate', 0);
  const specialTotal = roundTo(specialHours * specialRate, 2);
  const specialDescription = pickText('labourSpecialDescription', 'labour_special_description');

  const materialsCost = pickNum('materialsCost', 'materials_cost', 0);
  const materialsProfit = pickRaw('materialsProfitPercent', 'materials_profit_percent', COSTING_DEFAULTS.materialsProfitPercent);
  const materialsTotal = roundTo(materialsCost * (1 + materialsProfit / 100), 2);
  const materialsDescription = pickText('materialsDescription', 'materials_description');

  const subCost = pickNum('subcontractorCost', 'subcontractor_cost', 0);
  const subProfit = pickRaw('subcontractorProfitPercent', 'subcontractor_profit_percent', COSTING_DEFAULTS.subcontractorProfitPercent);
  const subTotal = roundTo(subCost * (1 + subProfit / 100), 2);
  const subDescription = pickText('subcontractorDescription', 'subcontractor_description');

  const grandTotal = roundTo(
    normalTotal + ot1Total + ot2Total + holidayTotal + specialTotal + materialsTotal + subTotal, 2);

  const row = {
    id: (existing && existing.id) || src.id || `costing:${uuidv4()}`,
    jobcard_id: jobId,
    labour_hours: normalCalc,
    labour_hours_override: normalOverride,
    labour_rate: rate,
    labour_total: normalTotal,
    labour_ot1_hours: ot1Calc,
    labour_ot1_override: ot1Override,
    labour_ot1_total: ot1Total,
    labour_ot2_hours: ot2Calc,
    labour_ot2_override: ot2Override,
    labour_ot2_total: ot2Total,
    labour_holiday_hours: holidayCalc,
    labour_holiday_override: holidayOverride,
    labour_holiday_total: holidayTotal,
    labour_ot1_multiplier: effOt1Mult,
    labour_ot2_multiplier: effOt2Mult,
    labour_holiday_multiplier: baseline.holidayMult,
    labour_ot1_multiplier_override: ot1MultOverride,
    labour_ot2_multiplier_override: ot2MultOverride,
    // The job's own captured overtime rules (write-once at creation). Storing them back
    // every compute is a no-op once set — read-from-existing feeds the same values in.
    labour_schedule: JSON.stringify(baseline.schedule),
    labour_public_holidays: JSON.stringify(baseline.holidays),
    labour_timezone: baseline.timezone,
    labour_base_ot1_multiplier: baseline.ot1Mult,
    labour_base_ot2_multiplier: baseline.ot2Mult,
    labour_base_holiday_multiplier: baseline.holidayMult,
    labour_special_hours: specialHours,
    labour_special_rate: specialRate,
    labour_special_total: specialTotal,
    labour_special_description: specialDescription,
    materials_cost: materialsCost,
    materials_profit_percent: materialsProfit,
    materials_total: materialsTotal,
    materials_description: materialsDescription,
    subcontractor_cost: subCost,
    subcontractor_profit_percent: subProfit,
    subcontractor_total: subTotal,
    subcontractor_description: subDescription,
    grand_total: grandTotal
  };

  return {
    row,
    calc: { normalCalc, ot1Calc, ot2Calc, holidayCalc },
    effective: { effNormal, effOt1, effOt2, effHoliday },
    // Effective multipliers drive the boxes; the *Calc values are this job's own
    // captured baseline, shown as the "standard" reference (what the job was created
    // under) that an overridden multiplier snaps back to.
    multipliers: {
      ot1: effOt1Mult, ot2: effOt2Mult, holiday: baseline.holidayMult,
      ot1Calc: baseline.ot1Mult, ot2Calc: baseline.ot2Mult
    },
    defaultRate: ot.defaultRate
  };
}

function persistCosting(computed) {
  jobCostingQueries.createOrUpdate.run(computed.row);
}

// The API shape the costing screen consumes. Effective hours drive the boxes;
// the *Calculated figures are the "from logged time" reference under each line.
function buildCostingResponse(jobId, computed) {
  const { row, calc, effective, multipliers, defaultRate } = computed;
  return {
    id: row.id,
    jobcardId: jobId,
    labourHours: effective.effNormal,
    labourHoursCalculated: calc.normalCalc,
    labourHoursOverride: row.labour_hours_override,
    labourRate: row.labour_rate,
    // The current company default — shown only as a "use default" convenience on the
    // costing screen; it does not drive the job's rate (the job owns labour_rate).
    labourDefaultRate: defaultRate,
    labourTotal: row.labour_total,

    labourOt1Hours: effective.effOt1,
    labourOt1HoursCalculated: calc.ot1Calc,
    labourOt1Override: row.labour_ot1_override,
    labourOt1Total: row.labour_ot1_total,
    labourOt1Multiplier: multipliers.ot1,
    labourOt1MultiplierCalculated: multipliers.ot1Calc,
    labourOt1MultiplierOverride: row.labour_ot1_multiplier_override,

    labourOt2Hours: effective.effOt2,
    labourOt2HoursCalculated: calc.ot2Calc,
    labourOt2Override: row.labour_ot2_override,
    labourOt2Total: row.labour_ot2_total,
    labourOt2Multiplier: multipliers.ot2,
    labourOt2MultiplierCalculated: multipliers.ot2Calc,
    labourOt2MultiplierOverride: row.labour_ot2_multiplier_override,

    labourHolidayHours: effective.effHoliday,
    labourHolidayHoursCalculated: calc.holidayCalc,
    labourHolidayOverride: row.labour_holiday_override,
    labourHolidayTotal: row.labour_holiday_total,
    labourHolidayMultiplier: multipliers.holiday,

    labourSpecialHours: row.labour_special_hours,
    labourSpecialRate: row.labour_special_rate,
    labourSpecialTotal: row.labour_special_total,
    labourSpecialDescription: row.labour_special_description,
    materialsCost: row.materials_cost,
    materialsProfitPercent: row.materials_profit_percent,
    materialsTotal: row.materials_total,
    materialsDescription: row.materials_description,
    subcontractorCost: row.subcontractor_cost,
    subcontractorProfitPercent: row.subcontractor_profit_percent,
    subcontractorTotal: row.subcontractor_total,
    subcontractorDescription: row.subcontractor_description,
    grandTotal: row.grand_total
  };
}

module.exports = {
  computeLiveCosting,
  computeCosting,
  persistCosting,
  buildCostingResponse,
  jobOvertimeBaseline
};
