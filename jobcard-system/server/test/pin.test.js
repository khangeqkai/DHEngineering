const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidPin, isWeakPin } = require('../src/shared/pin');

test('a PIN is exactly four digits', () => {
  assert.equal(isValidPin('4821'), true);
  assert.equal(isValidPin('482'), false);
  assert.equal(isValidPin('48211'), false);
  assert.equal(isValidPin('48a1'), false);
});

test('repeated digits and straight runs are weak', () => {
  for (const weak of ['0000', '1111', '9999', '1234', '4321', '0123', '3210']) assert.equal(isWeakPin(weak), true, weak);
  for (const fine of ['4821', '1357', '1235', '1212']) assert.equal(isWeakPin(fine), false, fine);
});
