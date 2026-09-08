// Self-check for workMatch: after a save renumbers the parts, work and a running
// timer must stay paired to their part by its permanent id (they used to pair by
// position number, so deleting a part made the renumbered part's hours and clock
// vanish from view and offered Start on the part being timed).
// Run: node scripts/check-workMatch.mjs
import assert from 'node:assert';
import { workBelongsToItem } from '../src/components/jobcard/workMatch.mjs';

// The reported bug, replayed: part 2 (work-free) deleted while part 3's timer
// runs. The save renumbers part 3 -> part 2 and hands the screen fresh parts,
// but the work list and timer still remember the old numbers.
const staleEntry = { id: 'te:1', itemId: 'item:p3', itemNumber: 3 };
const staleTimer = { id: 'te:2', itemId: 'item:p3', itemNumber: 3, startTime: '2026-09-09T01:00:00.000Z' };
const freshParts = [
  { id: 'item:p1', itemNumber: 1 },
  { id: 'item:p3', itemNumber: 2 } // renumbered: was #3
];

// 1. Renumbered part keeps its hours: the stale entry pairs with the part that
// now reads #2, and the entry list filters onto it.
{
  const paired = freshParts.filter(p => workBelongsToItem(staleEntry, p));
  assert.strictEqual(paired.length, 1, 'entry must pair with exactly one part');
  assert.strictEqual(paired[0].id, 'item:p3', 'entry must pair with its own part, not the part now wearing its old number');
  assert.strictEqual(paired[0].itemNumber, 2, 'its part is the one renumbered to #2');
}

// 2. Stop button stays glued: the stale-numbered timer still counts as active on
// its own (renumbered) part, and on no other part.
{
  assert(workBelongsToItem(staleTimer, freshParts[1]), 'timer must be active on the part it was started on');
  assert(!workBelongsToItem(staleTimer, freshParts[0]), 'timer must not leak onto another part');
}

// 3. A different part wearing the old number does NOT adopt the work.
{
  const impostor = { id: 'item:p9', itemNumber: 3 };
  assert(!workBelongsToItem(staleEntry, impostor), 'a part wearing the old number must not adopt the work');
}

// 4. Pre-id records (logged before 2026-06-10) keep today's number pairing.
{
  const oldRow = { id: 'te:old', itemId: null, itemNumber: 2 };
  assert(workBelongsToItem(oldRow, { id: 'item:p3', itemNumber: 2 }), 'id-less record keeps number pairing');
  assert(!workBelongsToItem(oldRow, { id: 'item:p3', itemNumber: 3 }), 'id-less record does not pair with a different number');
}

// 5. A record whose part was deleted (both ids and numbers null) pairs with nothing.
{
  const orphan = { id: 'te:orphan', itemId: null, itemNumber: null };
  assert(!freshParts.some(p => workBelongsToItem(orphan, p)), 'orphan record must pair with no part');
}

// 6. Unsaved part (temporary local id) never adopts id-keyed work.
{
  assert(!workBelongsToItem(staleEntry, { id: 12345, itemNumber: 3 }), 'unsaved part must not adopt id-keyed work');
}

console.log('workMatch check: all 6 cases pass');
