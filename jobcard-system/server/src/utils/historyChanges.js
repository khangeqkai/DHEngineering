/**
 * Shared "what changed" helpers for recordHistory() callers.
 *
 * Every PUT/PATCH route that edits a row builds a `{ field: { from, to } }`
 * object for the audit trail (CLAUDE.md's Audit trail pattern), and null/
 * undefined/'' are all treated as the same "blank" value so clearing a field
 * to blank isn't reported as a change from null to '' (or back). This was
 * copied by hand into seven route files; this module is the one copy.
 */

/** null, undefined and '' all compare equal; anything else compares by value. */
function normalizeBlank(value) {
  return (value === null || value === undefined || value === '') ? '' : value;
}

/** True when `a` and `b` are the same value once blanks are normalized. */
function blankEqual(a, b) {
  return normalizeBlank(a) === normalizeBlank(b);
}

/**
 * Build a recordHistory `changes` object by comparing `existing` (the DB row,
 * snake_case columns) against a list of field specs, skipping any field whose
 * new value is blank-equal to its current one.
 *
 * Each spec is `[dbField, changeKey, newValue, fromOverride?]`:
 *   - `dbField`    column on `existing` to read the current value from, and
 *                  what the comparison is made against.
 *   - `changeKey`  key the change is recorded under (camelCase).
 *   - `newValue`   the value being saved — callers apply their own fallback
 *                  (e.g. `contactPhone || null`) before passing it in, since
 *                  that fallback differs by field and by route.
 *   - `fromOverride` (optional) — only auth.js's email field needs this: it
 *                  records `from` as `user.email || null` while still
 *                  comparing against the raw existing value, so a stored ''
 *                  reads as null in the trail without changing whether the
 *                  field is considered to have changed.
 *
 * Fields the caller doesn't want compared at all (a partial-update payload
 * that simply didn't include them) should be left out of the list before
 * calling this — see jobcard-helpers.js's buildJobcardChanges for the
 * `data[reqField] !== undefined` filter that does that.
 */
function diffFields(existing, fields) {
  const changes = {};
  for (const [dbField, changeKey, newValue, fromOverride] of fields) {
    if (!blankEqual(newValue, existing[dbField])) {
      changes[changeKey] = {
        from: fromOverride !== undefined ? fromOverride : existing[dbField],
        to: newValue
      };
    }
  }
  return changes;
}

module.exports = { blankEqual, diffFields };
