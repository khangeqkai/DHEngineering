// Turn the server's attachment-warning data into short, plain phrases describing
// what a job declared but has no file attached for. Shared by the close-out
// confirm dialog on both the job card screen and the job list so they speak the
// same language. Returns an array of strings, e.g.
//   ["Drawing — item 2", "Customer property — item 3", "Quality form"]
export function describeAttachmentGaps(warnings) {
  if (!warnings) return [];
  const items = warnings.items || [];
  const drawingItems = items.filter(i => i.missingDrawing).map(i => i.itemNumber);
  const propertyItems = items.filter(i => i.missingCustomerProperty).map(i => i.itemNumber);
  const gaps = [];
  if (drawingItems.length) gaps.push(`Drawing — item ${drawingItems.join(', ')}`);
  if (propertyItems.length) gaps.push(`Customer property — item ${propertyItems.join(', ')}`);
  if (warnings.missingQaForms) gaps.push('Quality form');
  return gaps;
}

// Join names the way a person would: "Jane", "Jane and Bob", "Jane, Bob and Sam".
function joinNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || 'someone';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// Turn the server's delete-time work warning into plain sentences for the
// "delete anyway?" confirm. Returns an array of lines to show before the final
// "Deleting erases all of it..." line.
export function describeWorkWarning(warning) {
  if (!warning) return [];
  const lines = [];
  if (warning.hasActive && warning.activeWorkers?.length) {
    const who = joinNames(warning.activeWorkers);
    const verb = warning.activeWorkers.length > 1 ? 'are' : 'is';
    lines.push(`${who} ${verb} working on this job right now.`);
  }
  if (warning.loggedHours > 0) {
    const by = warning.pastWorkers?.length ? ` by ${joinNames(warning.pastWorkers)}` : '';
    lines.push(`This job has ${warning.loggedHours} hours of recorded work${by}.`);
  }
  return lines;
}

// Decide how loudly to flag a job's missing attachments. A missing drawing or
// quality form is treated as blocking (it shouldn't go out the door without
// them), so it reads red; a missing customer property is only a soft warning
// (amber); no declared gaps is fine (green). Returns 'blocking' | 'warning' | 'ok'.
export function attachmentSeverity(warnings) {
  if (!warnings) return 'ok';
  const items = warnings.items || [];
  const missingDrawing = items.some(i => i.missingDrawing);
  if (missingDrawing || warnings.missingQaForms) return 'blocking';
  if (items.some(i => i.missingCustomerProperty)) return 'warning';
  return 'ok';
}

// Build the per-line-item lookup the line-item view uses to decide which fields
// to flag. Keyed by item number → { missingDrawing, missingCustomerProperty }.
export function itemWarningMap(warnings) {
  const map = {};
  for (const it of (warnings?.items || [])) {
    map[it.itemNumber] = it;
  }
  return map;
}
