const { getSettings } = require('../db/database');

// Stored moments are UTC instants; the people using the app think in the office's own
// wall clock. Anything that has to cross between the two — converting a legacy wall-clock
// reading, or turning a picked calendar day into the instants that day starts and ends at
// — goes through here, so there is one definition of "the office's day".

// True only for a time zone name Intl actually recognises (checked by trying to
// format against it) — the one "is this a real time zone" check every caller reads.
function isValidTimeZone(zone) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// The office's time zone (the one the overtime schedule is measured against), falling
// back to this machine's own zone if it was never set or isn't recognised.
function officeTimeZone() {
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    const zone = getSettings().timezone;
    if (!zone || !isValidTimeZone(zone)) return own;
    return zone;
  } catch {
    return own;
  }
}

// A formatter reading an instant on the office clock down to the minute, with the
// weekday attached — used wherever a stored moment has to be classified against a
// local calendar day or a weekly schedule. Falls back to UTC if the zone is missing
// or not recognised, so a bad setting can't throw partway through a report.
// Building one is slow (tens of microseconds) and a formatter never changes, so each
// zone's is built once and handed out again — the overtime split and the statistics
// loops ask for one per job, which on a few years of data meant tens of thousands.
const officeFormatters = new Map();

function makeOfficeFormatter(timeZone) {
  const zone = timeZone || 'UTC';
  const cached = officeFormatters.get(zone);
  if (cached) return cached;
  const opts = {
    hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  };
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, ...opts });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...opts });
  }
  officeFormatters.set(zone, fmt);
  return fmt;
}

const MINUTE_MS = 60 * 1000;
// No zone moves its offset twice inside six hours, so a six-hour stretch whose first
// and last minutes agree holds that one offset throughout.
const STEADY_STRETCH_MS = 6 * 60 * MINUTE_MS;

// The offset an office formatter reads at one whole minute: the clock reading taken
// as if it were UTC, minus the instant itself.
function readOffset(fmt, minute) {
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

// Per formatter, each six-hour stretch's offset once it is known to hold throughout
// (null = a changeover falls inside it, so it is read minute by minute).
const steadyOffsets = new WeakMap();

// How far a makeOfficeFormatter formatter's zone runs ahead of UTC at an instant,
// floored to the minute (offsets are whole minutes). Asking Intl is slow, and the
// statistics page asks for every logged block of several years, so the answer is
// remembered per six-hour stretch — a few thousand Intl calls for three years of
// history instead of one or more per block.
function officeOffsetAt(fmt, instant) {
  const minute = Math.floor(instant / MINUTE_MS) * MINUTE_MS;
  let known = steadyOffsets.get(fmt);
  if (!known) {
    known = new Map();
    steadyOffsets.set(fmt, known);
  }
  const stretch = Math.floor(minute / STEADY_STRETCH_MS);
  let offset = known.get(stretch);
  if (offset === undefined) {
    const stretchStart = stretch * STEADY_STRETCH_MS;
    const first = readOffset(fmt, stretchStart);
    const last = readOffset(fmt, stretchStart + STEADY_STRETCH_MS - MINUTE_MS);
    offset = first === last ? first : null;
    known.set(stretch, offset);
  }
  return offset === null ? readOffset(fmt, minute) : offset;
}

// How far the zone runs ahead of UTC at a given instant (DST-correct, via Intl).
function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(instant));
  const get = (type) => {
    const part = parts.find(p => p.type === type);
    return part ? part.value : null;
  };
  const year = get('year'), month = get('month'), day = get('day');
  const minute = get('minute'), second = get('second');
  let hour = get('hour');
  if (hour === '24') hour = '00'; // some environments emit 24 at midnight
  if (!year || !month || !day || hour === null || minute === null || second === null) return 0;
  // Intl only reports down to the second, so carry the instant's own milliseconds across —
  // without them the offset is out by up to a second and an "end of day" bound would sit
  // just short of midnight, quietly dropping the last moments of the day.
  const asIfUtc = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
    + new Date(instant).getUTCMilliseconds();
  return Number.isFinite(asIfUtc) ? asIfUtc - instant : 0;
}

// Turn a local wall-clock reading ("YYYY-MM-DDTHH:MM", with optional seconds and
// milliseconds) into the instant it names. Reading it as if it were UTC and then
// subtracting the zone's offset lands on the real instant; re-checking the offset there
// settles the hour either side of a daylight-saving change. Returns null on bad input.
function wallClockToIso(value, timeZone) {
  const asIfUtc = Date.parse(value.length === 16 ? `${value}:00Z` : `${value}Z`);
  if (!Number.isFinite(asIfUtc)) return null;
  const first = asIfUtc - zoneOffsetMs(asIfUtc, timeZone);
  const settled = asIfUtc - zoneOffsetMs(first, timeZone);
  return new Date(settled).toISOString();
}

// 'YYYY-MM-DD' of a moment, read on the office clock. Callers looping over many
// moments can pass a pre-built formatter (e.g. makeOfficeFormatter(officeTimeZone()))
// so the loop doesn't rebuild one every time; the default builds one for a single call.
function officeDateString(moment, fmt = makeOfficeFormatter(officeTimeZone())) {
  try {
    const instant = moment.getTime();
    return new Date(instant + officeOffsetAt(fmt, instant)).toISOString().slice(0, 10);
  } catch {
    return moment.toISOString().slice(0, 10);
  }
}

// The instants a picked calendar day ("YYYY-MM-DD") begins and ends at on the office
// clock. Used by the date-range filters: comparing the picked date as a plain string
// against a stored UTC instant shifts the window by the office's offset (in Melbourne,
// "6 August" would quietly return 6 Aug 10am through 7 Aug 10am).
function officeDayStart(date, timeZone = officeTimeZone()) {
  return wallClockToIso(`${date}T00:00:00.000`, timeZone);
}

function officeDayEnd(date, timeZone = officeTimeZone()) {
  return wallClockToIso(`${date}T23:59:59.999`, timeZone);
}

module.exports = {
  officeTimeZone, isValidTimeZone, makeOfficeFormatter, officeOffsetAt, officeDateString, wallClockToIso, officeDayStart, officeDayEnd
};
