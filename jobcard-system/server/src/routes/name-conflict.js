// Shared "name already taken" reply for companies and suppliers create/update —
// both refuse a duplicate name (case-insensitive, checked by the caller's own
// getByName lookup) with a 409, and both point an archived match at "restore it"
// instead of a flat "already exists". Only the two words that name the record
// ("customer"/"company name" vs "supplier"/"name") differ, so those stay
// caller-supplied; the message wording and status code are otherwise identical
// to what each route sent before this was pulled out.
//
// existingRow: the row `getByName` returned (or null/undefined for no match).
// currentId: the record being updated, so a match on itself is never a conflict
//   (omit/undefined on create, where there is no currentId yet).
// isArchived: (row) => boolean — how this entity marks "archived" (companies use
//   `archived`, suppliers use `active === 0`).
// Returns true (having sent the 409) when there's a real conflict, false when the
// caller should carry on.
function nameConflictOr409(res, existingRow, currentId, { entityLabel, nameLabel, isArchived }) {
  if (!existingRow || (currentId !== undefined && currentId !== null && existingRow.id === currentId)) {
    return false;
  }
  res.status(409).json({
    error: isArchived(existingRow)
      ? `A ${entityLabel} with this ${nameLabel} already exists in the archive. Restore it from the archived list instead.`
      : `A ${entityLabel} with this ${nameLabel} already exists`
  });
  return true;
}

module.exports = { nameConflictOr409 };
