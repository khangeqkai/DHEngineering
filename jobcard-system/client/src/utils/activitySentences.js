// The global Activity Log's wording. describeActivity turns one trail entry as the
// server sends it from GET /history (and the activity search) —
// `{ entityType, entityId, action, userId, userName, recordName, jobNumber, changes, snapshot }` —
// into the same `{ kind, ring, headline, details }` shape the job History window uses
// (historySentences.js), so both screens draw their rows alike. A job's entry is
// worded by describeEntry (that window's own wording) with the job's number added;
// every other kind of record is worded here, naming the record by its current name
// (`recordName`, looked up by the server) and falling back to "a deleted <kind>".
//
// A line is `{ parts: [{ text, strong? }], was? }`. No JSX and no React, so the
// sentences can be checked on their own.
import { describeEntry } from './historySentences';
import { formatHistoryValue } from './formatters';
import { TAG_CATEGORY_INFO } from './tagCategories';

const strong = (text) => ({ text: String(text), strong: true });
const isEmpty = (v) => v === null || v === undefined || v === '';
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const truthy = (v) => v === 1 || v === true || v === '1' || v === 'true';
const falsy = (v) => v === 0 || v === false || v === '0' || v === 'false';

// What each kind of record is called in a sentence.
const KIND_WORD = {
  user: 'user', company: 'customer', contact: 'contact', supplier: 'supplier', machine: 'machine', tag: 'option'
};

// The dot colour (a --history-dot-* token) of each kind of record, and of sign-ins.
const DOT = {
  user: 'status', company: 'people', contact: 'people', supplier: 'work', machine: 'quality',
  tag: 'files', settings: 'job', system: 'price', auth: 'alert'
};

// Plain names for the fields these records carry. A field not listed here is
// turned into words from its own name ("contactPhone" -> "contact phone").
const FIELD_WORD = {
  username: 'sign-in name', name: 'name', role: 'role', email: 'email', phone: 'phone', employeeId: 'worker number',
  password: 'PIN', active: 'active', archived: 'archived', approved: 'approved',
  address: 'address', notes: 'notes', contactName: 'contact name', companyName: 'company',
  contactPhone: 'contact phone', contactEmail: 'contact email', serviceTags: 'services',
  machineNumber: 'number', description: 'description', category: 'type',
  timezone: 'time zone', jobFoldersBase: 'job folders location', homeAccessCode: 'home access code',
  inactivityTimeout: 'sign-out timeout', labourDefaultRate: 'default labour rate', labourSchedule: 'working hours',
  labourPublicHolidays: 'public holidays', nextJobNumber: 'next job number'
};

const ROLE_WORD = { admin: 'Admin', manager: 'Manager', user: 'Worker' };
const FAIL_REASON = {
  invalid_password: 'wrong PIN',
  user_not_found_or_archived: 'no such active user',
  invalid_home_access_code: 'wrong home access code',
  invalid_current_password: 'wrong current PIN'
};

function fieldWord(key) {
  if (FIELD_WORD[key]) return FIELD_WORD[key];
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\s]+/g, ' ').trim().toLowerCase();
}

// "Acme Fasteners'" / "Jane's"
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

