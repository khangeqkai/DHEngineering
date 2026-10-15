// The first word of a name that has several ("Sam" for "Sam Smith"); null for a one-word
// name. The one rule for the second thing a person answers to after @.
function firstWordOf(name) {
  const words = (name || '').trim().split(/\s+/);
  return words.length > 1 ? words[0] : null;
}

// What one person answers to: their whole name and, if it has several words, the first.
function nameVariants(name) {
  const first = firstWordOf(name);
  return first ? [name, first] : [name];
}

// Who answers to which @name, built once from the staff list. `byName` maps the lower-cased
// name to { display, full, first }: `full` are the people whose whole name it is, `first` the
// people whose first word it is, and `display` the spelling used for highlighting. `names`
// are those display spellings. Two staff whose names differ only by capitals sit in the same
// entry and are told apart by the person picked from the @ list.
function buildNameLookup(people) {
  const byName = new Map();
  const entryFor = (name) => {
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { display: name, full: [], first: [] });
    return byName.get(key);
  };
  for (const person of people || []) {
    const name = displayNameOf(person);
    if (!name) continue;
    const whole = entryFor(name);
    // A whole name is the better spelling to show than a first word that got there first.
    if (whole.full.length === 0) whole.display = name;
    whole.full.push(person);
    const first = firstWordOf(name);
    if (first) entryFor(first).first.push(person);
  }
  // Built longest-first once here; findMentionSpans recognises the list and does not redo it.
  const names = sortedNames([...byName.values()].map(e => e.display));
  sortedCache.set(names, names);
  return { byName, names };
}

// Who the @names in a comment mean. A name belongs to the people whose WHOLE name it is,
// and only if there are none, to the people whose first name it is. One person: them.
// Several: the one picked from the @ list (`picks`: [{ userId, name }], counted only for a
// name still in the text), else the name is unclear. The writer (`writerId`) is never a
// match, but the lookup still holds their name, so "@Sam Jones" written by Sam Jones is
// read whole and asks nobody instead of shrinking to "@Sam" and asking another Sam; a name
// that, without the writer, fits nobody asks nobody, and one that fits one other person
// asks them. Returns { people, unclear } — the people to ask (no repeats) and the display
// spellings of the unclear names.
function resolveMentions(text, lookup, picks = [], writerId = null) {
  const people = [];
  const unclear = [];
  const notWriter = (list) => list.filter(u => u.id !== writerId);
  for (const span of findMentionSpans(text, lookup.names)) {
    const key = span.name.toLowerCase();
    const entry = lookup.byName.get(key);
    const full = notWriter(entry.full);
    const candidates = full.length > 0 ? full : notWriter(entry.first);
    // A name that only the writer answers to: a self-mention, dropped quietly.
    if (candidates.length === 0) continue;
    let chosen = null;
    if (candidates.length === 1) chosen = candidates[0];
    else {
      const pick = picks.find(p => p.name.toLowerCase() === key && candidates.some(u => u.id === p.userId));
      if (pick) chosen = candidates.find(u => u.id === pick.userId);
    }
    if (chosen) {
      if (!people.some(p => p.id === chosen.id)) people.push(chosen);
    } else if (!unclear.includes(entry.display)) unclear.push(entry.display);
  }
  return { people, unclear };
}

// The people a thread's comments mention, in the shape buildNameLookup takes, so a lookup
// built from the staff list plus these still reads an archived person's name whole. Anyone
// already in `staff` (by id) is left out, so nobody is counted twice.
function mentionedPeople(notes, staff = []) {
  const seen = new Set((staff || []).map(u => u.id));
  const out = [];
  for (const note of notes || []) {
    for (const m of note.mentions || []) {
      if (!m.name || seen.has(m.userId)) continue;
      seen.add(m.userId);
      out.push({ id: m.userId, name: m.name });
    }
  }
  return out;
}

