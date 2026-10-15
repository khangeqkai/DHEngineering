// coalesceRuns: a reload asked for while one is in flight runs once more, never twice at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coalesceRuns } from '../src/utils/coalesceRuns.js';

const gate = () => {
  let release;
  let fail;
  const promise = new Promise((res, rej) => { release = res; fail = rej; });
  return { promise, release, fail };
};
const tick = () => new Promise((r) => setImmediate(r));

test('three calls during one pending run make exactly two runs', async () => {
  const gates = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const run = coalesceRuns(async () => {
    const g = gate();
    gates.push(g);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await g.promise;
    inFlight -= 1;
  });
  run(); run(); run();
  assert.equal(gates.length, 1);
  gates[0].release();
  await tick();
  assert.equal(gates.length, 2);
  gates[1].release();
  await tick();
  assert.equal(gates.length, 2);
  assert.equal(maxInFlight, 1);
});

test('a call after the run settled starts a new run', async () => {
  let runs = 0;
  const run = coalesceRuns(async () => { runs += 1; });
  run();
  await tick();
  run();
  await tick();
  assert.equal(runs, 2);
});

test('a rejected run still lets the queued rerun happen', async () => {
  const gates = [];
  const run = coalesceRuns(() => { const g = gate(); gates.push(g); return g.promise; });
  run(); run();
  gates[0].fail(new Error('boom'));
  await tick();
  assert.equal(gates.length, 2);
  gates[1].release();
  await tick();
});

test('a function that throws synchronously does not wedge it', async () => {
  let runs = 0;
  const run = coalesceRuns(() => { runs += 1; throw new Error('x'); });
  run();
  await tick();
  run();
  await tick();
  assert.equal(runs, 2);
});
