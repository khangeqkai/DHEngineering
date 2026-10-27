// The job History window's wording, in one place. describeEntry turns one trail entry
// (the server's `{ action, userName, changes, snapshot, createdAt }`) into plain
// sentences a person can read without knowing how the trail is stored:
//
//   { kind, ring, headline, details }
//
// A line is `{ parts: [{ text, strong? }], was? }` — `parts` is the sentence (`strong`
// marks the names, the part and the new value), `was` is the old value, which the tab
// prints after it in small grey as "was …". No JSX and no React here, so the sentences
// can be checked on their own.
import { formatHistoryValue, formatMoney, formatTime, toIsoDate } from './formatters';
import { isCriticalLevel } from '../../../server/src/shared/qualityLevels';
import jobStatuses from '../../../server/src/shared/jobStatuses.json';

// The coloured groups the tab filters by, in the order the chips appear.
export const KINDS = [
  { key: 'job', label: 'Job details' },
  { key: 'status', label: 'Status' },
  { key: 'people', label: 'People' },
  { key: 'work', label: 'Work & time' },
  { key: 'quality', label: 'Quality & scrap' },
  { key: 'price', label: 'Pricing' },
  { key: 'files', label: 'Files' },
  { key: 'comment', label: 'Comments' },
  { key: 'alert', label: 'Needs a look' }
];

// ── Small building blocks ────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const strong = (text) => ({ text: String(text), strong: true });
const isEmpty = (v) => v === null || v === undefined || v === '';
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const cut = (s, n) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const truthy = (v) => v === 1 || v === true || v === '1' || v === 'true';
const falsy = (v) => v === 0 || v === false || v === '0' || v === 'false';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// The server names a part in quotes ("Plate") inside keys and file moves; the sentence
// shows it bold instead.
const unquote = (s) => String(s).replace(/^"([\s\S]*)"$/, '$1');

// The name a part change is worded under: the description in the entry's own snapshot (the
// part as it was named then). The key's text is never used: an old key held only a list
// position ("part 3"), which would read as today's part 3, and every part entry, live or
// converted at startup, carries its part in the snapshot.
const partNameFor = (part) => (
  typeof part?.description === 'string' && part.description.trim() ? part.description.trim() : 'a part'
);

// Segments may be strings, ready-made parts, falsy gaps, or arrays of those.
function flat(segs) {
  const out = [];
  for (const s of segs) {
    if (Array.isArray(s)) out.push(...flat(s));
    else if (s === null || s === undefined || s === false || s === '') continue;
    else out.push(typeof s === 'string' ? { text: s } : s);
  }
  return out;
}

// A sentence with no person in it.
function plain(segs, was) {
  const line = { parts: flat(segs) };
  if (!isEmpty(was)) line.was = String(was);
  return line;
}

// A sentence that starts with the person who did it. With no name on the entry it
// is written without one ("Started a clock…").
function act(x, segs, was) {
  const line = plain(segs, was);
  if (x.A) { line.parts.unshift({ text: `${x.A} ` }); line.led = true; }
  else if (line.parts[0]) line.parts[0] = { ...line.parts[0], text: cap(line.parts[0].text) };
  return line;
}

