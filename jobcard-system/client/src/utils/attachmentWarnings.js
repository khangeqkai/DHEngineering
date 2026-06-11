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

// Build the per-line-item lookup the line-item view uses to decide which fields
// to flag. Keyed by item number → { missingDrawing, missingCustomerProperty }.
export function itemWarningMap(warnings) {
  const map = {};
  for (const it of (warnings?.items || [])) {
    map[it.itemNumber] = it;
  }
  return map;
}
