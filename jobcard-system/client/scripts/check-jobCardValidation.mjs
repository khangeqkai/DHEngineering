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

// 1. Saved line blanked -> error, save blocked. Whitespace-only description
// pins the guard's .trim(); itemNumber 2 at index 0 pins that the message
// reports the row's place in the list (the badge the screen shows), not its
// itemNumber, which is an internal counter that can skip a number.
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 2, description: ' ' }), savedLine({ itemNumber: 3 })],
  });
  assert(errors.includes('Description is required on part 1'),
    'blanked saved line must error: ' + JSON.stringify(errors));
}

// 2. Fresh unsaved blank row + valid saved line -> error naming its own itemNumber (1),
// and the payload still excludes it.
{
  const { errors, validItems } = validateJobCardForm({
    ...base,
    lineItems: [freshRow(), savedLine({ itemNumber: 2 })],
  });
  assert(errors.includes('Description is required on part 1'),
    'fresh blank row must error: ' + JSON.stringify(errors));
  assert.strictEqual(validItems.length, 1, 'fresh blank row must be excluded from payload');
}

// 3. Normal save with all descriptions filled -> no errors.
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 1 })],
  });
  assert.strictEqual(errors.length, 0, 'valid line must pass: ' + JSON.stringify(errors));
}

// 4. A brand-new card with nothing typed in -> the "add at least one part" error,
// and ONLY that: there is no particular row at fault, so it must not also get
// "Description is required on part 1" for the same empty row.
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [freshRow()],
  });
  assert(errors.some(e => e === 'Add at least one part'),
    'all-blank new card must keep the existing error: ' + JSON.stringify(errors));
  assert(!errors.some(e => e.startsWith('Description is required')),
    'all-blank new card must not also raise a per-row description error: ' + JSON.stringify(errors));
}

// 4b. A SAVED job whose only part has been blanked is a different mistake: there IS a
// row at fault, so it must be named rather than told to add a line it already has.
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 1, description: '' })],
  });
  assert(errors.includes('Description is required on part 1'),
    'blanked sole saved part must be named: ' + JSON.stringify(errors));
  assert(!errors.some(e => e === 'Add at least one part'),
    'blanked sole saved part must not be told to add a line: ' + JSON.stringify(errors));
}

// 5. Per-item errors name the row's real itemNumber: the blanked line drops out
// of the filtered list, so index-based numbering would call the second part "part 1".
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 1, description: '' }), savedLine({ itemNumber: 2, jobType: '' })],
  });
  assert(errors.includes('Job type is required on part 2'),
    'job-type error must name part 2, not the filtered position: ' + JSON.stringify(errors));
}

console.log('jobCardValidation check: all 6 cases pass');