function toDate(v) {
  if (isEmpty(v)) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return new Date(`${v.trim()}T00:00:00`);
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Written out rather than asked of the browser, so "Sept" never turns up for "Sep".
const short = (name) => name.slice(0, 3);

// "3 Oct 2026" — a bare calendar day, or the day of a moment.
function shortDate(v) {
  const d = toDate(v);
  return d ? `${d.getDate()} ${short(MONTH_NAMES[d.getMonth()])} ${d.getFullYear()}` : '';
}

// "Fri 26 Sep"
function dayMonth(v) {
  const d = toDate(v);
  return d ? `${short(DAY_NAMES[d.getDay()])} ${d.getDate()} ${short(MONTH_NAMES[d.getMonth()])}` : '';
}

const clock = (v) => formatTime(v, { hour: '2-digit', minute: '2-digit' });

// "Sat 27 Sep, 14:30"
function dayTime(v) {
  const d = toDate(v);
  return d ? `${dayMonth(v)}, ${clock(v)}` : '';
}

// The heading above a day's entries: "Today", "Yesterday", else "Saturday 27 September"
// (with the year when it is not this year). Judged on the local calendar day.
export function dayHeading(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return '';
  const iso = toIsoDate(d);
  if (iso === toIsoDate(now)) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (iso === toIsoDate(yesterday)) return 'Yesterday';
  const text = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? text : `${text} ${d.getFullYear()}`;
}

// "1 h 48 m" / "2 h" / "35 m" / "under 1 m"
function duration(fromValue, toValue) {
  const a = toDate(fromValue);
  const b = toDate(toValue);
  if (!a || !b) return '';
  const minutes = Math.floor(Math.max(0, b.getTime() - a.getTime()) / 60000);
  if (minutes < 1) return 'under 1 m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} m`;
  return h ? `${h} h` : `${m} m`;
}

const label = (field, v) => formatHistoryValue(field, v);
const wasOf = (change, fmt) => (change && !isEmpty(change.from) ? fmt(change.from) : undefined);
const sayWord = (v) => label('', v) || 'blank';

// A part as a sentence: bold "2 ×", then its pieces joined by " · ". `part` is the plain
// part the server keeps in the entry's snapshot (qty, description, jobType, material,
// treatments [{ name, supplier }], drawingsType, customerProperty). Every part entry
// carries it (live routes write it; the startup conversion folds it into older ones), so
// with none there is nothing to show.
function partSentence(part) {
  if (!part || typeof part !== 'object') return [];
  const bits = [String(part.description ?? '')];
  if (part.jobType) bits.push(part.jobType);
  if (part.material) bits.push(part.material);
  for (const t of Array.isArray(part.treatments) ? part.treatments : []) {
    bits.push(t.supplier ? `${t.name} by ${t.supplier}` : `${t.name}, no supplier yet`);
  }
  if (part.drawingsType && part.drawingsType !== 'N/A') bits.push(`drawings: ${part.drawingsType}`);
  if (part.customerProperty && part.customerProperty !== 'N/A') bits.push(`customer property: ${part.customerProperty}`);
  const out = [];
  if (part.qty) out.push(strong(`${part.qty} ×`), ' ');
  out.push(bits.join(' · '));
  return out;
}

// ── Reading an entry ─────────────────────────────────────────────────────────

// A worker or part change whose before and after read the same is still a real change
// when the server recorded that the before and after are different records (two staff
// called Ben, two parts called Plate).
function sameNameMove(key, snap) {
  const [before, after] = key === 'worker' ? [snap.workerIdBefore, snap.workerId]
    : key === 'item' ? [snap.itemIdBefore, snap.itemId] : [];
  return before != null && after != null && before !== after;
}

function readEntry(entry) {
  const raw = entry.changes && typeof entry.changes === 'object' ? entry.changes : {};
  const snap = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : {};
  const L = {};
  for (const [key, change] of Object.entries(raw)) {
    const c = change && typeof change === 'object' ? change : { from: null, to: change };
    const from = c.from === undefined ? null : c.from;
    const to = c.to === undefined ? null : c.to;
    if (isEmpty(from) && isEmpty(to)) continue;
    if (String(from) === String(to) && !sameNameMove(key, snap)) continue;
    L[key] = { from, to };
  }
  const qty = Number(snap.partQty);
  const partName = snap.partDescription ?? null;
  const W = snap.workerName || null;
  const x = {
    A: entry.userName || null,
    W,
    // Whose clock it is, decided by ACCOUNT, never by name: two staff can share a name.
    // False when the entry recorded no worker account.
    own: snap.workerId != null && snap.workerId === entry.userId,
    P: isEmpty(partName) ? null : String(partName),
    Q: Number.isFinite(qty) && qty > 0 ? qty : null,
    snap,
    raw,
    L,
    lines: [],
    used: new Set()
  };
  x.part = x.P ? strong(x.P) : 'the part';
  // "the work" when the entry never recorded whose it was.
  x.whose = !W ? 'the ' : x.own ? 'their ' : `${W}'s `;
  return x;
}

// Queue a line: `r` orders the headline (lowest first), `k` is the kind it gives the
// entry when it ends up the headline, `m` marks a line fit to be the headline.
function add(x, r, line, k, m = true) {
  x.lines.push({ r, line, k, m });
}
function use(x, ...keys) {
  keys.forEach((k) => x.used.add(k));
}
const has = (x, key) => Object.prototype.hasOwnProperty.call(x.L, key);

// A status change carried inside another action is a line without a person.
function statusDetail(x) {
  use(x, 'status');
  const s = x.L.status;
  if (!s) return;
  const to = label('status', s.to);
  const from = label('status', s.from);
  add(x, 90, plain(from ? ['The job moved from ', from, ' to ', to] : ['The job is now ', to]), null, false);
}

// "Field: new" for a key nobody wrote words for.
function genericLine(key, change) {
  const field = cap(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\s]+/g, ' ').trim().toLowerCase());
  const value = (v) => label(key, v) || 'blank';
  return plain([`${field}: `, strong(value(change.to))], isEmpty(change.from) ? undefined : value(change.from));
}

function sweepLeftovers(x) {
  for (const [key, change] of Object.entries(x.L)) {
    if (!x.used.has(key)) add(x, 50, genericLine(key, change), null, false);
  }
}

// ── Per action ───────────────────────────────────────────────────────────────

const PART_ADDED = /^part .+ added$/;
const PART_REMOVED = /^part .+ removed$/;

