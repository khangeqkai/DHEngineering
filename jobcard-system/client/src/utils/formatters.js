import { STATUS_LABELS, PRIORITY_LABELS } from '../components/JobCardList.constants';
import { isValidPin, PIN_MESSAGE } from '../../../server/src/shared/pin';

export function toTitleCase(str) {
  if (!str) return str;
  // A word starts at a letter that doesn't follow another letter (or accent mark), digit or "_".
  // Unicode-aware on purpose: the old ASCII word boundary (\b\w) treated "ü" or
  // "ó" as a break, so "müller" became "MüLler" and "gómez" became "GóMez".
  const titled = str.trim().replace(/\s+/g, ' ')
    .replace(/(^|[^\p{L}\p{M}\p{N}_])(\p{L})/gu, (m, pre, c) => pre + c.toUpperCase());
  // The rule above sees straight past an apostrophe (it's not a letter), so it
  // also capitalizes the letter right after one — "bob's" became "Bob'S". Only
  // fold that back down for an actual contraction/possessive suffix ('s, 't, 'd,
  // 'll, 're, 've, 'm); a name like "O'Brien" doesn't match "brien" against any of
  // these, so it's untouched.
  return titled.replace(/'(s|t|d|m|ll|re|ve)(?![\p{L}\p{M}\p{N}_])/giu, (m) => m.toLowerCase());
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

// The one shared PIN rule (server/src/shared/pin.js) — same check the server
// runs on create/update/change-password, read here instead of a second copy.
export function validatePassword(password) {
  if (!isValidPin(password)) return PIN_MESSAGE;
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

// Local calendar date as "YYYY-MM-DD" for any Date object, read off the local clock.
// Deliberately not toISOString(), which gives the UTC day — in Australia that is
// still yesterday for the first hours of the morning.
export function toIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Today's calendar date as "YYYY-MM-DD", read off the local clock so it can be compared
// straight against a stored due date — see toIsoDate for why not toISOString().
export function todayIsoDate() {
  return toIsoDate(new Date());
}

// isCalendarDate and roundTo used to be written out here a second time, kept in step
// with the server's copies by hand. Both are now one shared file each side imports —
// see server/src/shared/calendarDate.js and server/src/shared/round.js.

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

// A job's status and priority are stored in the trail as their internal codes
// (e.g. "AWAITING_MATERIAL", "SAME_DAY") — the same codes the job list's status
// badge and priority chip translate through these two maps. The `status` field
// name is also used for plain Active/Archived entries (archiving a customer,
// supplier, machine, user, tag); those values simply aren't keys in
// STATUS_LABELS, so they fall through to the raw text unchanged.
const STATUS_OR_PRIORITY_FIELDS = new Set(['status', 'priority']);

// Render a single from/to history value for display. Returns a string for real
// values, or null for empty (so callers can substitute '(empty)').
export function formatHistoryValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  if (YES_NO_FIELDS.has(field)) {
    if (value === 1 || value === '1' || value === true || value === 'true') return 'Yes';
    if (value === 0 || value === '0' || value === false || value === 'false') return 'No';
  }
  if (STATUS_OR_PRIORITY_FIELDS.has(field)) {
    const labels = field === 'status' ? STATUS_LABELS : PRIORITY_LABELS;
    const known = labels[value];
    if (known) return known;
  }
  return String(value);
}

// A piece count for display: whole numbers stay whole, part counts keep at most two
// decimals and drop trailing zeros ("4", "4.5", not "4.00"). Lived in three copies
// across the job screen's part/progress/scrap cards before this.
export function formatCount(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// A dollar amount for display: "$" + Australian thousands separators, always two
// decimals ("$1,234.56"). Non-numbers read as $0.00. Always en-AU, never the
// computer's own locale, so a total reads the same on every screen and PC.
export function formatMoney(n) {
  return `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A running timer's elapsed time as "HH:MM:SS". Negative or non-numeric input
// clamps to 0 — clock skew can otherwise hand this a negative value for the
// first tick or two of a fresh timer, which would print as e.g. "-1".
export function formatElapsed(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Whole seconds elapsed since startTime, up to now. Never negative — same clock-skew
// guard as formatElapsed above.
export function elapsedSecondsSince(startTime) {
  return Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
}
