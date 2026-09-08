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

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

// Epoch day 0 (1 January 1970) was a Thursday, so day index + 4 lands on Sunday = 0.
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// 'HH:MM' for every minute of a day, so a minute is still compared against a block's
// start with the very same string comparison the schedule has always used.
const HM_OF_MINUTE = Array.from({ length: 1440 }, (_, m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
);

// Build a formatter locked to the given zone. Falls back to UTC if the zone is
// missing or not recognised, so costing never throws over a bad setting.
function makeFormatter(timeZone) {
  const opts = {
    hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  };
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', ...opts });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...opts });
  }
}

// How far the zone runs ahead of UTC at an instant. Reading the instant on the office
// clock and then treating that reading as if it were UTC leaves exactly the offset
// between the two. Offsets are whole minutes, so the instant is floored to the minute.
function zoneOffsetAt(fmt, instant) {
  const minute = Math.floor(instant / MIN) * MIN;
  const parts = fmt.formatToParts(new Date(minute));
  const get = (type) => parts.find(p => p.type === type)?.value;
  let hour = get('hour');
  if (hour === '24') hour = '00'; // some environments emit 24 at midnight
  const asIfUtc = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    Number(hour), Number(get('minute'))
  );
  return Number.isFinite(asIfUtc) ? asIfUtc - minute : 0;
}

// No zone moves its offset twice inside six hours, so probing that far apart cannot
// step over a changeover unseen.
const PROBE_MS = 6 * 60 * MIN;

// Cut [from, to) into stretches of constant offset, in order.
function offsetSegments(fmt, from, to) {
  const segments = [];
  let segmentStart = from;
  let segmentOffset = zoneOffsetAt(fmt, from);
  let lo = from;
  let loOffset = segmentOffset;

  while (lo < to - 1) {
    const hi = Math.min(lo + PROBE_MS, to - 1);
    const hiOffset = zoneOffsetAt(fmt, hi);

    if (hiOffset === loOffset) {
      lo = hi;
      continue;
    }

    // A changeover sits in (lo, hi]. Halve the gap until it is one minute wide.
    let a = lo;
    let b = hi;
    while (b - a > MIN) {
      const mid = a + Math.floor((b - a) / 2);
      if (zoneOffsetAt(fmt, mid) === loOffset) a = mid;
      else b = mid;
    }

    const boundary = Math.max(Math.floor(b / MIN) * MIN, segmentStart);
    if (boundary > segmentStart) {
      segments.push({ start: segmentStart, end: boundary, offset: segmentOffset });
    }
    segmentStart = boundary;
    segmentOffset = zoneOffsetAt(fmt, b);
    lo = b;
    loOffset = segmentOffset;
  }

  segments.push({ start: segmentStart, end: to, offset: segmentOffset });
  return segments;
}

// A tier for every minute of a weekday, worked out once from that day's blocks. Each
// block runs from its start until the next block's start; the day is a cycle, so a
// minute before the earliest block wraps to the LAST block's tier (an evening block
// carries over past midnight into the small hours). No blocks means every minute is
// normal.
function dayTierTable(blocks) {
  if (!blocks || blocks.length === 0) return null;
  const table = new Array(1440);
  for (let m = 0; m < 1440; m++) {
    const hm = HM_OF_MINUTE[m];
    let tier = blocks[blocks.length - 1].tier; // wrap: before the first block = last block
    for (const b of blocks) {
      if (b.start <= hm) tier = b.tier;
      else break;
    }
    table[m] = tier;
  }
  return table;
}

// entries: [{ start_time, end_time }] (completed only). Returns hours per tier.
// The OT/holiday tiers are summed from the minute walk; the normal tier is the
// exact total minus the others, so the four always sum to the plain logged total.
// A single completed block is never legitimately longer than this. New blocks are
// capped far tighter at entry (see the time-entry routes); this is a safety net so a
// bad legacy row can't make the per-minute walk below run for hundreds of thousands
// of steps and stall the server on every costing read. An over-long block still
// counts its full duration, but all at the normal tier (no minute-by-minute split).
const MAX_WALK_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function splitHours(entries, { schedule, holidays, timezone }) {
  const fmt = makeFormatter(timezone);
  const holidaySet = new Set(Array.isArray(holidays) ? holidays : []);
  const tierTables = new Map();
  const tableFor = (weekday) => {
    if (!tierTables.has(weekday)) tierTables.set(weekday, dayTierTable(schedule?.[weekday]));
    return tierTables.get(weekday);
  };

  let ot1 = 0, ot2 = 0, holiday = 0, totalHours = 0;

  for (const e of entries || []) {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    const s = start.getTime();
    const en = end.getTime();
    if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) continue;

    totalHours += (en - s) / 3600000;

    // Safety net: skip the walk for an implausibly long block. Its hours still land
    // in the total (and thus in the normal tier via the reconciliation below).
    if (en - s > MAX_WALK_MS) continue;

    const segments = offsetSegments(fmt, s, en);
    let segmentIndex = 0;
    // The local day, and everything that hangs off it, only changes at local midnight
    // or when the offset moves — so it is worked out then, not every minute.
    let dayIndex = null;
    let table = null;
    let isHoliday = false;

    for (let t = s; t < en; t += MIN) {
      while (segmentIndex < segments.length - 1 && t >= segments[segmentIndex].end) {
        segmentIndex++;
        dayIndex = null; // the clock just moved; re-read the day
      }
      const local = t + segments[segmentIndex].offset;
      const day = Math.floor(local / DAY);
      if (day !== dayIndex) {
        dayIndex = day;
        const midnight = new Date(day * DAY);
        const ymd = `${midnight.getUTCFullYear()}-${String(midnight.getUTCMonth() + 1).padStart(2, '0')}-${String(midnight.getUTCDate()).padStart(2, '0')}`;
        isHoliday = holidaySet.has(ymd);
        table = tableFor(WEEKDAY_KEYS[(((day + 4) % 7) + 7) % 7]);
      }

      const tier = isHoliday
        ? 'holiday'
        : (table ? table[Math.floor((local - day * DAY) / MIN)] : 'normal');
      // Last step may be a partial minute — count only the slice inside the entry.
      const frac = (Math.min(t + MIN, en) - t) / MIN; // 0..1 of a minute
      const hrs = frac / 60;
      if (tier === 'ot1') ot1 += hrs;
      else if (tier === 'ot2') ot2 += hrs;
      else if (tier === 'holiday') holiday += hrs;
      // 'normal' is derived by reconciliation below.
    }
  }

  const round3 = (n) => Math.round(n * 1000) / 1000;
  ot1 = round3(ot1);
  ot2 = round3(ot2);
  holiday = round3(holiday);
  const normalHours = Math.max(0, round3(totalHours - ot1 - ot2 - holiday));

  return { normalHours, ot1Hours: ot1, ot2Hours: ot2, holidayHours: holiday };
}

module.exports = { splitHours };
