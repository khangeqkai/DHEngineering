// Split completed logged time into labour tiers (normal / OT1 / OT2 / holiday) by
// WHEN each minute of work happened, against a weekly schedule + public-holiday list.
//
// Times are stored as UTC ISO strings; the schedule is expressed in local wall-clock,
// so every minute is converted to local time (via Intl, which is DST-correct) before
// it is classified. A minute is walked one at a time — cheap for hours-long entries —
// which makes midnight-spanning entries, block boundaries, and DST all fall out
// naturally with no fragile date math.

// Intl 'short' weekday → our schedule keys.
const WEEKDAY_MAP = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };

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

// Local date (YYYY-MM-DD), weekday key, and HH:MM for an instant.
function localParts(fmt, date) {
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find(p => p.type === t)?.value;
  let hour = get('hour');
  if (hour === '24') hour = '00'; // some environments emit 24 at midnight
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAY_MAP[get('weekday')] || 'mon',
    hm: `${hour}:${get('minute')}`
  };
}

// Which tier a given local moment falls in. A public holiday overrides the whole
// day at the holiday tier; otherwise the day's blocks decide (each block runs from
// its start until the next block's start; blocks are start-ordered). The day is a
// cycle: a moment before the earliest block's start wraps to the LAST block's tier
// (an evening block carries over past midnight into the small hours).
function tierForMoment(parts, schedule, holidaySet) {
  if (holidaySet.has(parts.date)) return 'holiday';
  const blocks = schedule[parts.weekday];
  if (!blocks || blocks.length === 0) return 'normal';
  let tier = blocks[blocks.length - 1].tier; // wrap: before the first block = last block
  for (const b of blocks) {
    if (b.start <= parts.hm) tier = b.tier;
    else break;
  }
  return tier;
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
  const MIN = 60 * 1000;

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

    for (let t = s; t < en; t += MIN) {
      const parts = localParts(fmt, new Date(t));
      const tier = tierForMoment(parts, schedule, holidaySet);
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
