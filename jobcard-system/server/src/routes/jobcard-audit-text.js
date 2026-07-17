// Compact human-readable strings for the job-card create/update audit log.
// Kept beside jobcard-mutations.js the same way backup-helpers.js sits by settings.js.

const { userQueries } = require('../db/database');
const { parseTreatments } = require('./jobcard-helpers');

// Render a line item's treatments as a compact "Treatment→Supplier" string for
// the audit log. Shared by create (starting items) and update (item changes).
function treatmentsToText(treatments) {
  const arr = Array.isArray(treatments) ? treatments : parseTreatments(treatments);
  return arr.map(t => {
    return `${t.value}→${t.supplierName || t.supplierId || '(no supplier)'}`;
  }).join(', ');
}

function itemSummary(qty, description, jobType, material, treatments, drawingsType, customerProperty) {
  const tStr = treatmentsToText(treatments);
  const draw = drawingsType ? ` {draw: ${drawingsType}}` : '';
  const prop = customerProperty ? ` {prop: ${customerProperty}}` : '';
  return `${qty || ''}x ${description}${jobType ? ' <' + jobType + '>' : ''}${material ? ' (' + material + ')' : ''}${tStr ? ' [' + tStr + ']' : ''}${draw}${prop}`;
}

// Resolve a list of assignee user IDs to a comma-separated display name string.
function assigneeNames(userIds) {
  return userIds.map(userId => {
    const user = userQueries.getById.get(userId);
    return user ? (user.name || user.username) : userId;
  }).join(', ');
}

function buildQaTemplateWarning(result) {
  if (!result || !Array.isArray(result.failed) || result.failed.length === 0) return null;
  const fatal = result.failed.find(f => f.fileName === '*');
  if (fatal) {
    return `QA template copy failed: ${fatal.reason || 'unknown error'}`;
  }
  const parts = result.failed.map(f => `${f.fileName} (${f.reason || 'unknown'})`);
  return `${result.failed.length} QA template${result.failed.length > 1 ? 's' : ''} failed to copy: ${parts.join('; ')}`;
}

module.exports = { itemSummary, assigneeNames, buildQaTemplateWarning };
