// Split completed logged time into labour tiers (normal / OT1 / OT2 / holiday) by
// WHEN each minute of work happened, against a weekly schedule + public-holiday list.
//
// Times are stored as UTC ISO strings; the schedule is written in local wall-clock, so
// every minute has to be read against the office's own clock before it can be
// classified. Asking Intl for that reading one minute at a time is exact but far too
// slow to run over a whole workshop's history — it froze the statistics page for
// seconds on end, and the server is single-threaded, so everyone else froze with it.
//
// So the span is first cut into stretches over which the zone's offset from UTC never
// moves. Daylight-saving changeovers are found by probing and then narrowed to the
// exact minute they take effect. Inside a stretch the local clock is plain arithmetic,
// with no Intl at all. Midnight-spanning entries, block boundaries and daylight saving
// still come out exactly as before — the only thing that changed is how often the
// clock is consulted.
//
// Nor is the stretch walked a minute at a time: a weekday's tiers are folded into runs
// (a run lasts until the tier next changes), and each piece of a block that sits on one
// local day and one offset is laid across those runs in one step. The totals are the
// same as summing minute by minute, because the tier is constant along a run — but a
// four-hour block costs a handful of steps instead of 240, which matters when
// Workshop Statistics splits every block of several years' history in one request.

const { makeOfficeFormatter, officeOffsetAt } = require('./officeTime');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

