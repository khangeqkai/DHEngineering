// Self-check for jobCardValidation: blanking a SAVED line's description must block
// the save (it used to silently drop the line -> server deleted the part).
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
// pins the guard's .trim(); itemNumber 2 at index 0 (item #1 was deleted) pins
// that the message reports the row's real itemNumber, not its array position.
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 2, description: ' ' }), savedLine({ itemNumber: 3 })],
  });
  assert(errors.includes('Description is required on item #2'),
    'blanked saved line must error: ' + JSON.stringify(errors));
}

// 2. Fresh unsaved blank row + valid saved line -> no description error, row dropped.
{
  const { errors, validItems } = validateJobCardForm({
    ...base,
    lineItems: [freshRow(), savedLine({ itemNumber: 2 })],
  });
  assert(!errors.some(e => e.startsWith('Description is required')),
    'fresh blank row must not error: ' + JSON.stringify(errors));
  assert.strictEqual(validItems.length, 1, 'fresh blank row must be dropped from payload');
}

// 3. Normal save with all descriptions filled -> no errors.
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 1 })],
  });
  assert.strictEqual(errors.length, 0, 'valid line must pass: ' + JSON.stringify(errors));
}

// 4. Everything blank -> still the "add at least one line item" error.
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [freshRow()],
  });
  assert(errors.some(e => e === 'Add at least one line item'),
    'all-blank must keep the existing error: ' + JSON.stringify(errors));
}

// 5. Per-item errors name the row's real itemNumber: the blanked line drops out
// of the filtered list, so index-based numbering would call line #2 "item #1".
{
  const { errors } = validateJobCardForm({
    ...base,
    lineItems: [savedLine({ itemNumber: 1, description: '' }), savedLine({ itemNumber: 2, jobType: '' })],
  });
  assert(errors.includes('Job type is required on item #2'),
    'job-type error must name item #2, not the filtered position: ' + JSON.stringify(errors));
}

console.log('jobCardValidation check: all 5 cases pass');
