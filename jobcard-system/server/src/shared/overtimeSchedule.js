// The one place that knows the overtime schedule's shape — which days exist, which
// tiers a block can carry, and the all-normal starting day. No database import here
// on purpose: the schema (init.js), the settings routes (settings-overtime.js) and the
// settings reader (overtimeSettings.js) all need this shape without pulling each other
// in, and this file is read by client code too (see overtime.json) — the Vite plugin in
// client/vite.config.js rewrites this file's CommonJS shape into an ES module for the
// browser, so the schedule editor's grid math and the server's snapping are one shared
// implementation, not two written twice.
const overtimeShape = require('./overtime.json');

const DAYS = overtimeShape.days;
const TIERS = overtimeShape.tiers;
const DEFAULT_DAY = [{ start: '00:00', tier: 'normal' }];

// Drop blocks whose start isn't 'HH:MM', fold an unknown tier to 'normal', sort by
// start. Leaves sub-hour starts alone — this is the cleaning both a whole-hour
// snap and a plain display pass need, before they diverge on what to do next.
function cleanDayBlocks(day) {
  return (Array.isArray(day) ? day : [])
    .filter(b => b && /^\d{2}:\d{2}$/.test(b.start))
    .map(b => ({ start: b.start, tier: TIERS.includes(b.tier) ? b.tier : 'normal' }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// A day's cleaned blocks → the tier for each of the 24 hours. The day is a cycle: the
// hours before the earliest block take the LAST block's tier (it wraps past midnight).
function gridFromBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  const grid = new Array(24);
  const wrapTier = sorted[sorted.length - 1].tier;
  for (let h = 0; h < 24; h++) {
    const m = h * 60;
    let tier = wrapTier;
    for (const b of sorted) {
      if (toMin(b.start) <= m) tier = b.tier; else break;
    }
    grid[h] = tier;
  }
  return grid;
}

// 24 hourly tiers → the compact block list the server stores. A block begins at each
// hour whose tier differs from the hour before it (wrapping hour 0 back to hour 23).
// An all-one-tier day collapses to a single block. Starts are unique and ascending.
function blocksFromGrid(grid) {
  const blocks = [];
  for (let h = 0; h < 24; h++) {
    const prevTier = grid[(h + 23) % 24];
    if (grid[h] !== prevTier) blocks.push({ start: hourLabel(h), tier: grid[h] });
  }
  if (blocks.length === 0) blocks.push({ start: '00:00', tier: grid[0] });
  return blocks;
}

// Canonicalise one day's blocks to whole-hour boundaries using the SAME cycle
// semantics the schedule editor and the minute-splitter use: clean the day, build the
// 24 hourly tiers (each hour classified at its top-of-hour minute; the hours before the
// earliest block wrap to the last block's tier), then fold that back into a compact
// block list with a block at each hour whose tier differs from the hour before it.
// Legacy data could hold sub-hour starts (e.g. 14:30) the new hour-grid can't show;
// this snaps the stored data to match what's shown and billed. Whole-hour data passes
// through unchanged. An empty/all-invalid day returns a fresh copy of DEFAULT_DAY.
function scheduleDayToWholeHours(day) {
  const cleaned = cleanDayBlocks(day);
  if (cleaned.length === 0) return DEFAULT_DAY.map(b => ({ ...b }));
  return blocksFromGrid(gridFromBlocks(cleaned));
}

// Snap a whole weekly schedule to whole-hour block starts. Used by the one-time
// startup conversion and by backup restore, so a restored backup can never bring
// sub-hour boundaries back. `changed` is false when nothing needed snapping.
function scheduleToWholeHours(sched) {
  const schedule = {};
  let changed = false;
  for (const d of DAYS) {
    const before = sched?.[d];
    const after = scheduleDayToWholeHours(before);
    schedule[d] = after;
    if (JSON.stringify(after) !== JSON.stringify(before)) changed = true;
  }
  return { schedule, changed };
}

module.exports = { DAYS, TIERS, DEFAULT_DAY, cleanDayBlocks, gridFromBlocks, blocksFromGrid, scheduleDayToWholeHours, scheduleToWholeHours };