function describeCreate(x) {
  const partKeys = Object.keys(x.L).filter((k) => PART_ADDED.test(k));
  const number = x.L.jobNumber?.to;
  use(x, 'jobNumber', 'status', ...partKeys);
  const n = partKeys.length;
  add(x, 0, act(x, number
    ? ['opened job ', strong(number), n ? ` with ${plural(n, 'part', 'parts')}` : '']
    : ['opened the job']), 'job');
  for (const k of partKeys) {
    const part = x.snap.parts?.[k];
    if (part) add(x, 10, plain(partSentence(part)), null, false);
  }
  if (has(x, 'assignees')) add(x, 11, plain(['On the job: ', x.L.assignees.to]), null, false);
  use(x, 'assignees');
  if (isCriticalLevel(x.L.qualityLevel?.to)) add(x, 12, plain(['Quality level: Critical']), null, false);
  use(x, 'qualityLevel');
  const pr = x.L.priority?.to;
  if (!isEmpty(pr) && pr !== 'NONE') add(x, 13, plain(['Priority: ', label('priority', pr)]), null, false);
  use(x, 'priority');
}

function describeUpdate(x) {
  const L = x.L;
  // Old trail entries said Invoiced; the startup rename turned those into Paid – Archived.
  const invoiced = L.status?.to === jobStatuses.closedStatus || (L.archived && truthy(L.archived.to));
  if (invoiced) {
    add(x, 0, act(x, ['marked the job paid and archived it']), 'status');
    use(x, 'status', 'archived', 'invoicedDate');
  }
  // Carried on past unanswered sign-offs — on archiving, or on first reaching billing.
  if (L.inspectionSignOff) {
    const text = String(isEmpty(L.inspectionSignOff.from) ? L.inspectionSignOff.to : L.inspectionSignOff.from);
    const n = Number((/(\d+)/.exec(text) || [])[1]);
    add(x, 91, Number.isFinite(n) && n > 0
      ? plain([`${plural(n, 'run', 'runs')} still had unanswered inspection questions`])
      : genericLine('inspectionSignOff', L.inspectionSignOff), null, false);
    use(x, 'inspectionSignOff');
  }

  // A part change that moves the status (Done -> In Progress) did it as a consequence:
  // the part line leads and the move reads as a plain detail.
  const partChanged = Object.keys(L).some((k) => /^part /.test(k));
  if (L.status && !invoiced && partChanged) {
    statusDetail(x);
  } else if (L.status && !invoiced) {
    const from = label('status', L.status.from);
    add(x, 1, act(x, from
      ? ['moved the job from ', from, ' to ', strong(label('status', L.status.to))]
      : ['set the job status to ', strong(label('status', L.status.to))]), 'status');
    // The first move to Call for Payment records the day the bill went out; the move says it.
    use(x, 'status', 'invoicedDate');
  }
  // A billing move for a customer who needs a PO number, made with none entered.
  if (L.missingPo) {
    add(x, 92, plain(['No PO number was entered — carried on anyway']), null, false);
    use(x, 'missingPo');
  }

  if (L.qualityLevel) {
    const to = L.qualityLevel.to;
    const verb = isCriticalLevel(to) ? 'raised the quality level to ' : isEmpty(to) ? 'set the quality level to ' : 'lowered the quality level to ';
    add(x, 3, act(x, [verb, strong(label('qualityLevel', to) || 'blank')], wasOf(L.qualityLevel, (v) => label('qualityLevel', v))), 'job');
    use(x, 'qualityLevel');
  }
  if (L.priority) {
    const to = L.priority.to;
    add(x, 3, isEmpty(to) || to === 'NONE'
      ? act(x, ['cleared the priority'], wasOf(L.priority, (v) => label('priority', v)))
      : act(x, ['set the priority to ', strong(label('priority', to))], wasOf(L.priority, (v) => label('priority', v))), 'job');
    use(x, 'priority');
  }
  if (L.dueDate) {
    add(x, 3, isEmpty(L.dueDate.to)
      ? act(x, ['removed the due date'], wasOf(L.dueDate, shortDate))
      : act(x, ['set the due date to ', strong(shortDate(L.dueDate.to))], wasOf(L.dueDate, shortDate)), 'job');
    use(x, 'dueDate');
  }
  // The quote reference box is gone, but older entries still record changes to it.
  for (const [key, name] of [['poNumber', 'PO number'], ['quoteReference', 'quote reference']]) {
    if (!L[key]) continue;
    add(x, 3, isEmpty(L[key].to)
      ? act(x, [`removed the ${name}`], wasOf(L[key], String))
      : act(x, [`set the ${name} to `, strong(L[key].to)], wasOf(L[key], String)), 'job');
    use(x, key);
  }
  if (L.description) {
    add(x, 3, isEmpty(L.description.to)
      ? act(x, ['cleared the job description'])
      : act(x, ['changed the job description to “', cut(L.description.to, 80), '”']), 'job');
    use(x, 'description');
  }
  // The Repeat Job tick box is gone (naming the previous job is what makes a repeat
  // now), but older entries still record it.
  if (L.isRepeatJob) {
    add(x, 3, act(x, [truthy(L.isRepeatJob.to) ? 'marked this as a repeat job' : 'marked this as not a repeat job']), 'job');
    use(x, 'isRepeatJob');
  }
  if (L.repeatJobReference) {
    add(x, 3, isEmpty(L.repeatJobReference.to)
      ? act(x, ['removed the previous job'], wasOf(L.repeatJobReference, String))
      : act(x, ['set the previous job to ', strong(L.repeatJobReference.to)], wasOf(L.repeatJobReference, String)), 'job');
    use(x, 'repeatJobReference');
  }
  if (L.jobCardPrinted) { add(x, 3, act(x, ['printed the job card']), 'job'); use(x, 'jobCardPrinted'); }
  if (L.attachmentsPrinted) { add(x, 3, act(x, ["printed the job's attachments"]), 'job'); use(x, 'attachmentsPrinted'); }
  // Events no route records any more (no current key stands for them), so there is nothing to
  // convert them into; stored data, read as-is.
  if (L.jobCardPreviewed) { add(x, 3, act(x, ['opened the job card preview']), 'job'); use(x, 'jobCardPreviewed'); }
  if (L.packetBuilt) { add(x, 3, act(x, ['built a print packet']), 'job'); use(x, 'packetBuilt'); }
  if (L.assignees) {
    add(x, 3, act(x, ["changed who's on the job"]), 'people');
    add(x, 4, plain(['Now on the job: ', L.assignees.to]), null, false);
    use(x, 'assignees');
  }
  if (L.photos) {
    // Stored as "<n> photos" before and after; a count that can't be read stays neutral.
    const n = (v) => Number((/(\d+)/.exec(String(v ?? '')) || [])[1]);
    const before = n(L.photos.from) || 0;
    const after = n(L.photos.to);
    const delta = Number.isFinite(after) ? after - before : 0;
    add(x, 3, act(x, delta > 0 ? [`added ${plural(delta, 'photo', 'photos')} to the job`]
      : delta < 0 ? [`removed ${plural(-delta, 'photo', 'photos')} from the job`]
      : ['changed the job photos']), 'files');
    use(x, 'photos');
  }
  if (L.qaLevelId) { add(x, 3, act(x, ['changed the quality form level']), 'job'); use(x, 'qaLevelId'); }
  if (L.companyId || L.contactId) { add(x, 3, act(x, ['changed the customer on the job']), 'job'); use(x, 'companyId', 'contactId'); }
  if (L.packetSaved) { add(x, 3, act(x, ['saved the job packet as a file']), 'job'); use(x, 'packetSaved'); }

  for (const [key, change] of Object.entries(L)) {
    if (x.used.has(key) || !/^part /.test(key)) continue;
    use(x, key);
    if (PART_ADDED.test(key)) {
      add(x, 2, act(x, x.snap.part ? ['added a part: ', partSentence(x.snap.part)] : ['added a part']), 'job');
    } else if (PART_REMOVED.test(key)) {
      add(x, 2, act(x, ['removed the part ', strong(partNameFor(x.snap.part))]), 'job');
    } else {
      add(x, 2, act(x, ['changed the part ', strong(partNameFor(x.snap.partBefore))]), 'job');
      if (x.snap.part) add(x, 2.5, plain(['Now: ', partSentence(x.snap.part)]), null, false);
      if (x.snap.partBefore) add(x, 2.6, plain(['Was: ', partSentence(x.snap.partBefore)]), null, false);
    }
  }

  // Anything else goes in as a plain "Field: value" line, in key order, and may lead.
  for (const [key, change] of Object.entries(L)) {
    if (!x.used.has(key)) {
      const g = genericLine(key, change);
      const field = g.parts[0].text.replace(/: $/, '').toLowerCase();
      add(x, 3, act(x, [`changed the ${field} to `, g.parts[1]], g.was), 'job');
      use(x, key);
    }
  }
}

