// What the app remembers for a signed-in person is forgotten on sign-out, and the
// sign-out paths all go through the one place that forgets it. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  rememberJobListView, recallJobListView, rememberSearchView, recallSearchView, forgetSessionMemory
} from '../src/utils/sessionMemory.js';

test('the job list view and the search are recalled, then forgotten together', () => {
  rememberJobListView({ filter: 'OVERDUE', myJobsOnly: true, sortBy: 'dueDate', sortDir: 'asc' });
  rememberSearchView({ q: 'bolt', scope: 'jobs' });
  assert.equal(recallJobListView().filter, 'OVERDUE');
  assert.equal(recallSearchView().q, 'bolt');
  forgetSessionMemory();
  assert.equal(recallJobListView(), null);
  assert.equal(recallSearchView(), null);
});

test('the job list view never carries search words', () => {
  rememberJobListView({ filter: 'all' });
  assert.equal('q' in recallJobListView(), false);
  forgetSessionMemory();
});

test('both sign-out paths in AuthContext forget through the one function', () => {
  const src = readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
  const calls = src.match(/^\s+endSession\(\);$/gm) || [];
  assert.equal(calls.length, 2);
  assert.equal((src.match(/setUser\(null\)/g) || []).length, 2);
});
