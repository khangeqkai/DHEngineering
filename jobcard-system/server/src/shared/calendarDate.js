// One "is this a real calendar day" check, and one plain-string reformat for it. No
// Date object touches the day here — a Date carries a time zone, and a bare calendar
// day (like a due date) must never be read through one.

// True only for a string 'YYYY-MM-DD' naming a day that actually exists. Built with
// Date.UTC and checked by reading the year/month/day back — a bad day (2026-02-30)
// rolls over into the next month/day when read back, so the mismatch catches it.
function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(t)) return false;
  const check = new Date(t);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' by rearranging the string — no Date object, no time
// zone. '' for empty/invalid input.
function formatDayAu(isoDay) {
  if (typeof isoDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return '';
  const [y, m, d] = isoDay.split('-');
  return `${d}/${m}/${y}`;
}

module.exports = { isCalendarDate, formatDayAu };