// Every assign entry changes exactly one person, recorded in the snapshot as workerName.
// Names are never split or compared here; with none recorded the line stays neutral.
function describeAssign(x, action) {
  use(x, 'assignees');
  const who = x.W ? strong(x.W) : null;
  let line;
  if (action === 'self_assign') line = act(x, ['put themselves on the job']);
  else if (action === 'self_unassign') line = act(x, ['took themselves off the job']);
  else if (action === 'assign' && who) line = act(x, ['put ', who, ' on the job']);
  else if (action === 'unassign' && who) line = act(x, ['took ', who, ' off the job']);
  else line = act(x, ["changed who's on the job"]);
  add(x, 0, line, 'people');
}

// The run-field lines shared by add/update/confirm. `times` also reports start/finish
// time and part/worker moves (only an edit of an existing run has those).
function runFieldLines(x, { times }) {
  const L = x.L;
  const P = x.part;
  const Q = x.Q;

  if (times && L.endTime && isEmpty(L.endTime.to)) {
    add(x, 0, act(x, ['reopened ', x.whose, 'clock on ', P]), 'work');
    use(x, 'endTime');
  }
  if (times && L.item) {
    const sameItem = String(L.item.from) === String(L.item.to);
    add(x, 1, act(x, sameItem
      ? ['moved ', x.whose, 'work from ', strong(L.item.from), ' to the other part called ', strong(L.item.to)]
      : ['moved ', x.whose, 'work from ', strong(L.item.from || 'no part'), ' to ', strong(L.item.to || 'no part')]), 'work');
    use(x, 'item');
  }
  if (times && L.worker) {
    if (String(L.worker.from) === String(L.worker.to)) {
      add(x, 2, act(x, ['credited the work on ', P, ' to the other ', strong(L.worker.to)]), 'work');
    } else {
      add(x, 2, act(x, ['credited the work on ', P, ' to ', strong(L.worker.to || 'nobody')], wasOf(L.worker, String)), 'work');
    }
    use(x, 'worker');
  }
  if (times) {
    for (const [key, word] of [['startTime', 'start'], ['endTime', 'finish']]) {
      if (!L[key] || x.used.has(key)) continue;
      add(x, 3, act(x, [`changed the ${word} time of `, x.whose, 'work on ', P, ' to ', strong(dayTime(L[key].to))], wasOf(L[key], dayTime)), 'work');
      use(x, key);
    }
  }
  if (L.qty) {
    const n = Number(L.qty.to);
    if (isEmpty(L.qty.to)) add(x, 4, act(x, ['cleared the done count on ', P], wasOf(L.qty, String)), 'work');
    else if (x.P) add(x, 4, act(x, ['recorded ', strong(Q ? `${n} of ${Q}` : n), ' ', strong(x.P), ' as done'], wasOf(L.qty, String)), 'work');
    else add(x, 4, act(x, ['recorded ', strong(Q ? `${n} of ${Q}` : n), Q ? ' as done' : ' done'], wasOf(L.qty, String)), 'work');
    use(x, 'qty');
  }
  if (L.scrapBin || L.scrapRecycle) {
    const bin = Number(L.scrapBin ? L.scrapBin.to : x.raw.scrapBin?.to) || 0;
    const rec = Number(L.scrapRecycle ? L.scrapRecycle.to : x.raw.scrapRecycle?.to) || 0;
    const of = (n) => strong(Q ? `${n} of ${Q}` : n);
    if (L.scrapBin && L.scrapRecycle) {
      add(x, 5, act(x, ['scrapped ', of(bin + rec), x.P ? [' ', P] : '', `: ${bin} to the bin, ${rec} to recycling`]), 'quality');
    } else {
      for (const [key, c, n, where, cleared] of [
        ['scrapBin', L.scrapBin, bin, 'to the bin', 'bin'],
        ['scrapRecycle', L.scrapRecycle, rec, 'to recycling', 'recycling']
      ]) {
        if (!c) continue;
        add(x, 5, n === 0
          ? act(x, [`cleared the ${cleared} scrap on `, P], wasOf(c, String))
          : act(x, ['scrapped ', of(n), x.P ? [' ', P] : '', ` ${where}`], wasOf(c, String)), 'quality');
      }
    }
    use(x, 'scrapBin', 'scrapRecycle');
  }
  const INSPECTIONS = {
    firstOffInspection: 'first-off inspection',
    inProcessValidation: 'in-process validation',
    measuringEquipmentVerification: 'measuring equipment verification',
    equipmentChecks: 'equipment checks'
  };
  for (const [key, name] of Object.entries(INSPECTIONS)) {
    const c = L[key];
    if (!c) continue;
    let line;
    if (truthy(c.to)) line = act(x, [`ticked the ${name} on `, P]);
    else if (falsy(c.to)) line = act(x, [`answered No to the ${name} on `, P]);
    else line = act(x, [`cleared the ${name} answer on `, P]);
    add(x, 6, line, 'quality');
    use(x, key);
  }
  if (L.machineNumber) {
    add(x, 7, isEmpty(L.machineNumber.to)
      ? act(x, ['cleared the machines for ', P], wasOf(L.machineNumber, String))
      : act(x, ['set the machines for ', P, ' to ', strong(L.machineNumber.to)], wasOf(L.machineNumber, String)), 'work');
    use(x, 'machineNumber');
  }
  if (L.description) {
    add(x, 8, isEmpty(L.description.to)
      ? act(x, ['cleared the note on ', x.whose, 'work on ', P])
      : act(x, ['wrote on ', x.whose, 'work on ', P, ': “', cut(L.description.to, 80), '”']), 'work');
    use(x, 'description');
  }
  if (L.equipmentChecksComments) {
    add(x, 9, isEmpty(L.equipmentChecksComments.to)
      ? act(x, ['cleared the note on the equipment checks for ', P])
      : act(x, ['noted on the equipment checks for ', P, ': “', cut(L.equipmentChecksComments.to, 80), '”']), 'quality');
    use(x, 'equipmentChecksComments');
  }
  if (times && L.finish) {
    add(x, 10, act(x, ['confirmed ', x.whose, 'finish time on ', P]), 'work');
    use(x, 'finish');
  }
}

