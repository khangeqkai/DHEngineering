// Self-check: one Escape on the priority menu in JobIdentityStrip must close the
// menu only, never the job screen behind it. A review found one Escape closed the
// menu AND the whole job screen (BottomSheet reacts to Escape when it is the top
// modal), losing unsaved edits. A menu is not a window, so it stays off the modal
// stack (joining it would freeze the page and take a window layer); instead it
// takes Escape in the capture phase, before BottomSheet's listener, and stops it.
// This pins that wiring in source.
// Run: node scripts/check-priorityMenuEscape.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  new URL('../src/components/jobcard/JobIdentityStrip.jsx', import.meta.url),
  'utf8'
);

// The key listener must be registered in the capture phase, so it runs before the
// job screen's own Escape handling, and removed the same way.
assert(src.includes("document.addEventListener('keydown', onKey, true)"),
  'menu Escape must be caught in the capture phase, else Escape reaches the job dialog first');
assert(src.includes("document.removeEventListener('keydown', onKey, true)"),
  'the capture-phase listener must be removed with the same flag, else it leaks');

// Escape must be stopped there, so the job screen never sees it.
const onKey = src.match(/const onKey = \(e\) => \{[\s\S]*?\n {4}\};/);
assert(onKey, 'priority menu key handler not found');
assert(/e\.key === 'Escape'[\s\S]*?e\.stopPropagation\(\)/.test(onKey[0]),
  'menu Escape must stop propagation, else the job dialog closes too');

// A key aimed at a window opened over the menu (the inactivity warning) is not the menu's.
assert(onKey[0].includes('priorityRef.current?.contains(e.target)'),
  'menu must ignore keys aimed at a window drawn over it');

// The listener exists only while the menu is open.
assert(/useEffect\(\(\) => \{\s*if \(!showPriorityMenu\) return;[\s\S]*?addEventListener\('keydown', onKey, true\)/.test(src),
  'the Escape listener must be registered only while the priority menu is open');

// And the menu stays off the modal stack.
assert(!src.includes('pushModal('), 'a menu must not join the modal stack');

console.log('priorityMenuEscape check: menu takes Escape first, dialog stays quiet');
