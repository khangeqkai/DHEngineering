export function toTitleCase(str) {
  if (!str) return str;
  return str.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

export function capitalizeFirst(str) {
  if (!str) return str;
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function validatePassword(password) {
  if (!/^\d{4}$/.test(password)) return 'Password must be exactly 4 digits';
  return null;
}

// ── Date/time display ────────────────────────────────────────────────────────
// One place formats every date and time shown on screen, so a given value always
// lands on the same day and reads the same way everywhere.
//
// A value can be either a bare calendar date ("YYYY-MM-DD", e.g. a due date) or a
// full timestamp. A bare calendar date is read as *local* midnight so it can't
// slip to the day before in Australian (UTC+8..+11) time zones; a full timestamp
// is read as the instant it represents. All output is Australian format; times
// use the 24-hour clock.
function parseDateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return new Date(value.trim() + 'T00:00:00');
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Today's calendar date as "YYYY-MM-DD", read off the local clock so it can be compared
// straight against a stored due date. Deliberately not toISOString(), which gives the
// UTC day — in Australia that is still yesterday for the first hours of the morning, so
// "overdue" would turn over mid-morning instead of at local midnight.
export function todayIsoDate() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Australian date, e.g. "17/07/2026". Returns '' for empty/invalid input.
export function formatDate(value, options) {
  const d = parseDateValue(value);
  return d ? d.toLocaleDateString('en-AU', options) : '';
}

// Australian date + 24-hour time, e.g. "17/07/2026, 14:30".
export function formatDateTime(value, options) {
  const d = parseDateValue(value);
  return d ? d.toLocaleString('en-AU', { hour12: false, ...options }) : '';
}

// Australian 24-hour time only, e.g. "14:30".
export function formatTime(value, options) {
  const d = parseDateValue(value);
  return d ? d.toLocaleTimeString('en-AU', { hour12: false, ...options }) : '';
}

// History/activity-log values are stored as raw 1/0 (or true/false) for some
// flags. These read better as Yes/No in the change list.
const YES_NO_FIELDS = new Set(['isRepeatJob', 'is_repeat_job', 'repeatJob']);

// Render a single from/to history value for display. Returns a string for real
// values, or null for empty (so callers can substitute '(empty)').
export function formatHistoryValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  if (YES_NO_FIELDS.has(field)) {
    if (value === 1 || value === '1' || value === true || value === 'true') return 'Yes';
    if (value === 0 || value === '0' || value === false || value === 'false') return 'No';
  }
  return String(value);
}
