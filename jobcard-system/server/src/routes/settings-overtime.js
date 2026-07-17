// Validation + collection for the overtime configuration fields of a settings save
// (time zone, weekly schedule, default hourly rate, multipliers, public holidays).
// Kept beside settings.js the same way backup-helpers.js is.

const SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SCHEDULE_TIERS = ['normal', 'ot1', 'ot2'];

// The overtime configuration is admin-only (managers get every other setting).
// These lists let settings.js reject a manager's attempt to save any of these
// fields and strip them from what a manager reads back.
const OVERTIME_BODY_KEYS = [
  'timezone', 'labourSchedule', 'labourDefaultRate',
  'labourOt1Multiplier', 'labourOt2Multiplier', 'labourHolidayMultiplier',
  'labourPublicHolidays'
];
const OVERTIME_DB_KEYS = [
  'timezone', 'labour_schedule', 'labour_default_rate',
  'labour_ot1_multiplier', 'labour_ot2_multiplier', 'labour_holiday_multiplier',
  'labour_public_holidays'
];

// Validate a weekly schedule. Returns an error string, or null if valid.
// Each day must be a non-empty, start-ordered (strictly increasing) block list. The
// day is a 24-hour cycle: a block runs until the next block's start, and the time
// before the earliest block wraps to the last block — so any single well-ordered set
// of blocks covers every minute. The first block need NOT start at 00:00.
function validateSchedule(input) {
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch { return 'Schedule must be valid JSON'; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'Schedule must be an object of days';
  for (const day of SCHEDULE_DAYS) {
    const blocks = obj[day];
    if (!Array.isArray(blocks) || blocks.length === 0) return `Schedule day "${day}" must have at least one block`;
    let prev = null;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!b || typeof b !== 'object') return `Schedule day "${day}" has an invalid block`;
      if (!/^\d{2}:\d{2}$/.test(b.start)) return `Schedule day "${day}" has an invalid start time`;
      const [h, m] = b.start.split(':').map(Number);
      if (h > 23 || m > 59) return `Schedule day "${day}" has an out-of-range start time`;
      if (prev !== null && b.start <= prev) return `Schedule day "${day}" blocks must be in increasing time order`;
      if (!SCHEDULE_TIERS.includes(b.tier)) return `Schedule day "${day}" has an invalid tier`;
      prev = b.start;
    }
  }
  return null;
}

// Keep only the recognised days/fields so nothing extra is persisted.
function normalizeSchedule(obj) {
  const out = {};
  for (const day of SCHEDULE_DAYS) {
    out[day] = obj[day].map(b => ({ start: b.start, tier: b.tier }));
  }
  return out;
}

// Validate every overtime configuration field present on a settings save and turn
// them into ready-to-persist snake_case updates. Returns { error } on the first
// invalid field, else { updates } (empty object when none of these fields were sent).
function collectOvertimeUpdates(body) {
  const updates = {};

  // Time zone the overtime schedule and public holidays are measured against. Must
  // be a zone the system recognises (checked by trying to format against it), so a
  // typo can't silently shift every overtime window.
  const timezone = body.timezone;
  if (timezone !== undefined) {
    if (typeof timezone !== 'string' || !timezone.trim()) {
      return { error: 'Time zone is required' };
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      return { error: `Unrecognised time zone: ${timezone}` };
    }
    updates.timezone = timezone;
  }

  // Weekly schedule: 7 days, each a gap-free start-ordered block list. Stored as JSON.
  const labourSchedule = body.labourSchedule;
  if (labourSchedule !== undefined) {
    const err = validateSchedule(labourSchedule);
    if (err) return { error: err };
    const parsed = typeof labourSchedule === 'string' ? JSON.parse(labourSchedule) : labourSchedule;
    updates.labour_schedule = JSON.stringify(normalizeSchedule(parsed));
  }

  // Company default hourly rate — seeds each NEW job's base rate at creation (the job
  // owns its rate from then on). Must be a finite number ≥ 0.
  const defaultRate = body.labourDefaultRate;
  if (defaultRate !== undefined) {
    const n = Number(defaultRate);
    if (!Number.isFinite(n) || n < 0) {
      return { error: 'Default hourly rate must be a number of 0 or more' };
    }
    updates.labour_default_rate = String(n);
  }

  // Overtime multipliers — must be a finite number ≥ 1 (below 1 would undercharge OT).
  for (const [bodyKey, dbKey, label] of [
    ['labourOt1Multiplier', 'labour_ot1_multiplier', 'Overtime 1 multiplier'],
    ['labourOt2Multiplier', 'labour_ot2_multiplier', 'Overtime 2 multiplier'],
    ['labourHolidayMultiplier', 'labour_holiday_multiplier', 'Public holiday multiplier'],
  ]) {
    const raw = body[bodyKey];
    if (raw !== undefined) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) {
        return { error: `${label} must be a number of 1 or more` };
      }
      updates[dbKey] = String(n);
    }
  }

  // Public holidays: array of YYYY-MM-DD local dates. De-duped and sorted. Stored as JSON.
  const publicHolidays = body.labourPublicHolidays;
  if (publicHolidays !== undefined) {
    let list = publicHolidays;
    if (typeof list === 'string') {
      try { list = JSON.parse(list); } catch { return { error: 'Public holidays must be a list of dates' }; }
    }
    if (!Array.isArray(list)) {
      return { error: 'Public holidays must be a list of dates' };
    }
    const clean = [];
    for (const d of list) {
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(Date.parse(d))) {
        return { error: `Invalid holiday date: ${d}` };
      }
      if (!clean.includes(d)) clean.push(d);
    }
    clean.sort();
    updates.labour_public_holidays = JSON.stringify(clean);
  }

  return { updates };
}

module.exports = { collectOvertimeUpdates, OVERTIME_BODY_KEYS, OVERTIME_DB_KEYS };
