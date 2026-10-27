// The status list's one-time rename, checked with no database. Run with `npm test` in server/.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS_RENAMES, OLD_STATUS_CODES, renameStatusInChanges } = require('../src/db/statusRename');
const { quoteReferenceNotes } = require('../src/db/quoteReferenceFold');
const jobStatuses = require('../src/shared/jobStatuses.json');

const CURRENT = new Set(jobStatuses.statuses.map(s => s.value));

test('every old code lands on a current status, and no current code reuses an old one', () => {
  for (const [from, to] of Object.entries(STATUS_RENAMES)) {
    assert.ok(CURRENT.has(to), `${from} -> ${to}`);
    assert.ok(!CURRENT.has(from), `${from} is still current`);
  }
  assert.deepEqual(OLD_STATUS_CODES.sort(), Object.keys(STATUS_RENAMES).sort());
});

test('the mapping the office agreed', () => {
  assert.equal(STATUS_RENAMES.QUOTE, 'TO_QUOTE');
  assert.equal(STATUS_RENAMES.AWAITING_MATERIAL, 'HOLD_MATERIAL');
  assert.equal(STATUS_RENAMES.TREATMENT, 'HOLD_MATERIAL');
  assert.equal(STATUS_RENAMES.ON_HOLD, 'HOLD_MATERIAL');
  assert.equal(STATUS_RENAMES.PO_REQUESTED, 'HOLD_PO');
  assert.equal(STATUS_RENAMES.CUST_NOTIFIED, 'READY_TO_COLLECT');
  assert.equal(STATUS_RENAMES.INVOICED, 'ARCHIVED');
});

test('a trail entry moving between old codes is renamed at both ends, keeping everything else', () => {
  const changes = { status: { from: 'CUST_NOTIFIED', to: 'INVOICED' }, archived: { from: false, to: true } };
  assert.deepEqual(renameStatusInChanges(changes), {
    status: { from: 'READY_TO_COLLECT', to: 'ARCHIVED' }, archived: { from: false, to: true }
  });
});

test('a move with one unchanged code renames only the other end', () => {
  assert.deepEqual(renameStatusInChanges({ status: { from: 'OPEN', to: 'AWAITING_MATERIAL' } }), {
    status: { from: 'OPEN', to: 'HOLD_MATERIAL' }
  });
  assert.deepEqual(renameStatusInChanges({ status: { from: null, to: 'QUOTE' } }), {
    status: { from: null, to: 'TO_QUOTE' }
  });
});

test('nothing to rename returns undefined, so nothing is written back', () => {
  assert.equal(renameStatusInChanges({ status: { from: 'OPEN', to: 'DONE' } }), undefined);
  assert.equal(renameStatusInChanges({ status: { from: 'Active', to: 'Archived' } }), undefined);
  assert.equal(renameStatusInChanges({ priority: { from: 'LOW', to: 'HIGH' } }), undefined);
  assert.equal(renameStatusInChanges(null), undefined);
  assert.equal(renameStatusInChanges({ status: 'OPEN' }), undefined);
});

test('a renamed entry is never renamed again', () => {
  const once = renameStatusInChanges({ status: { from: 'QUOTE', to: 'INVOICED' } });
  assert.equal(renameStatusInChanges(once), undefined);
});

test('quote references become one comment per job that had one', () => {
  let n = 0;
  const notes = quoteReferenceNotes([
    { id: 'j1', quote_reference: ' Q-100 ', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'j2', quote_reference: '   ', created_at: '2026-01-02T00:00:00.000Z' },
    { id: 'j3', quote_reference: null, created_at: '2026-01-03T00:00:00.000Z' },
    { id: 'j4', created_at: '2026-01-04T00:00:00.000Z' }
  ], () => `n${++n}`);
  assert.deepEqual(notes, [{
    id: 'n1', jobcard_id: 'j1', user_id: 'system', user_name: 'System',
    text: 'Quote reference (moved here from the old Quote Reference box): Q-100',
    created_at: '2026-01-01T00:00:00.000Z'
  }]);
});
