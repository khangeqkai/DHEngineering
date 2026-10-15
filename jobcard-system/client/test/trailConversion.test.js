// Old trail entries, once converted, read right in the job History window. Run with
// `npm test` in client/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEntry } from '../src/utils/historySentences.js';
import trailEntries from '../../server/src/db/trailEntries.js';

const { convertTrailEntry } = trailEntries;
const say = (line) => line.parts.map((p) => p.text).join('');
const head = (entry) => say(describeEntry(entry).headline);

// Builds a stored row, converts it, and returns it in the shape the History window gets.
const converted = (action, changes, snapshot, user = { id: 'a', name: 'Alice' }) => {
  const row = {
    action, user_id: user.id, user_name: user.name,
    changes: JSON.stringify(changes), snapshot: snapshot === null ? 'null' : JSON.stringify(snapshot)
  };
  const out = convertTrailEntry(row);
  assert.ok(out, 'the fixture should convert');
  return { action, userId: user.id, userName: user.name, changes: out.changes, snapshot: out.snapshot };
};

test('a converted start_timer names the part', () => {
  const e = converted('start_timer', { item: { from: null, to: 'Plate' }, timer: { from: null, to: 'running' } }, null);
  assert.match(head(e), /Plate/);
});

test('a converted add_time_entry names the worker', () => {
  const e = converted('add_time_entry', {
    worker: { from: null, to: 'Bob' }, item: { from: null, to: 'Plate' },
    startTime: { from: null, to: '2026-10-15T00:00:00.000Z' }, endTime: { from: null, to: '2026-10-15T02:00:00.000Z' }
  }, null);
  assert.match(head(e), /for Bob on Plate/);
});

test('a converted add_time_entry whose worker name matches the actor still reads "for <name>"', () => {
  // An old entry recorded only a name, never an account, and names are never compared.
  const e = converted('add_time_entry', {
    worker: { from: null, to: 'Alice' }, item: { from: null, to: 'Plate' },
    startTime: { from: null, to: '2026-10-15T00:00:00.000Z' }, endTime: { from: null, to: '2026-10-15T02:00:00.000Z' }
  }, null);
  const text = head(e);
  assert.match(text, /for Alice/);
  assert.ok(!/their/.test(text), text);
});

test('a converted assign names the person', () => {
  const e = converted('assign', { assignees: { from: 'Ann', to: 'Ann, Bo' } }, null);
  assert.equal(head(e), 'Alice put Bo on the job');
});
