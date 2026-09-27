// The one reader of the company's overtime setup (weekly schedule, public holidays,
// time zone, default rate, tier multipliers). costingCompute.js and statistics.js both
// read the same company rules through here, so there is exactly one place that knows
// how a stored schedule/holidays JSON blob is parsed and defaulted.

const { getSettings } = require('../db/database');
const { officeTimeZone } = require('./officeTime');
const { COSTING_DEFAULTS } = require('./costingDefaults');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DEFAULT_DAY = [{ start: '00:00', tier: 'normal' }];

const num = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

function parseSchedule(raw) {
  let obj = {};
  try { obj = raw ? JSON.parse(raw) : {}; } catch { obj = {}; }
  const out = {};
  for (const d of DAYS) {
    const blocks = Array.isArray(obj[d]) ? obj[d] : null;
    out[d] = (blocks && blocks.length) ? blocks : DEFAULT_DAY;
  }
  return out;
}

function parseHolidays(raw) {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// Read the live overtime configuration from settings.
function readOvertimeSettings() {
  const s = getSettings();
  return {
    schedule: parseSchedule(s.labour_schedule),
    holidays: parseHolidays(s.labour_public_holidays),
    timezone: officeTimeZone(),
    defaultRate: num(s.labour_default_rate, COSTING_DEFAULTS.labourDefaultRate),
    ot1Mult: num(s.labour_ot1_multiplier, COSTING_DEFAULTS.ot1Multiplier),
    ot2Mult: num(s.labour_ot2_multiplier, COSTING_DEFAULTS.ot2Multiplier),
    holidayMult: num(s.labour_holiday_multiplier, COSTING_DEFAULTS.holidayMultiplier)
  };
}

module.exports = { readOvertimeSettings, parseSchedule, parseHolidays, DAYS, DEFAULT_DAY, num };