function describeStartTimer(x) {
  const worker = x.L.worker?.to || x.W;
  add(x, 0, x.L.worker
    ? act(x, ['started a clock for ', strong(worker), ' on ', x.part])
    : act(x, ['started work on ', x.part]), 'work');
  use(x, 'worker', 'item', 'timer', 'startTime');
  statusDetail(x);
}

function describeStopTimer(x) {
  const dur = duration(x.snap.startTime, x.L.endTime?.to);
  const tail = dur ? ` (${dur})` : '';
  if (!x.W) {
    // The entry never recorded whose clock it was, so it is left unnamed rather than
    // credited to the person who pressed stop.
    if (x.P) add(x, 0, act(x, ['stopped a clock on ', strong(x.P), tail]), 'work');
    else add(x, 0, act(x, ['stopped a clock', tail]), 'work');
  } else if (!x.P) add(x, 0, act(x, [x.own ? 'stopped their clock' : ['stopped ', strong(`${x.W}'s`), ' clock'], tail]), 'work');
  else if (x.own) add(x, 0, act(x, ['finished work on ', strong(x.P), tail]), 'work');
  else add(x, 0, act(x, ['stopped ', strong(`${x.W}'s`), ' clock on ', strong(x.P), tail]), 'work');
  use(x, 'endTime');
  statusDetail(x);
}

