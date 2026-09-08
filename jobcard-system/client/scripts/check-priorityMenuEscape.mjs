// Self-check: the priority menu in JobIdentityStrip must join the shared modal
// stack while open. A review found one Escape closed the menu AND the whole
// job screen (BottomSheet reacts to Escape only when it is the top modal), so
// an unregistered menu let the dialog fire underneath it, losing unsaved edits.
// modalStack.js is ESM-in-.js and can't be imported from node, so this pins the
// wiring in source; the stack's layering semantics are exercised by every
// dialog in the app (CalendarPicker uses the same pattern).
// Run: node scripts/check-priorityMenuEscape.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  new URL('../src/components/jobcard/JobIdentityStrip.jsx', import.meta.url),
  'utf8'
);

// The menu's open-effect must register as a layer, gate its own Escape handling
// on being the top one, and deregister on close — the CalendarPicker pattern.
assert(src.includes('pushModal(priorityMenuId)'),
  'priority menu must join the modal stack while open, else Escape reaches the job dialog');
assert(src.includes('removeModal(priorityMenuId)'),
  'priority menu must leave the modal stack when it closes, else the stack leaks a layer');
assert(src.includes('isTopModal(priorityMenuId)'),
  'menu Escape must be gated on being top modal, else it eats Escape meant for a layer above it');

// Registration must live inside the effect guarded by showPriorityMenu, so the
// stack entry exists exactly while the menu is open.
const openEffect = src.match(
  /useEffect\(\(\) => \{\s*if \(!showPriorityMenu\) return;[\s\S]*?pushModal\(priorityMenuId\)/
);
assert(openEffect, 'pushModal must run only while the priority menu is open');

console.log('priorityMenuEscape check: menu joins the modal stack, dialog stays quiet');
