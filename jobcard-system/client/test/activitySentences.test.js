// The global Activity Log's wording, checked on its own. Run with `npm test` in client/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeActivity, activityText, lineText } from '../src/utils/activitySentences.js';

const RAW = /[a-z]+_[a-z_]+|\b[A-Z]+_[A-Z_]+\b/;
const everything = (entry) => {
  const d = describeActivity(entry);
  return [d.headline, ...d.details].map(lineText).join(' | ');
};

test('a job entry is worded by the job History window and names the job', () => {
  const entry = {
    entityType: 'jobcard', entityId: 'x', action: 'update', userId: 'a', userName: 'Alice', jobNumber: '4821',
    changes: { status: { from: 'IN_PROGRESS', to: 'DONE' } }, snapshot: {}
  };
  const d = describeActivity(entry);
  assert.match(lineText(d.headline), /^Alice /);
  assert.equal(d.jobNumber, '4821');
  assert.match(activityText(entry), /job 4821/);
  assert.doesNotMatch(everything(entry), RAW);
});

test('ticking "Needs a PO number for invoicing" is said in words, as Yes/No', () => {
  const d = describeActivity({
    entityType: 'company', entityId: 'c1', action: 'update', userName: 'Bob', recordName: 'Acme Fasteners',
    changes: { requiresPo: { from: false, to: true } }
  });
  assert.equal(lineText(d.headline), "Bob changed Acme Fasteners' PO requirement to Yes (was No)");
  assert.doesNotMatch(lineText(d.headline), /true|false/);
});

test('a customer edit names the customer and says the field in words', () => {
  const d = describeActivity({
    entityType: 'company', entityId: 'c1', action: 'update', userName: 'Bob', recordName: 'Acme Fasteners',
    changes: { address: { from: '1 Old St', to: '2 New St' } }
  });
  assert.equal(lineText(d.headline), "Bob changed Acme Fasteners' address to 2 New St (was 1 Old St)");
});

test('a name ending in s takes only an apostrophe, others take apostrophe-s', () => {
  const d = describeActivity({
    entityType: 'supplier', entityId: 's', action: 'update', userName: 'Bob', recordName: 'Zinc Co',
    changes: { contactPhone: { from: '03 9', to: '03 8' } }
  });
  assert.equal(lineText(d.headline), "Bob changed Zinc Co's contact phone to 03 8 (was 03 9)");
});

test('several changes make a headline and one detail line each, with no raw field names', () => {
  const entry = {
    entityType: 'supplier', entityId: 's', action: 'update', userName: 'Bob', recordName: 'Zinc Co',
    changes: { contactName: { from: 'A', to: 'B' }, contactEmail: { from: null, to: 'b@z.com' } }
  };
  const d = describeActivity(entry);
  assert.equal(lineText(d.headline), 'Bob updated supplier Zinc Co');
  assert.deepEqual(d.details.map(lineText), ['Contact name: B (was A)', 'Contact email: b@z.com']);
});

test('a record that is gone reads as "a deleted <kind>"', () => {
  const d = describeActivity({
    entityType: 'machine', entityId: 'm', action: 'update', userName: 'Bob', recordName: null,
    changes: { description: { from: 'a', to: 'b' } }
  });
  assert.match(lineText(d.headline), /a deleted machine's description/);
});

test('an entry that recorded the name itself uses it when the record is gone', () => {
  const d = describeActivity({
    entityType: 'company', entityId: 'c', action: 'create', userName: 'Bob', recordName: null,
    changes: { name: { from: null, to: 'Gone Ltd' }, address: { from: null, to: '5 Road' } }
  });
  assert.equal(lineText(d.headline), 'Bob added customer Gone Ltd');
  assert.deepEqual(d.details.map(lineText), ['Address: 5 Road']);
});

test('archiving and bringing back are said plainly', () => {
  const archived = describeActivity({
    entityType: 'user', entityId: 'u', action: 'update', userName: 'Bob', recordName: 'Carol',
    changes: { active: { from: 1, to: 0 } }
  });
  assert.equal(lineText(archived.headline), 'Bob archived user Carol');
  const back = describeActivity({
    entityType: 'tag', entityId: 't', action: 'unarchive', userName: 'Bob', recordName: 'Steel', changes: {}
  });
  assert.equal(lineText(back.headline), 'Bob brought back option Steel');
});

test('a role change shows the role name, never the stored code', () => {
  const d = describeActivity({
    entityType: 'user', entityId: 'u', action: 'update', userName: 'Bob', recordName: 'Carol',
    changes: { role: { from: 'user', to: 'manager' } }
  });
  assert.equal(lineText(d.headline), "Bob changed Carol's role to Manager (was Worker)");
});

test('a PIN change never shows the hidden placeholder', () => {
  const own = describeActivity({
    entityType: 'user', entityId: 'u1', action: 'update', userId: 'u1', userName: 'Carol', recordName: 'Carol',
    changes: { password: { from: '(hidden)', to: '(changed)' } }
  });
  assert.equal(lineText(own.headline), 'Carol changed their own PIN');
  const other = describeActivity({
    entityType: 'user', entityId: 'u1', action: 'update', userId: 'a', userName: 'Admin', recordName: 'Carol',
    changes: { password: { from: '(hidden)', to: '(changed)' } }
  });
  assert.equal(lineText(other.headline), 'Admin changed the PIN for Carol');
});

test('sign-ins, sign-outs and failures', () => {
  assert.equal(lineText(describeActivity({ entityType: 'user', action: 'login', userName: 'Carol', changes: {} }).headline), 'Carol signed in');
  assert.equal(lineText(describeActivity({ entityType: 'user', action: 'logout', userName: 'Carol', changes: {} }).headline), 'Carol signed out');
  const failed = describeActivity({
    entityType: 'auth', action: 'login_failed', userName: 'x', changes: { reason: { from: null, to: 'invalid_password' } }
  });
  assert.equal(lineText(failed.headline), 'Someone failed to sign in as “x”');
  assert.deepEqual(failed.details.map(lineText), ['Reason: wrong PIN']);
  assert.equal(failed.kind, 'alert');
});

test('settings and backups', () => {
  const one = describeActivity({
    entityType: 'settings', entityId: 'general', action: 'update', userName: 'Admin',
    changes: { timezone: { from: 'Australia/Sydney', to: 'Australia/Melbourne' } }
  });
  assert.equal(lineText(one.headline), 'Admin changed the time zone setting to Australia/Melbourne (was Australia/Sydney)');
  const home = describeActivity({
    entityType: 'settings', entityId: 'home_access', action: 'update', userName: 'Admin',
    changes: { homeAccessCode: { from: 'not set', to: 'set' } }
  });
  assert.equal(lineText(home.headline), 'Admin turned on home access');
  const exp = describeActivity({
    entityType: 'system', entityId: 'backup', action: 'data_export', userName: 'Admin',
    changes: { outputPath: { from: null, to: 'D:\\b.json' }, size: { from: null, to: '1.2 MB' } }
  });
  assert.equal(lineText(exp.headline), 'Admin exported a backup (1.2 MB)');
});

test('an unknown action on a record never shows its raw verb', () => {
  const d = describeActivity({ entityType: 'supplier', entityId: 's', action: 'weird_thing', userName: 'Bob', recordName: 'Zinc', changes: {} });
  assert.doesNotMatch(lineText(d.headline), /weird/);
});
