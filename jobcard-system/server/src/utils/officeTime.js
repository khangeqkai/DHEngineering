const { db } = require('../db/connection');

// Stored moments are UTC instants; the people using the app think in the office's own
// wall clock. Anything that has to cross between the two — converting a legacy wall-clock
// reading, or turning a picked calendar day into the instants that day starts and ends at
// — goes through here, so there is one definition of "the office's day".

// The office's time zone (the one the overtime schedule is measured against), falling
// back to this machine's own zone if it was never set or isn't recognised.
function officeTimeZone() {
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('timezone');
    const zone = row && row.value;
    if (!zone) return own;
    new Intl.DateTimeFormat('en-CA', { timeZone: zone }); // throws on an unknown zone
    return zone;
  } catch {
    return own;
  }
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

module.exports = { officeTimeZone, wallClockToIso, officeDayStart, officeDayEnd };
