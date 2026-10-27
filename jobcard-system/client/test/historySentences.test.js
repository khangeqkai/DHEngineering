// The job History window's wording, checked on its own. Each case names the review
// finding (bug_search.md) it guards. Run with `npm test` in client/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEntry } from '../src/utils/historySentences.js';
import { formatMoney } from '../src/utils/formatters.js';
import { displayName } from '../../server/src/shared/names.js';

const say = (line) => line.parts.map((p) => p.text).join('');
const head = (entry) => say(describeEntry(entry).headline);
const details = (entry) => describeEntry(entry).details.map(say);

const T0 = '2026-10-15T00:00:00.000Z';
const T2H = '2026-10-15T02:00:00.000Z';
const PLATE = { partDescription: 'Plate', partQty: 4 };

// ── R2-1 / R2-2: a part is drawn from the fields saved with it ─────────────────
test('R2-1: a part name with brackets is shown whole, with no made-up material', () => {
  const entry = {
    action: 'create', userId: 'a', userName: 'Alice',
    changes: { jobNumber: { from: null, to: '1001' }, 'part 1 added': { from: null, to: '2x Shaft (spare)' } },
    snapshot: { parts: { 'part 1 added': { qty: 2, description: 'Shaft (spare)' } } }
  };
  assert.equal(head(entry), 'Alice opened job 1001 with 1 part');
  assert.deepEqual(details(entry), ['2 × Shaft (spare)']);
});

test('R2-2: a supplier name with a comma is one treatment', () => {
  const entry = {
    action: 'update', userId: 'a', userName: 'Alice',
    changes: { 'part "Plate" added': { from: null, to: 'summary' } },
    snapshot: { part: { qty: 1, description: 'Plate', treatments: [{ name: 'Anodise', supplier: 'Smith, Jones Pty Ltd' }] } }
  };
  assert.equal(head(entry), 'Alice added a part: 1 × Plate · Anodise by Smith, Jones Pty Ltd');
});

// ── R2-4: a file moved between same-named parts ────────────────────────────────
test('R2-4: a file moved between two same-named parts names the part', () => {
  const entry = {
    action: 'reassign_file', userId: 'a', userName: 'Alice',
    changes: { file: { from: 'a.pdf', to: 'a.pdf' }, part: { from: '"Plate"', to: '"Plate"' } },
    snapshot: { itemId: 'p1' }
  };
  assert.equal(head(entry), 'Alice moved a.pdf to Plate');
});

test('R2-4: a move to a part with no name reads "a part", not "the whole job"', () => {
  const entry = {
    action: 'reassign_file', userId: 'a', userName: 'Alice',
    changes: { file: { from: 'a.pdf', to: 'a.pdf' }, part: { from: '', to: '' } },
    snapshot: { itemId: 'p1' }
  };
  assert.equal(head(entry), 'Alice moved a.pdf to a part');
});

test('R2-4: "the whole job" only when the entry has no part id', () => {
  const entry = {
    action: 'reassign_file', userId: 'a', userName: 'Alice',
    changes: { file: { from: 'a.pdf', to: 'a.pdf' }, part: { from: '"Plate"', to: null } },
    snapshot: {}
  };
  assert.equal(head(entry), 'Alice moved a.pdf to the whole job');
});

// ── R2-6: whose clock a stop was ───────────────────────────────────────────────
const stop = (userId, snapshot) => ({
  action: 'stop_timer', userId, userName: 'Alice',
  changes: { endTime: { from: null, to: T2H } },
  snapshot: { startTime: T0, ...PLATE, ...snapshot }
});

test('R2-6: someone else\'s clock is never credited to whoever pressed stop', () => {
  assert.equal(head(stop('alice', { workerId: 'bob', workerName: 'Bob' })), "Alice stopped Bob's clock on Plate (2 h)");
});

