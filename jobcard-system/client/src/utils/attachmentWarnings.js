// Turn the server's attachment-warning data into short, plain phrases describing
// what a job declared but has no file attached for. Shared by the close-out
// confirm dialog on both the job card screen and the job list so they speak the
// same language. Returns an array of strings, e.g.
//   ["Drawing — part 2", "Customer property — part 3"]
//
// The server states each flagged item's `position` directly — the job's full
// ordered parts list is exactly what it already has in hand when it builds this
// data (including the job list's per-page attachment-warnings scan, which never
// gets each job's full parts list otherwise), so there is nothing left to work
// out here. Falls back to the raw item number only for a reply from before this
// field existed.
export function describeAttachmentGaps(warnings) {
  if (!warnings) return [];
  const items = warnings.items || [];
  const displayNumber = (i) => (i.position != null ? i.position : i.itemNumber);
  const drawingItems = items.filter(i => i.missingDrawing).map(displayNumber);
  const propertyItems = items.filter(i => i.missingCustomerProperty).map(displayNumber);
  const gaps = [];
  if (drawingItems.length) gaps.push(`Drawing — part ${drawingItems.join(', ')}`);
  if (propertyItems.length) gaps.push(`Customer property — part ${propertyItems.join(', ')}`);
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

// Decide how loudly to flag a job's missing attachments. A missing drawing is
// treated as blocking (it shouldn't go out the door without it), so it reads red; a missing customer property is only a soft warning
// (amber); no declared gaps is fine (green). Returns 'blocking' | 'warning' | 'ok'.
export function attachmentSeverity(warnings) {
  if (!warnings) return 'ok';
  const items = warnings.items || [];
  const missingDrawing = items.some(i => i.missingDrawing);
  if (missingDrawing) return 'blocking';
  if (items.some(i => i.missingCustomerProperty)) return 'warning';
  return 'ok';
}

// Build the per-line-item lookup the line-item view uses to decide which fields
// to flag. Keyed by the part's permanent id → { missingDrawing, missingCustomerProperty }
// — never its sort number, which a new part still only on screen can share with a
// saved one (files-and-qa.md: parts are matched by id).
export function itemWarningMap(warnings) {
  const map = {};
  for (const it of (warnings?.items || [])) {
    if (it.id) map[it.id] = it;
  }
  return map;
}

// True when the job's files were never looked at — no job-folders location is set,
// or it couldn't be reached. Not flagging a part then means nothing, so a screen
// must not read it as a file being there.
export function filesNotChecked(warnings) {
  return Boolean(warnings?.filesUnreachable || warnings?.filesNotConfigured);
}