// Epoch day 0 (1 January 1970) was a Thursday, so day index + 4 lands on Sunday = 0.
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// 'HH:MM' for every minute of a day, so a minute is still compared against a block's
// start with the very same string comparison the schedule has always used.
const HM_OF_MINUTE = Array.from({ length: 1440 }, (_, m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
);

// No zone moves its offset twice inside six hours, so probing that far apart cannot
// step over a changeover unseen.
const PROBE_MS = 6 * 60 * MIN;

// Cut [from, to) into stretches of constant offset, in order.
function offsetSegments(fmt, from, to) {
  const segments = [];
  let segmentStart = from;
  let segmentOffset = officeOffsetAt(fmt, from);
  let lo = from;
  let loOffset = segmentOffset;

  while (lo < to - 1) {
    const hi = Math.min(lo + PROBE_MS, to - 1);
    const hiOffset = officeOffsetAt(fmt, hi);

    if (hiOffset === loOffset) {
      lo = hi;
      continue;
    }

    // A changeover sits in (lo, hi]. Halve the gap until it is one minute wide.
    let a = lo;
    let b = hi;
    while (b - a > MIN) {
      const mid = a + Math.floor((b - a) / 2);
      if (officeOffsetAt(fmt, mid) === loOffset) a = mid;
      else b = mid;
    }

    const boundary = Math.max(Math.floor(b / MIN) * MIN, segmentStart);
    if (boundary > segmentStart) {
      segments.push({ start: segmentStart, end: boundary, offset: segmentOffset });
    }
    segmentStart = boundary;
    segmentOffset = officeOffsetAt(fmt, b);
    lo = b;
    loOffset = segmentOffset;
  }

  segments.push({ start: segmentStart, end: to, offset: segmentOffset });
  return segments;
}

// The tier a weekday's blocks give one minute ('HH:MM'). Each block runs from its
// start until the next block's start; the day is a cycle, so a minute before the
// earliest block wraps to the LAST block's tier (an evening block carries over past
// midnight into the small hours).
function tierAt(blocks, hm) {
  let tier = blocks[blocks.length - 1].tier; // wrap: before the first block = last block
  for (const b of blocks) {
    if (b.start <= hm) tier = b.tier;
    else break;
  }
  return tier;
}

// The first minute of the day whose 'HH:MM' is at or past a block's start (1440 if
// none). HM_OF_MINUTE is in ascending order, so this is a binary search.
function firstMinuteFrom(start) {
  let lo = 0;
  let hi = 1440;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (HM_OF_MINUTE[mid] >= start) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// A weekday's blocks folded into runs of one tier: [{ from, to, tier }] in minutes of
// the day. A minute's tier can only change where some block starts, so it is read at
// midnight and at each block's first minute and holds until the next such point.
// Only non-normal runs are kept, since the normal tier is derived by reconciliation
// in splitHours. null = an all-normal day (no blocks).
function dayOvertimeRuns(blocks) {
  if (!blocks || blocks.length === 0) return null;
  const points = [...new Set([0, ...blocks.map(b => firstMinuteFrom(b.start))])]
    .filter(m => m < 1440)
    .sort((a, b) => a - b);
  const runs = [];
  points.forEach((from, i) => {
    const to = i + 1 < points.length ? points[i + 1] : 1440;
    const tier = tierAt(blocks, HM_OF_MINUTE[from]);
    if (tier === 'normal') return;
    const last = runs[runs.length - 1];
    if (last && last.to === from && last.tier === tier) last.to = to;
    else runs.push({ from, to, tier });
  });
  return runs;
}

// entries: [{ start_time, end_time }] (completed only). Returns hours per tier,
// unrounded.
// The OT/holiday tiers are summed across the runs; the normal tier is the exact
// total minus the others, so the four always sum to the plain logged total.
// A single completed block is never legitimately longer than this. New blocks are
// capped far tighter at entry (see the time-entry routes); this is a safety net so a
// bad legacy row can't make the split below probe the clock across months and stall
// the server on every costing read. An over-long block still counts its full
// duration, but all at the normal tier (no split).
const MAX_WALK_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function splitHours(entries, { schedule, holidays, timezone }) {
  const fmt = makeOfficeFormatter(timezone);
  const holidaySet = new Set(Array.isArray(holidays) ? holidays : []);
  const runsByDay = new Map();
  const runsFor = (weekday) => {
    if (!runsByDay.has(weekday)) runsByDay.set(weekday, dayOvertimeRuns(schedule?.[weekday]));
    return runsByDay.get(weekday);
  };

  let ot1 = 0, ot2 = 0, holiday = 0, totalHours = 0;

  for (const e of entries || []) {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    const s = start.getTime();
    const en = end.getTime();
    if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) continue;

    totalHours += (en - s) / 3600000;

    // Safety net: skip the split for an implausibly long block. Its hours still land
    // in the total (and thus in the normal tier via the reconciliation below).
    if (en - s > MAX_WALK_MS) continue;

    const segments = offsetSegments(fmt, s, en);
    let segmentIndex = 0;

    // One piece per local day per offset stretch: the day (and so its weekday runs
    // and holiday status) only changes at local midnight or when the offset moves.
    for (let t = s, next; t < en; t = next) {
      while (segmentIndex < segments.length - 1 && t >= segments[segmentIndex].end) {
        segmentIndex++;
      }
      const { offset, end: segmentEnd } = segments[segmentIndex];
      const local = t + offset;
      const day = Math.floor(local / DAY);
      const nextMidnight = (day + 1) * DAY - offset;
      next = Math.min(en, segmentEnd, nextMidnight);

      const midnight = new Date(day * DAY);
      const ymd = `${midnight.getUTCFullYear()}-${String(midnight.getUTCMonth() + 1).padStart(2, '0')}-${String(midnight.getUTCDate()).padStart(2, '0')}`;
      if (holidaySet.has(ymd)) {
        holiday += (next - t) / 3600000;
        continue;
      }
      const runs = runsFor(WEEKDAY_KEYS[(((day + 4) % 7) + 7) % 7]);
      if (!runs) continue; // all-normal day

      // The piece as minutes into the local day (fractional at either end), laid
      // across the day's overtime runs.
      const a = (local - day * DAY) / MIN;
      const b = a + (next - t) / MIN;
      for (const run of runs) {
        if (run.from >= b) break;
        const overlap = Math.min(b, run.to) - Math.max(a, run.from);
        if (overlap <= 0) continue;
        const hrs = overlap / 60;
        if (run.tier === 'ot1') ot1 += hrs;
        else if (run.tier === 'ot2') ot2 += hrs;
        else if (run.tier === 'holiday') holiday += hrs;
      }
    }
  }

  // Unrounded on purpose: every caller rounds once, to its own places, at the point it
  // shows or stores a figure. Rounding here as well rounded twice (1.2347 h became 1.235
  // here, then 1.24 in costing, where rounding once gives 1.23).
  const normalHours = Math.max(0, totalHours - ot1 - ot2 - holiday);

  return { normalHours, ot1Hours: ot1, ot2Hours: ot2, holidayHours: holiday };
}

module.exports = { splitHours };
