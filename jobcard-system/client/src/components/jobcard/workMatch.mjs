// Pairs a work record (logged block or running timer) with a part on screen.
// The part's position number is only a display label — it shifts whenever parts
// are added, removed, or reordered (a save renumbers from 1) — so the pairing
// keys off the part's permanent id. Only records that carry no id (blocks logged
// before 2026-06-10) fall back to the number, which is the same pairing the old
// number-based code gave them.
export function workBelongsToItem(entry, item) {
  if (!entry || !item) return false;
  if (entry.itemId != null) return entry.itemId === item.id;
  if (entry.itemNumber == null) return false;
  return String(entry.itemNumber) === String(item.itemNumber);
}

// The number shown to the user for a part is its position in the job's ordered
// list (Line 1, Line 2, ...), never its stored item_number — that's only a sort
// key the server owns and it may have gaps. The server states that position on
// every part it returns (see mapLineItemFromApi) — this just looks it up,
// rather than counting the list again. Returns null when the id isn't in the
// list (a part removed since, or no id given at all) or the part has no
// server-stated position yet (a brand-new job's still-local row).
export function itemPositionInList(lineItems, itemId) {
  if (!Array.isArray(lineItems) || itemId == null) return null;
  const item = lineItems.find(it => it.id === itemId);
  return item ? (item.position ?? null) : null;
}

// Human label for a work record's part once the on-screen number is a computed
// position rather than the stored item_number: resolve the record's real
// position in the given (current job's) list; when the part isn't in it — a
// different, unloaded job, or a legacy record with no id at all — fall back to
// whatever number the record itself carries, the best that can be said without
// a list to place it in.
export function describeItemPosition(lineItems, entry) {
  if (!entry) return null;
  const pos = itemPositionInList(lineItems, entry.itemId);
  return pos != null ? pos : (entry.itemNumber ?? null);
}
