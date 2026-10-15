// The job trail's stored shapes, in one pure place: no database, no logger, no requires.
// Two jobs live here, both working on ONE history row at a time:
//
//   readTrailEntry    - what every History read does with a row's two JSON columns.
//   convertTrailEntry - the once-only startup conversion of an old-shaped job entry into
//                       the current shape (see convertHistoryTrails in legacyMigrations.js,
//                       which only selects the rows and writes the results back).
//
// Being pure, both are tested without a database (server/test/trailEntries.test.js and
// client/test/trailConversion.test.js).

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Parses one JSON column. NULL, empty and the literal text 'null' (recordHistory stringifies
// whatever it is given, so an entry with no snapshot stored 'null') all read as null.
// Damaged JSON throws, for the caller to turn into "undefined".
function parseColumn(text) {
  if (text == null || text === '') return null;
  return JSON.parse(text);
}

// → { changes, snapshot } (each the parsed value, or null), or undefined when either
// column's JSON is damaged. A damaged row is skipped by the caller, never failed on.
function readTrailEntry(row) {
  try {
    return { changes: parseColumn(row.changes), snapshot: parseColumn(row.snapshot) };
  } catch {
    return undefined;
  }
}

// ── the exact name an old assign / unassign entry added or removed ─────────────

// The one name an old assign/unassign entry added or removed, read back from its stored
// from/to lists (the joined text assigneeNames wrote). The longer list is the shorter one
// with a single name inserted at a list boundary (the start, the end, or between two
// ', ' separators); 'none' is the empty list. The answer is returned only when EVERY
// way of reading it gives the same text (so two staff both called Ben give 'Ben', and
// 'Smith, John' taken off 'Ann, Smith, John' is the only suffix); otherwise null and
// the entry stays as it was. No splitting into people is ever relied on: a ', ' inside a
// name only adds more candidate boundaries, which can only make the answer ambiguous.
function soleInsertedName(shortText, longText) {
  const shorter = String(shortText ?? '');
  const longer = String(longText ?? '');
  const SEP = ', ';
  if (!longer || longer === 'none') return null;
  if (shorter === '' || shorter === 'none') return longer;
  const found = new Set();
  if (longer.length > shorter.length + SEP.length) {
    if (longer.endsWith(SEP + shorter)) found.add(longer.slice(0, longer.length - shorter.length - SEP.length));
    if (longer.startsWith(shorter + SEP)) found.add(longer.slice(shorter.length + SEP.length));
    for (let p = shorter.indexOf(SEP); p !== -1; p = shorter.indexOf(SEP, p + 1)) {
      const pre = shorter.slice(0, p);
      const post = shorter.slice(p + SEP.length);
      const inner = longer.length - pre.length - post.length - 2 * SEP.length;
      if (inner < 1) continue;
      if (longer === pre + SEP + longer.slice(pre.length + SEP.length, pre.length + SEP.length + inner) + SEP + post) {
        found.add(longer.slice(pre.length + SEP.length, pre.length + SEP.length + inner));
      }
    }
  }
  found.delete('');
  return found.size === 1 ? [...found][0] : null;
}

// For an old trail entry: the added name (assign) or removed name (unassign) when it is
// exact, else null.
function assignedNameFromChange(action, from, to) {
  return action === 'assign' ? soleInsertedName(from, to) : soleInsertedName(to, from);
}

// ── conversion 3's helper ──────────────────────────────────────────────────────

// Part add/remove/edit trail entries used to keep only the one-line summary
// ("2x Plate <Repair> (Mild steel) [Anodise→Acme]"), which the job History window had to
// pick apart again. New entries carry the part as plain fields in their snapshot
// (`part`, `partBefore` for an edit, `parts` keyed by change name for a job's creation).
// For older entries the summary can't be split reliably, so the part becomes just its
// leading quantity and the rest of the summary verbatim as the description. Existing
// snapshot keys are kept; an entry that already has the fields is left alone.
function legacyPartFromSummary(text) {
  const m = /^(\d*)x ([\s\S]*)$/.exec(String(text ?? ''));
  return m ? { qty: m[1], description: m[2].trim() } : { qty: '', description: String(text ?? '') };
}

// ── the seven conversions, each on one entry ({ action, userId, userName, changes, snap }) ──
// Each returns true when it changed the entry in place (`changes` / `snap` are replaced on
// the object it is handed). They run in the order below, from convertTrailEntry.

// 1. Before the Save button went away, the whole-job Save wrote part changes under keys
// starting "item": `item #3 added` (a job's creation, numbered), and `item <description>
// added` / `item <description>` / `item <description> removed` (later edits). Every reader
// now only knows the `part …` keys, so the old ones are renamed here (a numbered one loses
// its "#"), which lets the fold (3) fill their part. A row that already holds the
// renamed key keeps both as they are. Runs before the fold; idempotent (nothing starts
// "item " afterwards).
function renameItemKeys(e) {
  if (e.action !== 'create' && e.action !== 'update') return false;
  if (!isObject(e.changes)) return false;
  const next = {};
  let touched = false;
  for (const [key, value] of Object.entries(e.changes)) {
    if (!/^item /.test(key)) { next[key] = value; continue; }
    const numbered = /^item #(\d+)((?: added| removed)?)$/.exec(key);
    const target = numbered ? `part ${numbered[1]}${numbered[2]}` : `part ${key.slice(5)}`;
    if (target in e.changes || target in next) { next[key] = value; continue; }
    next[target] = value;
    touched = true;
  }
  if (touched) e.changes = next;
  return touched;
}

// 2. Before the Save button went away, one whole-job Save could write several part changes
// into ONE update entry, while the job History window (like every live route, which
// writes one part per entry) reads a single part from an entry's snapshot. Such an entry
// is split here into one entry per part change: the original keeps its first part key and
// every non-part key, each further part key becomes a new entry copying the original's
// job, action, person and moment. Every resulting snapshot loses `part` / `partBefore` so
// the fold (3) rebuilds each from its own change (this also repairs an entry the
// fold had already filled from the first part only). Runs after the key rename and before
// the fold; idempotent (afterwards no update entry holds more than one part key).
// Returns the extra entries ([] when nothing was split).
function splitMultiPart(e) {
  if (e.action !== 'update' || !isObject(e.changes)) return null;
  if (e.snap !== null && !isObject(e.snap)) return null;
  const partKeys = Object.keys(e.changes).filter((k) => /^part /.test(k));
  if (partKeys.length < 2) return null;
  const { part, partBefore, ...rest } = e.snap || {};
  const restSnap = Object.keys(rest).length ? rest : null;
  const kept = {};
  for (const [key, value] of Object.entries(e.changes)) {
    if (!/^part /.test(key) || key === partKeys[0]) kept[key] = value;
  }
  const extras = partKeys.slice(1).map((key) => ({
    action: e.action, userId: e.userId, userName: e.userName,
    changes: { [key]: e.changes[key] }, snap: restSnap ? { ...restSnap } : null
  }));
  e.changes = kept;
  e.snap = restSnap;
  return extras;
}

// 3. Fills the part into a part entry's snapshot from the one-line summary its change kept
// (see legacyPartFromSummary).
function foldPartSnapshot(e) {
  if (e.action !== 'create' && e.action !== 'update') return false;
  if (!isObject(e.changes)) return false;
  if (e.snap !== null && !isObject(e.snap)) return false;
  // Already carries its part(s): nothing to fill.
  if (e.snap && (e.snap.part != null || e.snap.parts != null)) return false;
  const next = { ...(e.snap || {}) };
  const keys = Object.keys(e.changes).filter((k) => /^part /.test(k));
  if (keys.length === 0) return false;
  let touched = false;
  if (e.action === 'create') {
    const parts = {};
    for (const k of keys.filter((key) => / added$/.test(key))) {
      const c = e.changes[k];
      if (c && c.to != null) parts[k] = legacyPartFromSummary(c.to);
    }
    if (Object.keys(parts).length) { next.parts = parts; touched = true; }
  } else {
    const key = keys[0];
    const c = e.changes[key];
    if (!c || typeof c !== 'object') return false;
    if (/ removed$/.test(key)) {
      if (c.from != null) { next.part = legacyPartFromSummary(c.from); touched = true; }
    } else if (/ added$/.test(key)) {
      if (c.to != null) { next.part = legacyPartFromSummary(c.to); touched = true; }
    } else {
      if (c.to != null) { next.part = legacyPartFromSummary(c.to); touched = true; }
      if (c.from != null) { next.partBefore = legacyPartFromSummary(c.from); touched = true; }
    }
  }
  if (touched) e.snap = next;
  return touched;
}

// 4. Start, manual-add, edit and delete entries for a time block recorded the part only as an
// `item` change (its description at that moment), before the snapshot carried it. That
// change is exactly what the entry recorded, so it is copied into the snapshot's
// partDescription: the start/add/edit's new part (`to`), the delete's removed part (`from`).
// Nothing is looked up, so nothing is guessed; an entry that recorded no part is left alone.
function fillTimeBlockPartName(e) {
  if (!['start_timer', 'add_time_entry', 'update_time_entry', 'delete_time_entry'].includes(e.action)) return false;
  if (e.snap !== null && !isObject(e.snap)) return false;
  if (e.snap && e.snap.partDescription != null) return false;
  const item = isObject(e.changes) ? e.changes.item : null;
  if (!item || typeof item !== 'object') return false;
  const name = e.action === 'delete_time_entry' ? item.from : item.to;
  if (typeof name !== 'string' || !name.trim()) return false;
  e.snap = { ...(e.snap || {}), partDescription: name };
  return true;
}

// 5. Manual-add and delete entries for a time block named the worker only as a `worker` change
// (the add's new worker `to`, the delete's removed worker `from`), before the snapshot carried
// workerName. That change is exactly what the entry recorded, so it is copied into the
// snapshot's workerName. workerId can't be known and is not filled. An entry that already
// carries workerName, or recorded no worker name, is left alone.
function fillTimeBlockWorkerName(e) {
  if (e.action !== 'add_time_entry' && e.action !== 'delete_time_entry') return false;
  if (e.snap !== null && !isObject(e.snap)) return false;
  if (e.snap && e.snap.workerName) return false;
  const worker = isObject(e.changes) ? e.changes.worker : null;
  if (!worker || typeof worker !== 'object') return false;
  const name = e.action === 'delete_time_entry' ? worker.from : worker.to;
  if (typeof name !== 'string' || !name.trim()) return false;
  e.snap = { ...(e.snap || {}), workerName: name };
  return true;
}

// 6. An auto-stop entry is written under the worker's own account (the clock stops itself in
// its owner's name), so the entry's own user id and name ARE the worker: exact, nothing
// traced. Older ones did not carry the worker in the snapshot. Every other old clock entry
// that never recorded its worker is left as it is; the History window words those neutrally
// ("stopped a clock"), because whose clock it was can only be guessed. An entry whose
// snapshot column is NULL (not even the text 'null') is left alone.
function fillAutoStopWorker(e, hadSnapshotColumn) {
  if (e.action !== 'auto_stop_timer' || !hadSnapshotColumn) return false;
  if (e.snap !== null && !isObject(e.snap)) return false;
  if (e.snap && e.snap.workerName != null && e.snap.workerId != null) return false;
  const name = typeof e.userName === 'string' ? e.userName.trim() : '';
  if (!name || !e.userId) return false;
  e.snap = { ...(e.snap || {}), workerId: e.userId, workerName: name };
  return true;
}

// 7. An assign / unassign entry changes exactly one person, and the History window now names
// that person from the entry's snapshot (`workerName`). Older entries only hold the joined
// assignee lists, so the name is read back from them, but ONLY when that is exact: the
// longer list must be the shorter with one name inserted at a list boundary in a single
// way, or in several ways that all give the same text (see assignedNameFromChange). Any
// other entry is left alone and reads "changed who's on the job". workerId can't be known
// and is not filled. An entry that already carries workerName is skipped. Self-assign and
// self-unassign entries are not filled: nothing ever displays a name there.
function fillAssignWorkerName(e) {
  if (e.action !== 'assign' && e.action !== 'unassign') return false;
  if (e.snap !== null && !isObject(e.snap)) return false;
  if (e.snap && e.snap.workerName) return false;
  const c = isObject(e.changes) ? e.changes.assignees : null;
  if (!c || typeof c !== 'object') return false;
  const name = assignedNameFromChange(e.action, c.from, c.to);
  if (!name) return false;
  e.snap = { ...(e.snap || {}), workerName: name };
  return true;
}

// Converts one job entry from its old shape. `row` is a history row as stored:
// { action, user_id, user_name, changes, snapshot } with the two JSON columns as text.
// → undefined when the row is damaged or nothing needs to change (so a converted row
// converts to undefined: idempotent by construction); otherwise
// { changes, snapshot, extras } - the row's new changes/snapshot (objects, or null) and
// `extras`, the { changes, snapshot } of each additional entry a multi-part split produces
// (the caller inserts them with the original's job, action, person and moment).
function convertTrailEntry(row) {
  const read = readTrailEntry(row);
  if (read === undefined) return undefined;
  const e = {
    action: row.action, userId: row.user_id, userName: row.user_name,
    changes: read.changes, snap: read.snapshot
  };

  let dirty = renameItemKeys(e);
  const extraEntries = splitMultiPart(e) || [];
  if (extraEntries.length) dirty = true;
  for (const entry of [e, ...extraEntries]) {
    if (foldPartSnapshot(entry)) dirty = true;
  }
  if (fillTimeBlockPartName(e)) dirty = true;
  if (fillTimeBlockWorkerName(e)) dirty = true;
  if (fillAutoStopWorker(e, row.snapshot != null)) dirty = true;
  if (fillAssignWorkerName(e)) dirty = true;

  if (!dirty) return undefined;
  return {
    changes: e.changes,
    snapshot: e.snap,
    extras: extraEntries.map((x) => ({ changes: x.changes, snapshot: x.snap }))
  };
}

module.exports = { readTrailEntry, convertTrailEntry };