function describeAddTimeEntry(x) {
  const start = x.L.startTime?.to;
  const end = x.L.endTime?.to;
  const worker = x.W;
  const onPart = x.P ? [' on ', strong(x.P)] : [];
  // Their own time is worded "their", never the actor's name twice; another worker's is
  // named; an unknown worker is left unnamed.
  const forWhom = x.own ? '' : worker ? [' for ', strong(worker)] : '';
  if (end && start) {
    const dur = duration(start, end);
    add(x, 0, act(x, ['added ', strong(dur), x.own ? ' of their work' : ' of work', forWhom, onPart, ` (${dayMonth(start)})`]), 'work');
  } else {
    add(x, 0, act(x, [x.own ? 'started their own open clock' : 'started an open clock', forWhom, onPart]), 'work');
  }
  use(x, 'worker', 'item', 'startTime', 'endTime');
  runFieldLines(x, { times: false });
  statusDetail(x);
}

function describeUpdateTimeEntry(x) {
  runFieldLines(x, { times: true });
  statusDetail(x);
}

function describeConfirmFinish(x) {
  // Whose finish it was: the worker themselves, a named other worker, or not known
  // (never credited to the person who confirmed).
  const own = x.own;
  if (x.L.endTime) {
    const at = strong(clock(x.L.endTime.to));
    const line = !x.W
      ? ['confirmed the real finish on ', x.part, ' was ', at]
      : [own ? 'confirmed they really finished work on ' : ['confirmed ', strong(x.W), ' really finished work on '], x.part, ' at ', at];
    add(x, 0, act(x, line, wasOf(x.L.endTime, clock)), 'work');
  } else if (x.L.finish) {
    const line = !x.W
      ? ['confirmed the clock on ', x.part, ' stopped at the right time']
      : [own ? 'confirmed their clock on ' : ['confirmed ', strong(`${x.W}'s`), ' clock on '], x.part, ' stopped at the right time'];
    add(x, 0, act(x, line), 'work');
  }
  use(x, 'endTime', 'finish', 'reportedBy');
  if (x.L.criticalSignOff) {
    add(x, 91, plain(['The critical sign-off was carried by the later run']), null, false);
    use(x, 'criticalSignOff');
  }
  if (x.L.description) {
    add(x, 92, plain(['Note on the work: “', cut(x.L.description.to || '', 80), '”']), null, false);
    use(x, 'description');
  }
  statusDetail(x);
}