test('R2-6: an unknown worker reads "a clock", never "their"', () => {
  assert.equal(head(stop('alice', {})), 'Alice stopped a clock on Plate (2 h)');
});

test('own clock reads as finishing work', () => {
  assert.equal(head(stop('alice', { workerId: 'alice', workerName: 'Alice' })), 'Alice finished work on Plate (2 h)');
});

// ── R4-4-style: two people with one name are two people ────────────────────────
test('same name, different accounts: Ben stopping another Ben\'s clock is someone else\'s clock', () => {
  const entry = { ...stop('ben-1', { workerId: 'ben-2', workerName: 'Ben' }), userName: 'Ben' };
  assert.equal(head(entry), "Ben stopped Ben's clock on Plate (2 h)");
});

test('same name, same account: still their own clock', () => {
  const entry = { ...stop('ben-1', { workerId: 'ben-1', workerName: 'Ben' }), userName: 'Ben' };
  assert.equal(head(entry), 'Ben finished work on Plate (2 h)');
});

test('a worker name with no account id is never taken as the actor\'s own', () => {
  const entry = { ...stop('ben-1', { workerName: 'Ben' }), userName: 'Ben' };
  assert.equal(head(entry), "Ben stopped Ben's clock on Plate (2 h)");
});

// ── R3-3: auto-stopped and thrown-away clocks ─────────────────────────────────
test('R3-3: an auto-stop with no worker says "The clock", not the actor\'s', () => {
  const entry = { action: 'auto_stop_timer', userId: 'alice', userName: 'Alice', changes: { timer: { from: 'running', to: 'stopped at the end of normal hours' } }, snapshot: PLATE };
  assert.equal(head(entry), 'The clock on Plate stopped by itself at the end of normal hours. The worker still needs to confirm the real finish time');
});

test('R3-3: an auto-stop names its worker', () => {
  const entry = { action: 'auto_stop_timer', userId: 'bob', userName: 'Bob', changes: { timer: { from: 'running', to: 'stopped at the end of normal hours' } }, snapshot: { ...PLATE, workerId: 'bob', workerName: 'Bob' } };
  assert.equal(head(entry), "Bob's clock on Plate stopped by itself at the end of normal hours. Bob still needs to confirm the real finish time");
});

test('R3-3: a thrown-away clock with no worker says "The clock"', () => {
  const entry = { action: 'discard_timer', userId: 'alice', userName: 'Alice', changes: { timer: { from: 'running', to: 'discarded (under 15s)' } }, snapshot: PLATE };
  assert.equal(head(entry), 'The clock on Plate was thrown away after under 15 seconds, so no time was kept');
});

test('a thrown-away clock names the worker and who was taken off the job', () => {
  const entry = {
    action: 'discard_timer', userId: 'alice', userName: 'Alice',
    changes: { timer: { from: 'running', to: 'discarded (under 15s)' }, assignees: { from: 'Bob, Cy', to: 'Cy' } },
    snapshot: { ...PLATE, workerId: 'bob', workerName: 'Bob' }
  };
  assert.equal(head(entry), "Bob's clock on Plate was thrown away after under 15 seconds, so no time was kept");
  assert.deepEqual(details(entry), ['Bob was taken back off the job']);
});

// ── R3-7: office confirmations ────────────────────────────────────────────────
const confirm = (userId, snapshot) => ({
  action: 'confirm_finish', userId, userName: 'Olive',
  changes: { finish: { from: 'not confirmed', to: 'confirmed' } },
  snapshot: { ...PLATE, ...snapshot }
});

test("R3-7: the office confirming someone's finish names that someone", () => {
  assert.equal(head(confirm('olive', { workerId: 'bob', workerName: 'Bob' })), "Olive confirmed Bob's clock on Plate stopped at the right time");
});

test('R3-7: confirming your own clock reads "their"', () => {
  const entry = { ...confirm('bob', { workerId: 'bob', workerName: 'Bob' }), userName: 'Bob' };
  assert.equal(head(entry), 'Bob confirmed their clock on Plate stopped at the right time');
});

