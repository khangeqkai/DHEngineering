const test = require('node:test');
const assert = require('node:assert');
const { stopNoteMessage, STOP_NOTE_MESSAGE } = require('../src/shared/stopNote');

test('real answers pass, including short ones', () => {
  for (const ok of ['QC', 'Setup', 'Weld', 'Deburr 5 mm', '  Ran first-off  ', 'Zażółć']) {
    assert.strictEqual(stopNoteMessage(ok), null, ok);
  }
});

test('junk is refused with the one message', () => {
  for (const bad of ['', '   ', null, undefined, 'x', 'aaaa', 'AAAA', 'a a a', '....', '123', '12 34', 'q', '!!', 'ii']) {
    assert.strictEqual(stopNoteMessage(bad), STOP_NOTE_MESSAGE, String(bad));
  }
});