function describeDeleteTimeEntry(x) {
  const L = x.L;
  const W = x.W || null;
  const dur = duration(L.startTime?.from, L.endTime?.from);
  const who = !W ? 'the ' : x.own ? 'their ' : [strong(W), "'s "];
  add(x, 0, act(x, ['removed ', who, dur ? `${dur} of work` : 'work', ' on ', x.part]), 'alert');
  use(x, 'timeEntryId', 'worker', 'item', 'startTime', 'endTime');
  const had = (text) => plain([`It had ${text}`]);
  const q = L.qty && !isEmpty(L.qty.from) ? L.qty.from : null;
  if (q !== null) add(x, 10, had(`${q} done`), null, false);
  if (L.scrapBin) add(x, 11, had(`${L.scrapBin.from} scrapped to the bin`), null, false);
  if (L.scrapRecycle) add(x, 12, had(`${L.scrapRecycle.from} scrapped to recycling`), null, false);
  const names = {
    firstOffInspection: 'first-off inspection', inProcessValidation: 'in-process validation',
    measuringEquipmentVerification: 'measuring equipment verification', equipmentChecks: 'equipment checks'
  };
  for (const [key, name] of Object.entries(names)) {
    if (L[key]) add(x, 13, had(`the ${name} answered ${truthy(L[key].from) ? 'Yes' : falsy(L[key].from) ? 'No' : sayWord(L[key].from)}`), null, false);
  }
  if (L.machineNumber) add(x, 14, had(`the machines ${L.machineNumber.from}`), null, false);
  if (L.description) add(x, 15, had(`the note “${cut(L.description.from, 80)}”`), null, false);
  if (L.equipmentChecksComments) add(x, 16, had(`an equipment checks note “${cut(L.equipmentChecksComments.from, 80)}”`), null, false);
  use(x, 'qty', 'scrapBin', 'scrapRecycle', 'machineNumber', 'description', 'equipmentChecksComments', ...Object.keys(names));
  statusDetail(x);
}

function describeAutoStop(x) {
  const midnight = /midnight/i.test(String(x.L.timer?.to || ''));
  // Only the worker named on the entry; the entry is never credited to whoever acted.
  const who = x.W;
  const owner = who ? `${who}'s` : 'The';
  const part = x.part;
  add(x, 0, plain(midnight
    ? [`${owner} clock on `, part, " stopped by itself at midnight. The finish time isn't known yet"]
    : [`${owner} clock on `, part, ` stopped by itself at the end of normal hours. ${who || 'The worker'} still needs to confirm the real finish time`]), 'alert');
  use(x, 'timer');
  statusDetail(x);
}

function describeDiscard(x) {
  // The clock is the worker's; whoever pressed Stop may be someone else, so an entry
  // that does not name the worker leaves it unnamed.
  const who = x.W;
  const owner = who ? `${who}'s` : 'The';
  add(x, 0, plain([`${owner} clock on `, x.part, ' was thrown away after under 15 seconds, so no time was kept']), 'alert');
  use(x, 'timer');
  if (x.L.assignees) {
    // The only person a discard ever takes off the job is the worker whose clock it was.
    add(x, 10, plain([who || 'The worker', ' was taken back off the job']), null, false);
    use(x, 'assignees');
  }
  statusDetail(x);
}

const COSTING_LABELS = {
  labourHoursOverride: 'Normal hours', labourRate: 'Base rate', labourTotal: 'Normal labour total',
  labourOt1Override: 'Overtime hours (first rate)', labourOt1MultiplierOverride: 'Overtime multiplier (first rate)',
  labourOt1Total: 'Overtime total (first rate)',
  labourOt2Override: 'Overtime hours (second rate)', labourOt2MultiplierOverride: 'Overtime multiplier (second rate)',
  labourOt2Total: 'Overtime total (second rate)',
  labourHolidayOverride: 'Public holiday hours', labourHolidayTotal: 'Public holiday total',
  labourSpecialHours: 'Special labour hours', labourSpecialRate: 'Special labour rate',
  labourSpecialDescription: 'Special labour description',
  materialsCost: 'Materials cost', materialsProfitPercent: 'Materials margin', materialsDescription: 'Materials description',
  subcontractorCost: 'Subcontractor cost', subcontractorProfitPercent: 'Subcontractor margin',
  subcontractorDescription: 'Subcontractor description',
  grandTotal: 'Job total'
};

function costingValue(key, v) {
  if (isEmpty(v)) return 'blank';
  if (/MultiplierOverride$/.test(key)) return v === 'standard' ? 'standard' : `×${v}`;
  if (/Override$/.test(key)) return v === 'auto' ? 'worked out from logged time' : `${v} hrs`;
  if (key === 'labourSpecialHours') return `${v} hrs`;
  if (/Rate$/.test(key)) return `${formatMoney(v)} / hr`;
  if (/(Total|Cost)$/.test(key)) return formatMoney(v);
  if (/ProfitPercent$/.test(key)) return `${v}%`;
  if (/Description$/.test(key)) return v === '—' ? 'blank' : `“${cut(v, 80)}”`;
  return String(v);
}

function describeCosting(x) {
  const fmt = (key) => (v) => (key === 'grandTotal' ? formatMoney(v) : costingValue(key, v));
  const gt = x.L.grandTotal;
  if (gt) {
    add(x, 0, act(x, ['changed the pricing: job total now ', strong(formatMoney(gt.to))], formatMoney(gt.from)), 'price');
    use(x, 'grandTotal');
  } else {
    add(x, 0, act(x, ['changed the pricing']), 'price');
  }
  for (const [key, change] of Object.entries(x.L)) {
    if (x.used.has(key)) continue;
    const name = COSTING_LABELS[key] || genericLine(key, change).parts[0].text.replace(/: $/, '');
    add(x, 10, plain([`${name}: `, strong(fmt(key)(change.to))], wasOf(change, fmt(key))), null, false);
    use(x, key);
  }
}

