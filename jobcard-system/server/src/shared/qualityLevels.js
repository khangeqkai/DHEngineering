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

// The four Yes/No inspection answers a finished run on a Critical job must carry,
// by the name both sides use for them.
const INSPECTION_FIELDS = ['firstOffInspection', 'inProcessValidation', 'measuringEquipmentVerification', 'equipmentChecks'];

// The `code` on the server's refusal of a finished run on a Critical job with an
// inspection answer missing. The refusal also lists the missing answers in the
// usual validation `fields` shape, so a form that opened before the job turned
// Critical can switch its checklist on and mark the boxes instead of failing blind.
const CRITICAL_INSPECTION_REFUSED = 'CRITICAL_INSPECTION_REQUIRED';

module.exports = { QUALITY_LEVELS, QUALITY_LEVEL_LABELS, isCriticalLevel, qualityLevelLabel, INSPECTION_FIELDS, CRITICAL_INSPECTION_REFUSED };
