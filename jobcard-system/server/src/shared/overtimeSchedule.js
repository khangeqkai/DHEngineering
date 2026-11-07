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

const SHORT_DAY = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

// 0-23 -> "12 am", "3 pm"; 24 (the end of the day) reads as midnight.
function clockWord(h) {
  const hour = h % 24;
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return { text: `${twelve}`, suffix };
}

// The hour ranges of one day that carry `tier`, as words: "3-5 pm", "5 pm-6 am", or ''
// when the tier covers the whole day (the day name alone says it). Returns null when the
// tier has no hours that day.
function dayRangesWords(blocks, tier) {
  const grid = gridFromBlocks(cleanDayBlocks(blocks).length ? cleanDayBlocks(blocks) : DEFAULT_DAY);
  const ranges = [];
  let start = null;
  for (let h = 0; h <= 24; h++) {
    const on = h < 24 && grid[h] === tier;
    if (on && start === null) start = h;
    if (!on && start !== null) { ranges.push([start, h]); start = null; }
  }
  if (ranges.length === 0) return null;
  if (ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === 24) return '';
  return ranges.map(([a, b]) => {
    const from = clockWord(a);
    const to = clockWord(b);
    return from.suffix === to.suffix ? `${from.text}\u2013${to.text} ${to.suffix}` : `${from.text} ${from.suffix}\u2013${to.text} ${to.suffix}`;
  }).join(' and ');
}

// Where a tier applies in the weekly schedule, in plain words read straight from the
// painted hours: "Mon\u2013Fri 3\u20135 pm", "Sat", "Mon\u2013Fri 5 pm\u20136 am; Sat". Days with the same hours
// are joined, consecutive days become a range. "none" when the tier is not used.
function describeTierHours(schedule, tier) {
  const groups = [];
  for (const d of DAYS) {
    const words = dayRangesWords(schedule && schedule[d], tier);
    if (words === null) continue;
    const found = groups.find(g => g.words === words);
    if (found) found.days.push(d); else groups.push({ words, days: [d] });
  }
  if (groups.length === 0) return 'none';
  const dayWords = (days) => {
    if (days.length === DAYS.length) return 'Every day';
    const runs = [];
    for (const d of days) {
      const last = runs[runs.length - 1];
      if (last && DAYS.indexOf(d) === DAYS.indexOf(last[last.length - 1]) + 1) last.push(d); else runs.push([d]);
    }
    return runs.map(r => (r.length === 1 ? SHORT_DAY[r[0]] : r.length === 2 ? `${SHORT_DAY[r[0]]}, ${SHORT_DAY[r[1]]}` : `${SHORT_DAY[r[0]]}\u2013${SHORT_DAY[r[r.length - 1]]}`)).join(', ');
  };
  return groups.map(g => `${dayWords(g.days)}${g.words ? ` ${g.words}` : ''}`).join('; ');
}

// The same, capped for a one-line summary: a tier whose hours fall into more than two
// distinct day-patterns would read as a paragraph, so it just says it varies. `where` names
// the place the full picture is ("below" / "above" the line).
const MAX_SUMMARY_PATTERNS = 2;
function summariseTierHours(schedule, tier, where) {
  const patterns = new Set();
  for (const d of DAYS) {
    const words = dayRangesWords(schedule && schedule[d], tier);
    if (words !== null) patterns.add(words);
  }
  if (patterns.size > MAX_SUMMARY_PATTERNS) return `varies by day, see the schedule ${where}`;
  return describeTierHours(schedule, tier);
}

module.exports = { DAYS, TIERS, DEFAULT_DAY, describeTierHours, summariseTierHours, cleanDayBlocks, gridFromBlocks, blocksFromGrid, scheduleDayToWholeHours, scheduleToWholeHours };
