// A time entry's machines are kept as one comma-joined string ("CNC-01, MILL-01") —
// what the worker actually picked, possibly more than one at once. Every screen that
// shows or edits that string splits and rejoins it the same way; this is the one copy
// of both halves.

// Split on comma, trim, drop blanks. Never touches an already-empty/undefined value.
function splitMachineCodes(raw) {
  return raw ? String(raw).split(',').map(s => s.trim()).filter(Boolean) : [];
}

// The reverse — a picked list back into the stored string, comma-and-space joined to
// match today's format.
function joinMachineCodes(list) {
  return (list || []).join(', ');
}

module.exports = { splitMachineCodes, joinMachineCodes };
