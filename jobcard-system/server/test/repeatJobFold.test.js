const test = require('node:test');
const assert = require('node:assert/strict');
const { repeatJobFold } = require('../src/db/repeatJobFold');

let n = 0;
const makeId = () => `note:${++n}`;

test('a tick with a previous job named needs nothing', () => {
  const r = repeatJobFold([{ id: 'j1', is_repeat_job: 1, repeat_job_reference: 'DH-00002', created_at: 'x' }], makeId);
  assert.deepEqual(r, { notes: [], clearReferenceIds: [] });
});

test('a tick with no previous job becomes a System comment dated with the job', () => {
  const r = repeatJobFold([{ id: 'j1', is_repeat_job: 1, repeat_job_reference: '  ', created_at: '2026-01-02T00:00:00.000Z' }], makeId);
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].jobcard_id, 'j1');
  assert.equal(r.notes[0].user_name, 'System');
  assert.equal(r.notes[0].created_at, '2026-01-02T00:00:00.000Z');
  assert.match(r.notes[0].text, /repeat job/);
});

test('a reference left on an unticked job is cleared', () => {
  const r = repeatJobFold([
    { id: 'j1', is_repeat_job: 0, repeat_job_reference: 'DH-00001', created_at: 'x' },
    { id: 'j2', is_repeat_job: 0, repeat_job_reference: null, created_at: 'x' }
  ], makeId);
  assert.deepEqual(r.clearReferenceIds, ['j1']);
  assert.equal(r.notes.length, 0);
});
