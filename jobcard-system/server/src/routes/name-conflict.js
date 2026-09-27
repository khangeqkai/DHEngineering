// Shared "name already taken" reply for companies, suppliers and user accounts
// (create/update) — each refuses a duplicate name (the shared sameName rule: capitals and repeated
// spaces ignored, found by findNameClash below) with a 409, and both point an archived match at "restore it"
// instead of a flat "already exists". Only the two words that name the record
// ("customer"/"company name" vs "supplier"/"name") differ, so those stay
// caller-supplied; the message wording and status code are otherwise identical
// to what each route sent before this was pulled out.
//
// existingRow: the row `findNameClash` returned (or null/undefined for no match).
// currentId: the record being updated, so a match on itself is never a conflict
//   (omit/undefined on create, where there is no currentId yet).
// isArchived: (row) => boolean — how this entity marks "archived" (companies use
//   `archived`, suppliers use `active === 0`, users `!active`).
// field: which request field the clash is about (default 'name'; users pass
//   'username'). The reply names it in `fields`, the same shape the validation
//   step sends, so the screen marks that box instead of popping the message up.
// Returns true (having sent the 409) when there's a real conflict, false when the
// caller should carry on.
const { sameName } = require('../shared/names');

function nameConflictOr409(res, existingRow, currentId, { entityLabel, nameLabel, isArchived, field = 'name' }) {
  if (!existingRow || (currentId !== undefined && currentId !== null && existingRow.id === currentId)) {
    return false;
  }
  const message = isArchived(existingRow)
    ? `A ${entityLabel} with this ${nameLabel} already exists in the archive. Restore it from the archived list instead.`
    : `A ${entityLabel} with this ${nameLabel} already exists`;
  res.status(409).json({ error: message, fields: [{ field, message }] });
  return true;
}

// The first row in `rows` (other than `currentId`, the record being edited) whose
// name is the same as `name` under the shared rule, or null. A scan rather than a
// SQL lookup because the rule collapses inner spaces, which SQL can't express; the
// lists involved (customers, suppliers, quality levels) are small.
function findNameClash(rows, name, currentId) {
  return rows.find(r => r.id !== currentId && sameName(r.name, name)) || null;
}

module.exports = { nameConflictOr409, findNameClash };