// A value in words. Yes/No flags, role names and stored moments read plainly;
// nothing here ever shows a raw code.
function valueWord(key, v) {
  if (isEmpty(v)) return 'blank';
  if (key === 'role') return ROLE_WORD[v] || cap(String(v));
  if (key === 'category' && TAG_CATEGORY_INFO[v]) return TAG_CATEGORY_INFO[v].label;
  if (key === 'password') return String(v).replace(/[()]/g, '');
  if (['active', 'archived', 'approved'].includes(key)) {
    if (truthy(v)) return 'Yes';
    if (falsy(v)) return 'No';
  }
  const s = String(v);
  // A stored list or block of settings is too long to read as a value.
  if (/^[[{]/.test(s.trim())) return 'new settings';
  return formatHistoryValue(key, v) || 'blank';
}

const lineText = (line) => line.parts.map((p) => p.text).join('') + (line.was ? ` (was ${line.was})` : '');

const plain = (segs, was) => ({ parts: segs.map((s) => (typeof s === 'string' ? { text: s } : s)), ...(was ? { was } : {}) });

// A line starting with the person: "Alice changed …". No name on the entry (the system
// itself) reads "The system …".
function act(entry, segs, was) {
  const who = entry.userName || 'The system';
  return plain([`${who} `, ...segs], was);
}

// The changes that carry a real difference, as [key, { from, to }].
function realChanges(entry) {
  const out = [];
  for (const [key, change] of Object.entries(entry.changes && typeof entry.changes === 'object' ? entry.changes : {})) {
    const c = change && typeof change === 'object' ? change : { from: null, to: change };
    const from = c.from === undefined ? null : c.from;
    const to = c.to === undefined ? null : c.to;
    if (isEmpty(from) && isEmpty(to)) continue;
    if (String(from) === String(to)) continue;
    out.push([key, { from, to }]);
  }
  return out;
}

function changeLine(key, change) {
  const was = isEmpty(change.from) ? undefined : valueWord(key, change.from);
  return plain([`${cap(fieldWord(key))}: `, strong(valueWord(key, change.to))], was);
}

// The record's name for the sentence: its current name, else the name the entry itself
// recorded, else "a deleted <kind>".
function recordLabel(entry) {
  const { changes = {}, snapshot = {}, entityType } = entry;
  const recorded = changes.name?.to ?? changes.name?.from ?? changes.contactName?.to ?? changes.machineNumber?.to
    ?? snapshot?.name ?? snapshot?.contactName ?? snapshot?.machineNumber ?? changes.username?.to ?? snapshot?.username;
  const name = entry.recordName || (isEmpty(recorded) ? null : String(recorded));
  return name ? strong(name) : `a deleted ${KIND_WORD[entityType] || 'record'}`;
}
const recordPossessive = (label) => (typeof label === 'string'
  ? `${label}'s`
  : strong(possessive(label.text)));

function describeRecord(entry) {
  const { entityType, action } = entry;
  const kindWord = KIND_WORD[entityType];
  const label = recordLabel(entry);
  const changes = realChanges(entry);
  let kind = DOT[entityType] || 'job';
  let headline;
  let lines = changes;

  if (action === 'create') {
    headline = act(entry, ['added ', entityType === 'tag' && entry.changes?.category?.to
      ? `${valueWord('category', entry.changes.category.to).toLowerCase()} option `
      : `${kindWord} `, label]);
    // The name (and an option's type) are already in the sentence.
    lines = changes.filter(([k]) => !['name', 'contactName', 'machineNumber', 'category'].includes(k));
  } else if (action === 'delete') {
    headline = act(entry, ['deleted ', kindWord, ' ', label]);
    kind = 'alert';
    lines = [];
  } else if (action === 'unarchive') {
    headline = act(entry, ['brought back ', kindWord, ' ', label]);
    lines = [];
  } else if (action === 'update' && entityType === 'user' && changes.length === 1 && changes[0][0] === 'password') {
    const self = entry.entityId && entry.entityId === entry.userId;
    headline = self ? act(entry, ['changed their own PIN']) : act(entry, ['changed the PIN for ', label]);
    lines = [];
  } else if (action === 'update') {
    const flag = changes.length === 1 && ['active', 'archived'].includes(changes[0][0]) ? changes[0] : null;
    const gone = flag && ((flag[0] === 'active' && falsy(flag[1].to)) || (flag[0] === 'archived' && truthy(flag[1].to)));
    if (flag) {
      headline = act(entry, [gone ? 'archived ' : 'brought back ', kindWord, ' ', label]);
      lines = [];
    } else if (changes.length === 1) {
      const [key, change] = changes[0];
      headline = act(entry, [
        'changed ', recordPossessive(label), ' ', fieldWord(key), ' to ', strong(valueWord(key, change.to))
      ], isEmpty(change.from) ? undefined : valueWord(key, change.from));
      lines = [];
    } else {
      headline = act(entry, ['updated ', kindWord, ' ', label]);
    }
  } else {
    headline = act(entry, ['made a change to ', kindWord, ' ', label]);
  }
  return { kind, ring: kind === 'alert', headline, details: lines.map(([k, c]) => changeLine(k, c)) };
}

function describeAuth(entry) {
  const reason = entry.changes?.reason?.to;
  const attempted = entry.userName ? `“${entry.userName}”` : 'an unknown name';
  return {
    kind: 'alert',
    ring: true,
    headline: plain(['Someone failed to sign in as ', strong(attempted)]),
    details: reason ? [plain(['Reason: ', FAIL_REASON[reason] || 'not allowed'])] : []
  };
}

function describeSettings(entry) {
  const changes = realChanges(entry);
  if (entry.entityId === 'home_access') {
    const now = entry.changes?.homeAccessCode?.to;
    const text = now === 'not set' ? 'turned off home access' : now === 'changed' ? 'changed the home access code' : 'turned on home access';
    return { kind: 'job', ring: false, headline: act(entry, [text]), details: [] };
  }
  if (changes.length === 1) {
    const [key, change] = changes[0];
    return {
      kind: 'job',
      ring: false,
      headline: act(entry, ['changed the ', fieldWord(key), ' setting to ', strong(valueWord(key, change.to))],
        isEmpty(change.from) ? undefined : valueWord(key, change.from)),
      details: []
    };
  }
  return {
    kind: 'job',
    ring: false,
    headline: act(entry, ['changed ', `${changes.length || 'some'} settings`]),
    details: changes.map(([k, c]) => changeLine(k, c))
  };
}

function describeBackup(entry) {
  const { action, changes = {} } = entry;
  if (action === 'data_export') {
    const size = changes.size?.to;
    return { kind: 'price', ring: false, headline: act(entry, ['exported a backup', size ? ` (${size})` : '']), details: [] };
  }
  const source = changes.source?.to;
  return {
    kind: 'alert',
    ring: true,
    headline: act(entry, ['restored a backup', source ? [' made on ', formatHistoryValue('source', source) || source].join('') : '']),
    details: []
  };
}

function describeSignIn(entry) {
  const { action } = entry;
  if (action === 'login') return { kind: 'job', ring: false, headline: act(entry, ['signed in']), details: [] };
  if (action === 'logout') return { kind: 'job', ring: false, headline: act(entry, ['signed out']), details: [] };
  // pin_change_failed
  return {
    kind: 'alert',
    ring: true,
    headline: act(entry, ['entered the wrong current PIN when changing their PIN']),
    details: []
  };
}

// The entry in words: { kind, ring, headline, details, jobNumber }.
export function describeActivity(entry) {
  const e = entry || {};
  let described;
  if (e.entityType === 'jobcard') described = describeEntry(e);
  else if (e.entityType === 'auth') described = describeAuth(e);
  else if (e.entityType === 'user' && ['login', 'logout', 'pin_change_failed'].includes(e.action)) described = describeSignIn(e);
  else if (e.entityType === 'settings') described = describeSettings(e);
  else if (e.entityType === 'system') described = describeBackup(e);
  else if (KIND_WORD[e.entityType]) described = describeRecord(e);
  else described = { kind: 'job', ring: false, headline: act(e, ['made a change']), details: [] };
  return { ...described, jobNumber: e.entityType === 'jobcard' ? (e.jobNumber ?? null) : null };
}

// The whole entry as one plain string, for tooltips and checks.
export function activityText(entry) {
  const d = describeActivity(entry);
  const head = lineText(d.headline);
  return d.jobNumber ? `${head} (job ${d.jobNumber})` : head;
}

// The record-type dropdown: key (what GET /history takes as entityType) and plain name.
export const RECORD_TYPES = [
  { key: '', label: 'Any type' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'users', label: 'Users' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'options', label: 'Options' },
  { key: 'settings', label: 'Settings' },
  { key: 'signins', label: 'Sign-ins' },
  { key: 'backups', label: 'Backups' }
];

// What the search page's "Type" chips and the log's row names call a record kind.
export function recordTypeName(entityType) {
  const names = {
    jobcard: 'Job', company: 'Customer', contact: 'Customer', supplier: 'Supplier', user: 'User', machine: 'Equipment',
    tag: 'Option', settings: 'Settings', auth: 'Sign-in', system: 'Backup', qa_level: 'Quality level'
  };
  return names[entityType] || 'Other';
}

export { lineText };