// Where a file sits when no part name is on the entry: a part that has since gone is
// still "a part"; only an entry with no part id at all is the job itself.
function unnamedPartOrJob(x, noPart) {
  return isEmpty(x.snap.itemId) ? noPart : 'a part';
}

function movedTo(x) {
  const toPart = x.raw.part?.to;
  if (!isEmpty(toPart)) return unquote(toPart);
  return unnamedPartOrJob(x, 'the whole job');
}

function describeFiles(x, action) {
  const dest = x.snap.destination;
  const where = dest ? [' · ', dest] : [];
  if (action === 'upload_file') {
    add(x, 0, act(x, ['added ', strong(x.L.file?.to || 'a file'), ' to ', strong(x.snap.partDescription || unnamedPartOrJob(x, 'the job')), where]), 'files');
    use(x, 'file');
  } else if (action === 'reassign_file') {
    // A move keeps the file's name, so `file` is usually dropped as "no change" — read it raw.
    // The same goes for `part`: two parts with one description (or none) read as "no
    // change" in `L`, so the destination comes from the raw change, and "the whole job"
    // only from a move that really named no part (no itemId in the snapshot).
    add(x, 0, act(x, ['moved ', strong(x.raw.file?.to || 'a file'), ' to ', strong(movedTo(x)), where]), 'files');
    use(x, 'file', 'part');
  } else {
    add(x, 0, act(x, ['deleted the file ', strong(x.L.file?.from || 'a file')]), 'alert');
    if (dest) add(x, 10, plain([dest]), null, false);
    use(x, 'file');
  }
}

function describeNote(x, action) {
  if (action === 'add_note') {
    add(x, 0, plain([x.A ? `${x.A}: ` : '', '“', cut(x.L.note?.to || '', 160), '”']), 'comment');
    use(x, 'note');
    if (x.L.mentioned) {
      add(x, 10, plain(['Mentioned ', x.L.mentioned.to]), null, false);
      use(x, 'mentioned');
    }
  } else {
    add(x, 0, act(x, ['deleted a comment by ', strong(x.L['note author']?.from || 'someone')]), 'alert');
    if (x.L.note) add(x, 10, plain(['“', cut(x.L.note.from, 160), '”']), null, false);
    use(x, 'note', 'note author');
  }
}

// ── The one entry point ──────────────────────────────────────────────────────

export function describeEntry(entry) {
  const x = readEntry(entry || {});
  const action = entry?.action;
  let kind = 'job';

  switch (action) {
    case 'create': describeCreate(x); break;
    case 'update': describeUpdate(x); break;
    case 'unarchive':
      add(x, 0, act(x, ['brought the job back from the archive']), 'status');
      if (x.L.status) add(x, 10, plain(['The job is now ', label('status', x.L.status.to)]), null, false);
      use(x, 'status', 'archived', 'invoicedDate');
      break;
    case 'delete': add(x, 0, act(x, ['deleted the job']), 'alert'); break;
    case 'assign': case 'unassign': case 'self_assign': case 'self_unassign': describeAssign(x, action); break;
    case 'start_timer': describeStartTimer(x); break;
    case 'stop_timer': describeStopTimer(x); break;
    case 'add_time_entry': describeAddTimeEntry(x); break;
    case 'update_time_entry': describeUpdateTimeEntry(x); break;
    case 'confirm_finish': describeConfirmFinish(x); break;
    case 'delete_time_entry': describeDeleteTimeEntry(x); break;
    case 'auto_stop_timer': describeAutoStop(x); break;
    case 'discard_timer': describeDiscard(x); break;
    case 'update_costing': describeCosting(x); break;
    case 'upload_file': case 'reassign_file': case 'delete_file': describeFiles(x, action); break;
    case 'add_note': case 'delete_note': describeNote(x, action); break;
    default: break;
  }

  sweepLeftovers(x);
  const sorted = x.lines.map((l, i) => ({ ...l, i })).sort((a, b) => a.r - b.r || a.i - b.i);
  if (!sorted.length || !sorted[0].m) {
    sorted.unshift({ r: -1, line: act(x, ['made a change']), k: 'job', m: true });
  }
  kind = sorted[0].k || 'job';
  const [head, ...rest] = sorted;
  // Under the headline the person is already named, so a detail drops the name and
  // starts with the verb ("Set the due date to …").
  const bare = ({ line }) => {
    if (!line.led) return line;
    const parts = line.parts.slice(1);
    if (parts[0]) parts[0] = { ...parts[0], text: cap(parts[0].text) };
    return { parts, ...(line.was ? { was: line.was } : {}) };
  };
  const tidy = ({ led, ...line }) => line;
  return {
    kind,
    ring: kind === 'alert',
    headline: tidy(head.line),
    details: rest.map((l) => tidy(bare(l)))
  };
}
