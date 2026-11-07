import test from 'node:test';
import assert from 'node:assert/strict';
import { rowMatchesSearch } from '../src/utils/rowMatchesSearch.js';

const row = { name: 'Kestrel Pumps', phones: '0412 345 678, 03 9876 5432', emails: 'jane@kestrel.com' };

test('text matches ignore case', () => {
  assert.equal(rowMatchesSearch(row, 'KESTREL', ['name']), true);
  assert.equal(rowMatchesSearch(row, 'jane@', ['name', 'emails']), true);
  assert.equal(rowMatchesSearch(row, 'zzz', ['name', 'emails']), false);
});

test('phone numbers match with or without spaces', () => {
  assert.equal(rowMatchesSearch(row, '0412345678', ['name'], ['phones']), true);
  assert.equal(rowMatchesSearch(row, '0412 345678', ['name'], ['phones']), true);
  assert.equal(rowMatchesSearch(row, '(03) 9876', ['name'], ['phones']), true);
  assert.equal(rowMatchesSearch(row, '0499', ['name'], ['phones']), false);
});

test('digits only compare against phone columns, never against names', () => {
  assert.equal(rowMatchesSearch({ name: 'Unit 12 34' }, '1234', ['name'], ['phones']), false);
  assert.equal(rowMatchesSearch({ name: 'Unit 12 34' }, '1234', ['name']), false);
});

test('a number shorter than 3 digits is not matched against phones', () => {
  assert.equal(rowMatchesSearch(row, '12', ['name'], ['phones']), false);
  assert.equal(rowMatchesSearch(row, '041', ['name'], ['phones']), true);
});
