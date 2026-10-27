// The status rule's actors, checked with no database. Run with `npm test` in server/.
const test = require('node:test');
const assert = require('node:assert/strict');
const { canSetStatus, canChangeStatus, offeredStatusValues, standingStatus } = require('../src/shared/jobStatus');
const jobStatuses = require('../src/shared/jobStatuses.json');

const admin = { canManage: true, canInvoice: true };
const manager = { canManage: true, canInvoice: false };
const worker = { canManage: false, canInvoice: false };

const SHOP_FLOOR = ['OPEN', 'IN_PROGRESS', 'DONE', 'HOLD_PO', 'HOLD_MATERIAL', 'HOLD_SUBCONTRACT', 'HOLD_TOOLS', 'HOLD_CUSTOMER', 'READY_TO_COLLECT', 'ACTION_REQUIRED'];
const OFFICE = ['TO_QUOTE', 'QUOTE_SENT', 'TO_COST'];
const MONEY = ['TO_INVOICE', 'CALL_FOR_PAYMENT', 'ARCHIVED'];

test('the three lists above cover every status exactly once', () => {
  const all = [...SHOP_FLOOR, ...OFFICE, ...MONEY].sort();
  assert.deepEqual(all, jobStatuses.statuses.map(s => s.value).sort());
});

test('a worker moves freely among the shop-floor statuses', () => {
  for (const f of SHOP_FLOOR) for (const t of SHOP_FLOOR) assert.equal(canSetStatus(worker, f, t), true, `${f} -> ${t}`);
});

test('a worker can neither put a job into nor take it out of an office or money status', () => {
  for (const s of [...OFFICE, ...MONEY]) {
    assert.equal(canSetStatus(worker, 'IN_PROGRESS', s), false, `into ${s}`);
    assert.equal(canSetStatus(worker, s, 'IN_PROGRESS'), false, `out of ${s}`);
    assert.equal(canSetStatus(worker, s, 'ACTION_REQUIRED'), false, `alert from ${s}`);
    assert.equal(canChangeStatus(worker, s), false, s);
  }
});

test('a manager handles quoting and hands a job to costing, but never moves it on from there', () => {
  assert.equal(canSetStatus(manager, 'OPEN', 'QUOTE_SENT'), true);
  assert.equal(canSetStatus(manager, 'QUOTE_SENT', 'OPEN'), true);
  assert.equal(canSetStatus(manager, 'DONE', 'TO_COST'), true);
  assert.equal(canSetStatus(manager, 'TO_COST', 'TO_INVOICE'), false);
  assert.equal(canSetStatus(manager, 'TO_COST', 'IN_PROGRESS'), false);
  assert.equal(canChangeStatus(manager, 'TO_COST'), false);
});

test('a manager never makes a money move', () => {
  for (const s of MONEY) {
    assert.equal(canSetStatus(manager, 'DONE', s), false, `into ${s}`);
    assert.equal(canSetStatus(manager, s, 'DONE'), false, `out of ${s}`);
  }
});

test('an admin moves a job through costing and billing', () => {
  assert.equal(canSetStatus(admin, 'TO_COST', 'TO_INVOICE'), true);
  assert.equal(canSetStatus(admin, 'TO_INVOICE', 'CALL_FOR_PAYMENT'), true);
  assert.equal(canSetStatus(admin, 'CALL_FOR_PAYMENT', 'ARCHIVED'), true);
  assert.equal(canSetStatus(admin, 'CALL_FOR_PAYMENT', 'IN_PROGRESS'), true);
});

test('an unchanged status is always allowed', () => {
  for (const a of [admin, manager, worker]) {
    for (const s of jobStatuses.statuses.map(x => x.value)) assert.equal(canSetStatus(a, s, s), true);
  }
});

test('a new job needs only the target end', () => {
  assert.equal(canSetStatus(manager, null, 'TO_QUOTE'), true);
  assert.equal(canSetStatus(manager, null, 'TO_INVOICE'), false);
  assert.equal(canSetStatus(admin, null, 'CALL_FOR_PAYMENT'), true);
});

test('an unknown status can be neither left nor set', () => {
  assert.equal(canSetStatus(admin, 'INVOICED', 'OPEN'), false);
  assert.equal(canSetStatus(admin, 'OPEN', 'INVOICED'), false);
});

test('Paid – Archived is offered only to the admin, and only on an existing job', () => {
  assert.ok(offeredStatusValues(admin, 'CALL_FOR_PAYMENT', true).includes('ARCHIVED'));
  assert.ok(!offeredStatusValues(admin, 'CALL_FOR_PAYMENT', false).includes('ARCHIVED'));
  assert.ok(!offeredStatusValues(manager, 'DONE', true).includes('ARCHIVED'));
  assert.ok(!offeredStatusValues(worker, 'OPEN', true).includes('ARCHIVED'));
});

test('a picker always offers the status the job sits on, in list order', () => {
  const offered = offeredStatusValues(worker, 'TO_COST');
  assert.deepEqual(offered, ['TO_COST']);
  const workerOpen = offeredStatusValues(worker, 'OPEN');
  assert.deepEqual(workerOpen, jobStatuses.statuses.map(s => s.value).filter(v => SHOP_FLOOR.includes(v)));
});

test('a new job is never offered a billing status', () => {
  for (const s of jobStatuses.billingStatuses) {
    assert.ok(!offeredStatusValues(admin, 'OPEN', false).includes(s), s);
  }
  assert.ok(offeredStatusValues(admin, 'OPEN', false).includes('TO_COST'));
});

test('taking Action Required off needs what leaving the remembered status needs', () => {
  // The office flagged a billed job: a worker can't use the flag as a side door.
  assert.equal(canSetStatus(worker, 'ACTION_REQUIRED', 'OPEN', 'CALL_FOR_PAYMENT'), false);
  assert.equal(canChangeStatus(worker, 'ACTION_REQUIRED', 'CALL_FOR_PAYMENT'), false);
  assert.equal(canSetStatus(manager, 'ACTION_REQUIRED', 'DONE', 'TO_COST'), false);
  assert.equal(canSetStatus(admin, 'ACTION_REQUIRED', 'CALL_FOR_PAYMENT', 'CALL_FOR_PAYMENT'), true);
  // Flagged from the shop floor, anyone takes it off.
  assert.equal(canSetStatus(worker, 'ACTION_REQUIRED', 'IN_PROGRESS', 'IN_PROGRESS'), true);
  assert.equal(canSetStatus(worker, 'ACTION_REQUIRED', 'OPEN'), true);
  assert.deepEqual(offeredStatusValues(worker, 'ACTION_REQUIRED', true, 'QUOTE_SENT'), ['ACTION_REQUIRED']);
});

test('a flagged job stands on the status it remembers', () => {
  assert.equal(standingStatus('ACTION_REQUIRED', 'TO_INVOICE'), 'TO_INVOICE');
  assert.equal(standingStatus('ACTION_REQUIRED', null), 'ACTION_REQUIRED');
  assert.equal(standingStatus('DONE', 'IN_PROGRESS'), 'DONE');
});
