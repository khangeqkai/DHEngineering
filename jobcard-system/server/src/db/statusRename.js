// The job status list's one-time rename, in one pure place: no database, no logger, no
// requires. legacyMigrations.js (renameOldStatuses) only selects the rows and writes the
// results back; db/safetyCopy.js reads OLD_STATUS_CODES to decide whether a copy of the
// database is needed first. Tested without a database (server/test/statusRename.test.js).
//
// Every old code maps to its place on the current list. No current code reuses an old
// one, so a row that has been renamed can never be renamed again — that is what makes
// the conversion safe to run on every boot with no "already done" flag. Open, In
// Progress and Done kept their codes and never appear here.
const STATUS_RENAMES = {
  QUOTE: 'TO_QUOTE',
  AWAITING_MATERIAL: 'HOLD_MATERIAL',
  // Folded into Material/Treatment long ago; still possible in a very old backup.
  TREATMENT: 'HOLD_MATERIAL',
  ON_HOLD: 'HOLD_MATERIAL',
  PO_REQUESTED: 'HOLD_PO',
  CUST_NOTIFIED: 'READY_TO_COLLECT',
  INVOICED: 'ARCHIVED'
};

const OLD_STATUS_CODES = Object.keys(STATUS_RENAMES);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const renameCode = (code) => (Object.prototype.hasOwnProperty.call(STATUS_RENAMES, code) ? STATUS_RENAMES[code] : code);

// One job trail entry's parsed `changes`: the status move it records, if any, in the
// current codes. Returns the new object, or undefined when nothing in it needed renaming
// (so the caller writes nothing back).
function renameStatusInChanges(changes) {
  if (!isObject(changes) || !isObject(changes.status)) return undefined;
  const { from, to } = changes.status;
  const status = { ...changes.status, from: renameCode(from), to: renameCode(to) };
  if (status.from === from && status.to === to) return undefined;
  return { ...changes, status };
}

module.exports = { STATUS_RENAMES, OLD_STATUS_CODES, renameStatusInChanges };