test('R3-7: unknown worker is neutral', () => {
  assert.equal(head(confirm('olive', {})), 'Olive confirmed the clock on Plate stopped at the right time');
});

test('R3-7: confirming a real finish time with no worker is neutral', () => {
  const entry = { action: 'confirm_finish', userId: 'olive', userName: 'Olive', changes: { endTime: { from: T0, to: T2H } }, snapshot: PLATE };
  assert.ok(head(entry).startsWith('Olive confirmed the real finish on Plate was '), head(entry));
});

test('same name, different accounts: a confirmation is for someone else', () => {
  const entry = { ...confirm('ben-1', { workerId: 'ben-2', workerName: 'Ben' }), userName: 'Ben' };
  assert.equal(head(entry), "Ben confirmed Ben's clock on Plate stopped at the right time");
});

// ── deleting a block ──────────────────────────────────────────────────────────
const removal = (userId, snapshot) => ({
  action: 'delete_time_entry', userId, userName: 'Olive',
  changes: { startTime: { from: T0, to: null }, endTime: { from: T2H, to: null } },
  snapshot: { ...PLATE, ...snapshot }
});

test('removing someone else\'s work names them', () => {
  assert.equal(head(removal('olive', { workerId: 'bob', workerName: 'Bob' })), "Olive removed Bob's 2 h of work on Plate");
});

test('removing your own work reads "their"', () => {
  assert.equal(head({ ...removal('bob', { workerId: 'bob', workerName: 'Bob' }), userName: 'Bob' }), 'Bob removed their 2 h of work on Plate');
});

test('removing work with no worker recorded is neutral', () => {
  assert.equal(head(removal('olive', {})), 'Olive removed the 2 h of work on Plate');
});

test('same name, different accounts: removed work is someone else\'s', () => {
  const entry = { ...removal('ben-1', { workerId: 'ben-2', workerName: 'Ben' }), userName: 'Ben' };
  assert.equal(head(entry), "Ben removed Ben's 2 h of work on Plate");
});

// ── editing a block with no worker recorded ───────────────────────────────────
test('an edit of a block with no worker says "the work", never "their"', () => {
  const entry = { action: 'update_time_entry', userId: 'alice', userName: 'Alice', changes: { description: { from: null, to: 'sanded' } }, snapshot: PLATE };
  assert.equal(head(entry), 'Alice wrote on the work on Plate: “sanded”');
});

test('reopening a clock with no worker is neutral', () => {
  const entry = { action: 'update_time_entry', userId: 'alice', userName: 'Alice', changes: { endTime: { from: T2H, to: null } }, snapshot: PLATE };
  assert.equal(head(entry), 'Alice reopened the clock on Plate');
});

test('moving work with no worker is neutral', () => {
  const entry = { action: 'update_time_entry', userId: 'alice', userName: 'Alice', changes: { item: { from: 'Plate', to: 'Base' } }, snapshot: PLATE };
  assert.equal(head(entry), 'Alice moved the work from Plate to Base');
});

test('an edit of someone else\'s block names them; of their own says "their"', () => {
  const change = { description: { from: null, to: 'x' } };
  const other = { action: 'update_time_entry', userId: 'alice', userName: 'Alice', changes: change, snapshot: { ...PLATE, workerId: 'bob', workerName: 'Bob' } };
  const own = { ...other, userId: 'bob', userName: 'Bob' };
  assert.equal(head(other), "Alice wrote on Bob's work on Plate: “x”");
  assert.equal(head(own), 'Bob wrote on their work on Plate: “x”');
});

test('same name, different accounts: an edit is of someone else\'s work', () => {
  const entry = { action: 'update_time_entry', userId: 'ben-1', userName: 'Ben', changes: { description: { from: null, to: 'x' } }, snapshot: { ...PLATE, workerId: 'ben-2', workerName: 'Ben' } };
  assert.equal(head(entry), "Ben wrote on Ben's work on Plate: “x”");
});

