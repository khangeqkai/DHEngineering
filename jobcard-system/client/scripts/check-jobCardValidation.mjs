// Self-check for jobCardValidation: a blank description on ANY line (saved or fresh)
// must block the save, rather than being silently dropped — a saved line used to have
// the server delete the part, and a fresh line just threw away the row the user started.
// Run: node scripts/check-jobCardValidation.mjs
import assert from 'node:assert';
import { validateJobCardForm } from '../src/components/jobcard/jobCardValidation.mjs';

const base = {
  canManage: true,
  formData: { description: 'job' },
  contactFormData: { companyName: 'ACME' },
};

const savedLine = (over) => ({
  id: 'item:abc-123',
  itemNumber: 2,
  qty: '1',
  description: 'Turn shaft',
  jobType: 'CNC',
  material: 'Steel',
  treatments: [],
  drawingsType: 'DWG',
  customerProperty: 'CUST',
  ...over,
});
const freshRow = () => ({
  id: 12345, // temporary local id, not saved
  itemNumber: 1,
  qty: '',
  description: '',
  jobType: '',
  material: '',
  treatments: [],
  drawingsType: '',
  customerProperty: '',
});

const key = (id, field) => `${id}|${field}`;

// 1. Saved line blanked -> its description box is marked, save blocked.
// Whitespace-only description pins the guard's .trim().
{
  const { marks } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ id: 'item:a', itemNumber: 2, description: ' ' }), savedLine({ id: 'item:b', itemNumber: 3 })],
  });
  assert.strictEqual(marks.items[key('item:a', 'description')], 'Description is required',
    'blanked saved line must be marked: ' + JSON.stringify(marks));
}

// 2. Fresh unsaved blank row + valid saved line -> the fresh row's box is marked,
// and the payload still excludes it.
{
  const { marks, validItems } = validateJobCardForm({
    ...base,
    lineItems: [freshRow(), savedLine({ itemNumber: 2 })],
  });
  assert(marks.items[key(12345, 'description')],
    'fresh blank row must be marked: ' + JSON.stringify(marks));
  assert.strictEqual(validItems.length, 1, 'fresh blank row must be excluded from payload');
}

// 3. Normal save with all descriptions filled -> nothing marked, no messages.
{
  const { marks, errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 1 })],
  });
  assert.strictEqual(errors.length, 0, 'valid line must pass: ' + JSON.stringify(errors));
  assert.deepStrictEqual(marks, { job: {}, items: {} }, 'valid line must mark nothing');
}

// 4. A brand-new card with nothing typed in -> the "add at least one part" message,
// and ONLY that: there is no particular row at fault, so it must not also mark the
// same empty row.
{
  const { marks, errors } = validateJobCardForm({
    ...base,
    lineItems: [freshRow()],
  });
  assert(errors.some(e => e === 'Add at least one part'),
    'all-blank new card must keep the existing message: ' + JSON.stringify(errors));
  assert.deepStrictEqual(marks.items, {},
    'all-blank new card must not also mark a row: ' + JSON.stringify(marks));
}

// 4b. A SAVED job whose only part has been blanked is a different mistake: there IS a
// row at fault, so it must be marked rather than told to add a line it already has.
{
  const { marks, errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ id: 'item:a', itemNumber: 1, description: '' })],
  });
  assert(marks.items[key('item:a', 'description')],
    'blanked sole saved part must be marked: ' + JSON.stringify(marks));
  assert(!errors.some(e => e === 'Add at least one part'),
    'blanked sole saved part must not be told to add a line: ' + JSON.stringify(errors));
}

// 5. Each mark lands on the row it is about, by the row's own id — a blanked line
// dropping out of the filtered list must not shift a later row's mark onto it.
{
  const { marks } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ id: 'item:a', itemNumber: 1, description: '' }), savedLine({ id: 'item:b', itemNumber: 2, jobType: '' })],
  });
  assert(marks.items[key('item:b', 'jobType')],
    'job-type mark must land on the second part: ' + JSON.stringify(marks));
  assert(!marks.items[key('item:a', 'jobType')], 'the first part has a job type');
}

// 6. Missing customer and description mark their own boxes, not a pop-up.
{
  const { marks, errors } = validateJobCardForm({
    ...base,
    formData: { description: '' },
    contactFormData: { companyName: ' ' },
    lineItems: [savedLine({ itemNumber: 1 })],
  });
  assert(marks.job.companyName && marks.job.description, 'customer and description must be marked: ' + JSON.stringify(marks));
  assert.strictEqual(errors.length, 0, 'nothing left for a pop-up: ' + JSON.stringify(errors));
}

console.log('jobCardValidation check: all 7 cases pass');
