// Self-check: the job screen's confirm box must queue questions rather than let a later
// one overwrite the pending answer of an earlier one. A review found that an admin on an
// invoiced job who edits both the job and its pricing and then presses Escape sees "close
// and lose them?" get silently reworded to "change an invoiced job?" a second later — the
// pricing screen asks from its own countdown, not from a click — after which the close was
// never answered and the card sat there refusing to shut.
//
// useConfirmDialog keeps every moving part in refs, so React's hooks can be stood in for
// with a mutable cell and plain objects and the real logic still runs. The box's rendering
// is ConfirmDialog's job and is not exercised here.
// Run: node scripts/check-confirmQueue.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/hooks/useConfirmDialog.js', import.meta.url), 'utf8')
  .replace("import { useState, useCallback, useRef, useEffect } from 'react';", '')
  .replace('export function', 'function');

let cell;
const useConfirmDialog = new Function('useState', 'useCallback', 'useRef', 'useEffect',
  `${src}\n return useConfirmDialog;`)(
  (init) => [cell ??= init, (u) => { cell = typeof u === 'function' ? u(cell) : u; }],
  (fn) => fn,
  (v) => ({ current: v }),
  () => {}
);

const fresh = () => { cell = undefined; return useConfirmDialog(); };
// Longer than the gap the hook leaves between one answer and the next question.
const afterGap = () => new Promise(r => setTimeout(r, 400));
const settled = () => new Promise(r => setTimeout(r, 0));

// The reported case: Escape, then the pricing countdown a second later.
{
  const box = fresh();
  let close = 'unanswered';
  let pricing = 'unanswered';
  box.showConfirm({ title: 'Discard draft?', message: 'Close it and lose them?' }).then(v => { close = v; });
  assert.equal(cell.title, 'Discard draft?', 'the first question must be the one on screen');

  box.showConfirm({ title: 'Change an invoiced job?', message: 'Are you sure?' }).then(v => { pricing = v; });
  assert.equal(cell.title, 'Discard draft?', 'a second question must not reword the box under the reader');

  box.handleCancel();
  await settled();
  assert.equal(close, false, 'the answer must go to the question that was actually asked');
  assert.equal(cell.isOpen, false, 'the box must go away between the two questions');
  assert.equal(pricing, 'unanswered', 'the queued question must wait its turn');

  await afterGap();
  assert.ok(cell.isOpen && cell.title === 'Change an invoiced job?', 'the queued question must then be asked');
  box.handleConfirm();
  await settled();
  assert.equal(pricing, true, 'the queued question must get its own answer');
}

// A double-click sends two presses; the second must not swallow the next question.
{
  const box = fresh();
  let first = 'unanswered';
  let second = 'unanswered';
  box.showConfirm({ message: 'first' }).then(v => { first = v; });
  box.showConfirm({ message: 'second' }).then(v => { second = v; });
  box.handleConfirm();
  box.handleConfirm();
  await afterGap();
  assert.equal(first, true, 'the first press answers the question on screen');
  assert.equal(second, 'unanswered', 'the second press must answer nothing');
  assert.ok(cell.isOpen && cell.message === 'second', 'the queued question must still be asked');
}

// Closing the job screen: nothing renders the box any more, so anything outstanding has
// to be answered "no" — otherwise it never settles and parks every later question behind it.
{
  const box = fresh();
  let onScreen = 'unanswered';
  let queued = 'unanswered';
  box.showConfirm({ message: 'on screen' }).then(v => { onScreen = v; });
  box.showConfirm({ message: 'queued' }).then(v => { queued = v; });
  box.cancelConfirms();
  await afterGap();
  assert.equal(onScreen, false, 'closing must answer the question on screen');
  assert.equal(queued, false, 'closing must answer the queued question too');
  assert.equal(cell.isOpen, false, 'closing must leave nothing showing');

  let later = 'unanswered';
  box.showConfirm({ message: 'next time' }).then(v => { later = v; });
  assert.ok(cell.isOpen && cell.message === 'next time', 'the box must work again next time the screen opens');
  box.handleConfirm();
  await settled();
  assert.equal(later, true, 'and that question must be answerable');
}

console.log('check-confirmQueue: 3 scenarios OK');