// ── same-name moves are told apart by the recorded ids ────────────────────────
test('re-crediting work to another staff member with the same name reads "the other Ben"', () => {
  const entry = { action: 'update_time_entry', userId: 'admin', userName: 'Admin', changes: { worker: { from: 'Ben', to: 'Ben' } }, snapshot: { ...PLATE, workerId: 'ben-2', workerName: 'Ben', workerIdBefore: 'ben-1' } };
  assert.equal(head(entry), 'Admin credited the work on Plate to the other Ben');
});

test('re-crediting work to a differently named person reads as before', () => {
  const entry = { action: 'update_time_entry', userId: 'admin', userName: 'Admin', changes: { worker: { from: 'Ben', to: 'Bob' } }, snapshot: { ...PLATE, workerId: 'bob', workerName: 'Bob', workerIdBefore: 'ben-1' } };
  assert.equal(head(entry), 'Admin credited the work on Plate to Bob');
});

test('moving work to another part with the same description reads "the other part called Plate"', () => {
  const entry = { action: 'update_time_entry', userId: 'admin', userName: 'Admin', changes: { item: { from: 'Plate', to: 'Plate' } }, snapshot: { ...PLATE, itemId: 'p2', itemIdBefore: 'p1' } };
  assert.equal(head(entry), 'Admin moved the work from Plate to the other part called Plate');
});

test('identical names with identical or missing ids still produce no worker or part line', () => {
  const same = { action: 'update_time_entry', userId: 'admin', userName: 'Admin', changes: { worker: { from: 'Ben', to: 'Ben' }, item: { from: 'Plate', to: 'Plate' } }, snapshot: { ...PLATE, workerId: 'ben-1', workerIdBefore: 'ben-1', itemId: 'p1', itemIdBefore: 'p1' } };
  assert.equal(head(same), 'Admin made a change');
  assert.equal(head({ ...same, snapshot: PLATE }), 'Admin made a change');
});

// ── R4-2: a removed or changed part is named by its stored details ─────────────
test('R4-2: a removed part is named from its details, not an old list position', () => {
  const entry = { action: 'update', userId: 'a', userName: 'Alice', changes: { 'part 3 removed': { from: '1x Bracket', to: null } }, snapshot: { part: { qty: 1, description: 'Bracket' } } };
  assert.equal(head(entry), 'Alice removed the part Bracket');
});

test('R4-2: a changed part is named as it was before the change', () => {
  const entry = {
    action: 'update', userId: 'a', userName: 'Alice',
    changes: { 'part 2': { from: '1x Plate', to: '2x Plate' } },
    snapshot: { part: { qty: 2, description: 'Plate' }, partBefore: { qty: 1, description: 'Plate' } }
  };
  assert.equal(head(entry), 'Alice changed the part Plate');
});

// ── R2-10: shared money and Critical rules ────────────────────────────────────
test('R2-10: pricing uses the shared money format', () => {
  const entry = { action: 'update_costing', userId: 'a', userName: 'Alice', changes: { grandTotal: { from: 100, to: 1234.5 } }, snapshot: null };
  assert.equal(head(entry), `Alice changed the pricing: job total now ${formatMoney(1234.5)}`);
});

test('R2-10: any filled-in non-Critical level is "lowered"', () => {
  const lowered = { action: 'update', userId: 'a', userName: 'Alice', changes: { qualityLevel: { from: 'CRITICAL', to: 'STANDARD' } }, snapshot: null };
  const raised = { action: 'update', userId: 'a', userName: 'Alice', changes: { qualityLevel: { from: 'STANDARD', to: 'CRITICAL' } }, snapshot: null };
  assert.ok(head(lowered).startsWith('Alice lowered the quality level to '));
  assert.ok(head(raised).startsWith('Alice raised the quality level to '));
});

