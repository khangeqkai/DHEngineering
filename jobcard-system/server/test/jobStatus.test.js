// The status rule's actors, checked with no database. Run with `npm test` in server/.
const test = require('node:test');
const assert = require('node:assert/strict');
const { canSetStatus, offeredStatusValues } = require('../src/shared/jobStatus');

const admin = { canManage: true, canInvoice: true };
const manager = { canManage: true, canInvoice: false };
const worker = { canManage: false, canInvoice: false };

test('admin may set Invoiced', () => {
  assert.equal(canSetStatus(admin, 'DONE', 'INVOICED'), true);
});

test('manager may not set Invoiced but may set other statuses', () => {
  assert.equal(canSetStatus(manager, 'DONE', 'INVOICED'), false);
  assert.equal(canSetStatus(manager, 'IN_PROGRESS', 'DONE'), true);
  assert.equal(canSetStatus(manager, 'OPEN', 'QUOTE'), true);
});

test('worker only moves between the allowed statuses', () => {
  const from = ['OPEN', 'IN_PROGRESS', 'AWAITING_MATERIAL'];
  const to = ['IN_PROGRESS', 'AWAITING_MATERIAL'];
  for (const f of from) for (const t of to) assert.equal(canSetStatus(worker, f, t), true);
  assert.equal(canSetStatus(worker, 'OPEN', 'DONE'), false);
  assert.equal(canSetStatus(worker, 'OPEN', 'INVOICED'), false);
  assert.equal(canSetStatus(worker, 'DONE', 'IN_PROGRESS'), false);
});

test('an unchanged status is always allowed', () => {
  for (const a of [admin, manager, worker]) {
    assert.equal(canSetStatus(a, 'INVOICED', 'INVOICED'), true);
    assert.equal(canSetStatus(a, 'DONE', 'DONE'), true);
  }
});

test('Invoiced is offered only to the admin on an existing job', () => {
  assert.ok(offeredStatusValues(admin, 'DONE', true).includes('INVOICED'));
  assert.ok(!offeredStatusValues(admin, 'DONE', false).includes('INVOICED'));
  assert.ok(!offeredStatusValues(manager, 'DONE', true).includes('INVOICED'));
  assert.ok(!offeredStatusValues(worker, 'OPEN', true).includes('INVOICED'));
});
