// A job has exactly two quality levels: Standard (the baseline, no special
// checks) and Critical (the stop-timer inspection checklist is required). There
// is nothing to manage — no admin screen, no database table — so this one file
// is the whole of what "quality level" means, read by both the server and the
// client (see CLAUDE.md "Shared rule files"). Every "is this job Critical?"
// check reads through isCriticalLevel rather than re-typing the 'CRITICAL'
// comparison, and every label shown on screen reads through qualityLevelLabel,
// so the two can never drift apart.
const QUALITY_LEVELS = ['STANDARD', 'CRITICAL'];

const QUALITY_LEVEL_LABELS = { STANDARD: 'Standard', CRITICAL: 'Critical' };

function isCriticalLevel(value) {
  return String(value || '').toUpperCase() === 'CRITICAL';
}

// The label for a stored value, defaulting to 'Standard' for anything that
// isn't recognisably 'Critical' — an unset, blank or legacy value all read as
// the plain baseline rather than showing a raw or empty value on screen.
function qualityLevelLabel(value) {
  return isCriticalLevel(value) ? QUALITY_LEVEL_LABELS.CRITICAL : QUALITY_LEVEL_LABELS.STANDARD;
}

module.exports = { QUALITY_LEVELS, QUALITY_LEVEL_LABELS, isCriticalLevel, qualityLevelLabel };
