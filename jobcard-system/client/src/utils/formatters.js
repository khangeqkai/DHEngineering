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