// ── the one name rule ─────────────────────────────────────────────────────────
// Stored names are already clean (cleanName on save and at startup), so no trimming here.
test('displayName: name if not empty, else username, else empty', () => {
  assert.equal(displayName({ name: 'Ana Lee', username: 'ana' }), 'Ana Lee');
  assert.equal(displayName({ name: '', username: 'ana' }), 'ana');
  assert.equal(displayName({ name: null, username: 'ana' }), 'ana');
  assert.equal(displayName({ username: 'ana' }), 'ana');
  assert.equal(displayName({ name: 7, username: 'ana' }), 'ana');
  assert.equal(displayName({ name: '' }), '');
  assert.equal(displayName(null), '');
  assert.equal(displayName(undefined), '');
});

// ── Part change with an automatic status move ────────────────────────────────
const partEntry = (key, status) => ({
  action: 'update', userId: 'a', userName: 'Alice',
  changes: { [key]: key.endsWith('removed') ? { from: '2x Plate', to: null } : { from: null, to: '2x Plate' }, status },
  snapshot: { part: { qty: '2', description: 'Plate' } }
});
test('a part added that moves Done back to In Progress leads with the part', () => {
  const e = partEntry('part 3 added', { from: 'DONE', to: 'IN_PROGRESS' });
  assert.match(head(e), /^Alice added a part: /);
  assert.deepEqual(details(e), ['The job moved from Done to In Progress']);
  assert.equal(describeEntry(e).kind, 'job');
});
test('a part removed that moves the status leads with the part', () => {
  const e = partEntry('part 3 removed', { from: 'DONE', to: 'IN_PROGRESS' });
  assert.match(head(e), /^Alice removed the part /);
  assert.deepEqual(details(e), ['The job moved from Done to In Progress']);
  assert.equal(describeEntry(e).kind, 'job');
});
test('a status change with no part keeps the "moved the job" wording', () => {
  const e = { action: 'update', userId: 'a', userName: 'Alice', changes: { status: { from: 'DONE', to: 'IN_PROGRESS' } } };
  assert.equal(head(e), 'Alice moved the job from Done to In Progress');
});

// ── New status list ──────────────────────────────────────────────────────────
test('archiving reads as paid and archived, including old entries the rename turned into it', () => {
  const e = { action: 'update', userId: 'a', userName: 'Alice',
    changes: { status: { from: 'CALL_FOR_PAYMENT', to: 'ARCHIVED' }, archived: { from: false, to: true } } };
  assert.equal(head(e), 'Alice marked the job paid and archived it');
  assert.deepEqual(details(e), []);
});
test('a move to Call for Payment uses the new names and keeps the invoiced date quiet', () => {
  const e = { action: 'update', userId: 'a', userName: 'Alice',
    changes: { status: { from: 'TO_INVOICE', to: 'CALL_FOR_PAYMENT' }, invoicedDate: { from: null, to: '2026-10-27T01:00:00.000Z' } } };
  assert.equal(head(e), 'Alice moved the job from To be Invoiced to Call for Payment');
  assert.deepEqual(details(e), []);
});
test('carrying on without a PO number is said in plain words', () => {
  const e = { action: 'update', userId: 'a', userName: 'Alice',
    changes: { status: { from: 'TO_COST', to: 'TO_INVOICE' }, missingPo: { from: 'not entered', to: 'carried on anyway' } } };
  assert.equal(head(e), 'Alice moved the job from To be Costed to To be Invoiced');
  assert.deepEqual(details(e), ['No PO number was entered — carried on anyway']);
});
test('every on-hold reason reads by its name', () => {
  const e = { action: 'update', userId: 'a', userName: 'Alice', changes: { status: { from: 'IN_PROGRESS', to: 'HOLD_SUBCONTRACT' } } };
  assert.equal(head(e), 'Alice moved the job from In Progress to On Hold – Subcontract');
});

