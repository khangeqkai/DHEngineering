import test from 'node:test';
import assert from 'node:assert/strict';
import { sameNumber } from '../src/utils/sameNumber.js';

test('50 and 50.00 are the same figure', () => {
  assert.equal(sameNumber('50', '50.00'), true);
  assert.equal(sameNumber('1.5', '1.50'), true);
});

test('different figures, blanks and half-typed text are not the same', () => {
  assert.equal(sameNumber('50', '51'), false);
  assert.equal(sameNumber('', '0'), false);
  assert.equal(sameNumber('', ''), true);
  assert.equal(sameNumber('5.', '5'), true);
  assert.equal(sameNumber('abc', '5'), false);
});
