// A time entry's machines are kept as one comma-joined string ("CNC-01, MILL-01") —
// what the worker actually picked, possibly more than one at once. Every screen that
// shows or edits that string splits and rejoins it the same way; this is the one copy
// of both halves.

// The character that separates machines in that stored string. A machine number may
// never contain it, or one machine would read back as two made-up ones — the machine
// checks (server and the Equipment form) refuse it using this same constant, so the
// rule and the split can't drift apart.
const MACHINE_SEPARATOR = ',';
const MACHINE_SEPARATOR_MESSAGE = 'Machine number cannot contain a comma (commas separate machines in logged work)';

// Split on comma, trim, drop blanks. Never touches an already-empty/undefined value.
function splitMachineCodes(raw) {
  return raw ? String(raw).split(MACHINE_SEPARATOR).map(s => s.trim()).filter(Boolean) : [];
}

// The reverse — a picked list back into the stored string, comma-and-space joined to
// match today's format.
function joinMachineCodes(list) {
  return (list || []).join(`${MACHINE_SEPARATOR} `);
}

// True when a typed machine number contains the separator.
function hasMachineSeparator(code) {
  return String(code || '').includes(MACHINE_SEPARATOR);
}

module.exports = { MACHINE_SEPARATOR, MACHINE_SEPARATOR_MESSAGE, splitMachineCodes, joinMachineCodes, hasMachineSeparator };