// Which @names in one comment are the people it stored as mentioned, as a Map from the
// lower-cased name to the stored mention. A whole name always counts. A first word counts
// only when sending would have read it as that person: nobody's whole name is that word
// (the writer's own aside) and, the writer aside, they are the only one with that first name
// in the lookup. Otherwise a plain "@Sam" that was unclear (and so asked nobody) would be
// coloured as whichever Sam was mentioned by full name. `writerName` is the comment's author.
function storedMentionsByName(lookup, mentions, writerName = '') {
  const writer = (writerName || '').toLowerCase();
  const byName = new Map();
  for (const m of (mentions || []).filter(x => x.name)) {
    const [whole, first] = nameVariants(m.name);
    const wholeKey = whole.toLowerCase();
    if (!byName.has(wholeKey)) byName.set(wholeKey, m);
    if (!first) continue;
    const key = first.toLowerCase();
    const entry = lookup.byName.get(key);
    if (byName.has(key)) continue;
    if (entry && entry.full.length > 0 && key !== writer) continue;
    const others = new Set((entry ? entry.first : []).map(u => displayNameOf(u).toLowerCase()));
    others.delete(writer);
    if (others.size === 1 && others.has(wholeKey)) byName.set(key, m);
  }
  return byName;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

// Distinct, non-empty names, longest first. A list already put in that order (a lookup's
// `names`) is remembered by identity, so repeated calls with it do no sorting.
const sortedCache = new WeakMap();
function sortedNames(names) {
  const list = names || [];
  const cached = sortedCache.get(list);
  if (cached) return cached;
  const sorted = [...new Set(list.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names) sortedCache.set(names, sorted);
  return sorted;
}

// Where each @name sits in a comment. An @ counts at the start of the text or after
// whitespace; the name must be one of `names` (capitals ignored, so a hand-typed
// "@jo bloggs" finds "Jo Bloggs") and must end the text or be followed by something that
// is not a letter or digit (so "@Jo" is not found inside "@Joanne"). When several names fit
// (Jo, Jo Bloggs) the longest wins. Spans never overlap.
// Returns [{ start, end, name }] left to right; start is the position of the @, and name
// is the spelling from `names`, not the spelling typed.
function findMentionSpans(text, names) {
  const spans = [];
  if (!text) return spans;
  const sorted = sortedNames(names);
  let i = 0;
  while (i < text.length) {
    const atBoundary = text[i] === '@' && (i === 0 || /\s/.test(text[i - 1]));
    const name = atBoundary
      ? sorted.find((n) => {
        if (text.slice(i + 1, i + 1 + n.length).toLowerCase() !== n.toLowerCase()) return false;
        const after = text.slice(i + 1 + n.length, i + 2 + n.length);
        return after === '' || !WORD_CHAR.test(after);
      })
      : undefined;
    if (name === undefined) {
      i += 1;
    } else {
      const end = i + 1 + name.length;
      spans.push({ start: i, end, name });
      i = end;
    }
  }
  return spans;
}

// The @words in a comment that name nobody in `names`: an @ at the start of the text or
// after whitespace, followed straight away by a letter (so "@3pm" or "@12" is not a name
// tried), and not the start of a span findMentionSpans finds. The word runs to the next
// whitespace with trailing punctuation (, . ? ! : ;) dropped. An email (x@y.com) has no
// whitespace before its @, so it never counts. Returns the distinct words as typed, in order.
function findUnmatchedMentions(text, names) {
  const found = [];
  if (!text) return found;
  const spans = findMentionSpans(text, names);
  const re = /(^|\s)@(\p{L}[^\s]*)/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    if (spans.some(s => s.start === start)) continue;
    const word = m[2].replace(/[,.?!:;]+$/, '');
    if (word && !found.includes(word)) found.push(word);
  }
  return found;
}

// The name a person goes by in the @ list and in comments.
const displayNameOf = (u) => u.name || u.username || '';

export { findMentionSpans, findUnmatchedMentions, displayNameOf, buildNameLookup, resolveMentions, mentionedPeople, storedMentionsByName };