// ── Assign entries name the one person recorded ──────────────────────────────
const assignEntry = (action, from, to, snapshot) => ({ action, userId: 'a', userName: 'Alice', changes: { assignees: { from, to } }, snapshot });
test('assign and unassign name the recorded worker, never compare names', () => {
  assert.equal(head(assignEntry('assign', 'Ben', 'Ben, Ben', { workerId: 'u2', workerName: 'Ben' })), 'Alice put Ben on the job');
  assert.equal(head(assignEntry('unassign', 'Ann, Smith, John', 'Ann', { workerName: 'Smith, John' })), 'Alice took Smith, John off the job');
  assert.equal(head(assignEntry('assign', 'none', 'Ann, Bo', null)), "Alice changed who's on the job");
  assert.equal(head(assignEntry('self_assign', 'none', 'Alice', { workerName: 'Alice' })), 'Alice put themselves on the job');
});

// ── Keys older trails carry ──────────────────────────────────────────────────
const old = (changes) => ({ action: 'update', userId: 'a', userName: 'Alice', changes });
test('legacy jobCardPreviewed reads as opening the preview', () => {
  assert.equal(head(old({ jobCardPreviewed: { from: null, to: '2026-10-14T13:12:55.000Z' } })), 'Alice opened the job card preview');
});
test('legacy packetBuilt reads as building a print packet', () => {
  assert.equal(head(old({ packetBuilt: { from: null, to: '2026-10-14T13:12:55.000Z' } })), 'Alice built a print packet');
});
test('legacy whole-job-save assignees reads as a change with the new list', () => {
  const e = old({ assignees: { from: 'Ann', to: 'Ann, Bo' } });
  assert.equal(head(e), "Alice changed who's on the job");
  assert.deepEqual(details(e), ['Now on the job: Ann, Bo']);
  assert.equal(describeEntry(e).kind, 'people');
});
test('legacy photos reads from the stored counts', () => {
  assert.equal(head(old({ photos: { from: '0 photos', to: '2 photos' } })), 'Alice added 2 photos to the job');
  assert.equal(head(old({ photos: { from: '3 photos', to: '2 photos' } })), 'Alice removed 1 photo from the job');
  assert.equal(head(old({ photos: { from: 'x', to: 'y' } })), 'Alice changed the job photos');
});
test('legacy qaLevelId and customer ids never print raw ids', () => {
  assert.equal(head(old({ qaLevelId: { from: 'a1', to: 'b2' } })), 'Alice changed the quality form level');
  assert.equal(head(old({ contactId: { from: 'c1', to: 'c2' } })), 'Alice changed the customer on the job');
});

// ── Manual time: an admin's own time does not repeat their name ────────────────
test('manual time: own time says "their", another worker\'s still says "for <name>"', () => {
  const base = {
    action: 'add_time_entry', userId: 'a', userName: 'Alice',
    changes: { startTime: { from: null, to: T0 }, endTime: { from: null, to: T2H } }
  };
  const own = head({ ...base, snapshot: { workerId: 'a', workerName: 'Alice', ...PLATE } });
  assert.ok(!/for Alice/.test(own), own);
  assert.match(own, /^Alice added 2 h of their work on Plate/);
  const other = head({ ...base, snapshot: { workerId: 'b', workerName: 'Bob', ...PLATE } });
  assert.match(other, /^Alice added 2 h of work for Bob on Plate/);
  const open = { action: 'add_time_entry', userId: 'a', userName: 'Alice', changes: { startTime: { from: null, to: T0 } } };
  assert.match(head({ ...open, snapshot: { workerId: 'a', workerName: 'Alice', ...PLATE } }), /^Alice started their own open clock on Plate/);
  assert.match(head({ ...open, snapshot: { workerId: 'b', workerName: 'Bob', ...PLATE } }), /^Alice started an open clock for Bob on Plate/);
});
