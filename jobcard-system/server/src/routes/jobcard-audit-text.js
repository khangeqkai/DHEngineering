// Compact human-readable strings for the job-card create/update audit log.
// Kept beside jobcard-mutations.js the same way backup-helpers.js sits by settings.js.

// Tag codes resolve to names through the printout's own helpers, so the trail and
// the job card never disagree on what a stored code means.
const { parseTreatments, tagName, friendlyTagList } = require('./jobcard-helpers');

// Names a part in a trail entry or a rejection message. A part's number is not
// stable enough to identify it by (nothing renumbers on delete, so two jobs'
// history could both say "part 2" about entirely different parts) — its
// description is. `fallback` covers the one case a part has no description yet:
// it's the very part being added, and the description itself is what's invalid.
function describePart(description, fallback) {
  const trimmed = description ? String(description).trim() : '';
  return trimmed ? `"${trimmed}"` : fallback;
}

// The same part as plain fields, for the trail entry's snapshot: the job History window
// words a part from these, never by picking the one-line summary apart again (a
// description ending in "(spare)" or a supplier with a comma in its name can't be told
// from the pieces the summary adds). This is the only place a part's option names are
// looked up; partSummary words the one-line form from its result. A treatment with no
// supplier has supplier null.
function itemPartSnapshot(qty, description, jobType, material, treatments, drawingsType, customerProperty) {
  const arr = Array.isArray(treatments) ? treatments : parseTreatments(treatments);
  return {
    qty: qty || '',
    description: description || '',
    jobType: jobType ? tagName('job_type', jobType) : '',
    material: material ? tagName('material', material) : '',
    treatments: arr.map(t => ({
      name: tagName('treatment', t.value),
      supplier: t.supplierName || t.supplierId || null
    })),
    drawingsType: drawingsType ? friendlyTagList(drawingsType, 'drawings') : '',
    customerProperty: customerProperty ? friendlyTagList(customerProperty, 'customer_property') : ''
  };
}

// The one-line "2x Bracket <Type> (Material) [Treatment→Supplier] {draw: ..} {prop: ..}"
// summary of a part, worded from itemPartSnapshot's result so nothing is looked up twice.
function partSummary(part) {
  const tStr = part.treatments.map(t => `${t.name}→${t.supplier || '(no supplier)'}`).join(', ');
  const draw = part.drawingsType ? ` {draw: ${part.drawingsType}}` : '';
  const prop = part.customerProperty ? ` {prop: ${part.customerProperty}}` : '';
  return `${part.qty}x ${part.description}${part.jobType ? ' <' + part.jobType + '>' : ''}${part.material ? ' (' + part.material + ')' : ''}${tStr ? ' [' + tStr + ']' : ''}${draw}${prop}`;
}

module.exports = { partSummary, itemPartSnapshot, describePart };
