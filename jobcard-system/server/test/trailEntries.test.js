// The History conversion's rules and the shared trail reader, checked with no database.
// Run with `npm test` in server/.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readTrailEntry, convertTrailEntry } = require('../src/db/trailEntries');

const T = '2026-10-15T00:00:00.000Z';
const row = (action, changes, snapshot, extra = {}) => ({
  id: 1, entity_type: 'jobcard', entity_id: 'j1', action,
  user_id: 'u1', user_name: 'Alice', created_at: T,
  changes: typeof changes === 'string' ? changes : JSON.stringify(changes),
  snapshot: snapshot === undefined ? null : typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot),
  ...extra
});
// What the caller writes back, as a row, so the output can be converted again.
const asRow = (original, result) => ({
  ...original,
  changes: result.changes == null ? null : JSON.stringify(result.changes),
  snapshot: result.snapshot == null ? null : JSON.stringify(result.snapshot)
});
const assertIdempotent = (original, result) => {
  assert.equal(convertTrailEntry(asRow(original, result)), undefined);
  for (const extra of result.extras) {
    assert.equal(convertTrailEntry(asRow(original, extra)), undefined);
  }
};

test('readTrailEntry: NULL and the text "null" both read as null; damage reads undefined', () => {
  assert.deepEqual(readTrailEntry({ changes: '{"a":1}', snapshot: 'null' }), { changes: { a: 1 }, snapshot: null });
  assert.deepEqual(readTrailEntry({ changes: null, snapshot: null }), { changes: null, snapshot: null });
  assert.equal(readTrailEntry({ changes: '{oops', snapshot: null }), undefined);
  assert.equal(readTrailEntry({ changes: '{}', snapshot: '{oops' }), undefined);
});

test('a create with "item #1 added" keys gets part keys and a parts snapshot', () => {
  const r = row('create', { jobNumber: { from: null, to: '1001' }, 'item #1 added': { from: null, to: '2x Shaft (spare)' } }, null);
  const out = convertTrailEntry(r);
  assert.deepEqual(Object.keys(out.changes), ['jobNumber', 'part 1 added']);
  assert.deepEqual(out.snapshot, { parts: { 'part 1 added': { qty: '2', description: 'Shaft (spare)' } } });
  assert.deepEqual(out.extras, []);
  assertIdempotent(r, out);
});

test('an update with two part keys and a status change splits into two entries', () => {
  const r = row('update', {
    status: { from: 'OPEN', to: 'IN_PROGRESS' },
    'part Plate added': { from: null, to: '1x Plate' },
    'part Bar added': { from: null, to: '3x Bar' }
  }, null);
  const out = convertTrailEntry(r);
  assert.deepEqual(Object.keys(out.changes), ['status', 'part Plate added']);
  assert.deepEqual(out.snapshot, { part: { qty: '1', description: 'Plate' } });
  assert.equal(out.extras.length, 1);
  assert.deepEqual(Object.keys(out.extras[0].changes), ['part Bar added']);
  assert.deepEqual(out.extras[0].snapshot, { part: { qty: '3', description: 'Bar' } });
  assertIdempotent(r, out);
});

test('a split also repairs a snapshot already filled from the first part only', () => {
  const r = row('update', { 'part A added': { to: '1x A' }, 'part B added': { to: '1x B' } }, { part: { qty: '1', description: 'A' }, note: 'keep' });
  const out = convertTrailEntry(r);
  assert.deepEqual(out.snapshot, { note: 'keep', part: { qty: '1', description: 'A' } });
  assert.deepEqual(out.extras[0].snapshot, { note: 'keep', part: { qty: '1', description: 'B' } });
  assertIdempotent(r, out);
});

test('an update with one legacy "item <description>" key is renamed and folded', () => {
  const r = row('update', { 'item Plate': { from: '1x Plate', to: '2x Plate' } }, null);
  const out = convertTrailEntry(r);
  assert.deepEqual(Object.keys(out.changes), ['part Plate']);
  assert.deepEqual(out.snapshot, { part: { qty: '2', description: 'Plate' }, partBefore: { qty: '1', description: 'Plate' } });
  assertIdempotent(r, out);
});

test('start_timer with snapshot text "null" and an item change gets partDescription (R8-1)', () => {
  const r = row('start_timer', { item: { from: null, to: 'Plate' }, timer: { from: null, to: 'running' } }, 'null');
  const out = convertTrailEntry(r);
  assert.deepEqual(out.snapshot, { partDescription: 'Plate' });
  assertIdempotent(r, out);
});

test('add_time_entry with a worker change gets workerName (and the part)', () => {
  const r = row('add_time_entry', { worker: { from: null, to: 'Bob' }, item: { from: null, to: 'Plate' } }, { partQty: 4 });
  const out = convertTrailEntry(r);
  assert.deepEqual(out.snapshot, { partQty: 4, partDescription: 'Plate', workerName: 'Bob' });
  assert.equal(out.snapshot.workerId, undefined);
  assertIdempotent(r, out);
});

test('delete_time_entry takes the worker and part from the "from" side', () => {
  const r = row('delete_time_entry', { worker: { from: 'Bob', to: null }, item: { from: 'Plate', to: null } }, null);
  const out = convertTrailEntry(r);
  assert.deepEqual(out.snapshot, { partDescription: 'Plate', workerName: 'Bob' });
  assertIdempotent(r, out);
});

test('auto_stop_timer takes the worker from the row\'s own account', () => {
  const r = row('auto_stop_timer', { timer: { from: 'running', to: 'stopped' } }, 'null');
  const out = convertTrailEntry(r);
  assert.deepEqual(out.snapshot, { workerId: 'u1', workerName: 'Alice' });
  assertIdempotent(r, out);
});

test('assign with one exact answer is named; unassign reads the removed name', () => {
  const r = row('assign', { assignees: { from: 'Ann', to: 'Ann, Bo' } }, null);
  const out = convertTrailEntry(r);
  assert.deepEqual(out.snapshot, { workerName: 'Bo' });
  assertIdempotent(r, out);
  const u = row('unassign', { assignees: { from: 'Ann, Smith, John', to: 'Ann' } }, null);
  const outU = convertTrailEntry(u);
  assert.deepEqual(outU.snapshot, { workerName: 'Smith, John' });
  assertIdempotent(u, outU);
});

test('an ambiguous assign is left untouched', () => {
  assert.equal(convertTrailEntry(row('assign', { assignees: { from: 'Ann', to: 'Ann, Bo, Ann' } }, null)), undefined);
});

test('self_assign is left untouched', () => {
  assert.equal(convertTrailEntry(row('self_assign', { assignees: { from: 'none', to: 'Alice' } }, null)), undefined);
});

test('damaged JSON is skipped by both functions', () => {
  const r = row('update', '{"part x": ', null);
  assert.equal(readTrailEntry(r), undefined);
  assert.equal(convertTrailEntry(r), undefined);
  assert.equal(convertTrailEntry(row('assign', '{}', '{nope')), undefined);
});
