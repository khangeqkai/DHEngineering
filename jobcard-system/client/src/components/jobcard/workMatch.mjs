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
