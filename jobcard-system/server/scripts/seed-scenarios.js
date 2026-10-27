/**
 * Job-card generator for the seed script.
 *
 * Replaces the old hand-written nine-scenario list with a deterministic generator
 * that walks coverage counters across every axis the app supports, so the demo
 * data exercises ALL of: each status, each job type, each
 * material, each treatment (incl. the free-text "Other"), each drawing type,
 * each customer-property value, repeat jobs, and every priority.
 *
 * It is deterministic (no randomness) so re-seeding always yields the same set.
 *
 * Output shape per job (consumed by server/scripts/seed-mock-data.js):
 *   description, poNumber?, status, previousStatus?, requiresPo?, priority, repeatOf,
 *   contact, qualityLevel, daysAgoCreated, daysFromNowDue, invoicedDaysAgo?,
 *   costing?, items[], assignees[], notes[], timeEntries[]
 *   items[].treatment       — comma-separated treatment values, or null
 *   items[].drawings / .customerProperty — single tag value (per line item)
 */

// ── Coverage axes (tag VALUES, matching seed-data tagValue output) ──
const STATUS_PLAN = [
  'TO_QUOTE', 'TO_QUOTE', 'TO_QUOTE', 'QUOTE_SENT',
  'OPEN', 'OPEN', 'OPEN', 'OPEN',
  'HOLD_MATERIAL', 'HOLD_SUBCONTRACT', 'HOLD_TOOLS', 'HOLD_CUSTOMER', 'HOLD_MATERIAL',
  'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS',
  'DONE', 'DONE', 'DONE', 'DONE',
  'ARCHIVED', 'ARCHIVED', 'ARCHIVED', 'ARCHIVED',
  // Appended rather than interleaved, so every existing index above (including the
  // jobIdx-specific liveTimer/withOvertime picks below) keeps pointing at the same
  // job it always did.
  'HOLD_PO', 'HOLD_PO',
  'READY_TO_COLLECT', 'READY_TO_COLLECT',
  'TO_COST', 'TO_INVOICE', 'CALL_FOR_PAYMENT', 'CALL_FOR_PAYMENT',
  'ACTION_REQUIRED',
];

// The two billing jobs whose customer needs a PO number for invoicing: the To be
// Invoiced one has none yet (so the job card's red note and the "carry on?" question
// both show), the first Call for Payment one has it.
const PO_REQUIRED_PLAN = { TO_INVOICE: 'missing', CALL_FOR_PAYMENT: 'entered' };

const QUOTING = new Set(['TO_QUOTE', 'QUOTE_SENT']);
// The bill has gone out, so these carry an invoiced date.
const BILLED = new Set(['CALL_FOR_PAYMENT', 'ARCHIVED']);

const JOB_TYPES = ['MANUFACTURE', 'REPAIR', 'MODIFY', 'FABRICATE', 'SUPPLY', 'REVERSE_ENGINEER', 'INSPECTION', 'CAD_DRAWINGS', 'CONSULTATION', 'ONSITE'];
const MATERIALS = ['STEEL', 'STAINLESS_STEEL', 'ALUMINIUM', 'BRASS', 'COPPER', 'BRONZE', 'CAST_IRON', 'TITANIUM', 'PLASTIC'];
// null entries leave a line item untreated; every real treatment value appears.
const TREATMENTS = [null, 'HEAT_TREATMENT', null, 'PRECISION_GRINDING', 'ANODISE', null, 'ELECTROPLATE', 'BLASTING', null, 'POWDERCOAT', 'SPRAYPAINT', 'GALVANISE', 'SPECIALISED_COATING', null];
const DRAWINGS = ['CUSTOMER_CAD', 'CUSTOMER_SKETCH', 'DH_CAD', 'DH_SKETCH', 'PREPARE_SKETCH', 'PREPARE_CAD'];
const CUSTOMER_PROPERTY = ['N_A', 'MATERIAL_SUPPLIED', 'N_A', 'DAMAGED_OR_WORN_SAMPLE', 'GOOD_SAMPLE', 'N_A', 'PART_FOR_REPAIR', 'PART_FOR_MODIFICATION'];
const PRIORITIES = ['MEDIUM', 'HIGH', 'LOW', 'SAME_DAY', 'HIGH', 'NONE', 'MEDIUM', 'LOW'];

// ── Realistic part vocabulary ──
const VERB = {
  MANUFACTURE: 'Manufacture', REPAIR: 'Repair', MODIFY: 'Modify', FABRICATE: 'Fabricate',
  SUPPLY: 'Supply', REVERSE_ENGINEER: 'Reverse engineer', INSPECTION: 'Inspect',
  CAD_DRAWINGS: 'Produce drawings for', CONSULTATION: 'Consult on', ONSITE: 'On-site work on',
};
const PARTS = {
  MANUFACTURE: ['drive shaft', 'bearing housing', 'flange adapter', 'pump impeller', 'coupling hub', 'gland sleeve', 'spacer ring', 'locator pin', 'thrust collar', 'wear ring'],
  REPAIR: ['gearbox housing', 'hydraulic ram', 'pump shaft', 'roller shaft', 'crusher toggle', 'conveyor pulley'],
  MODIFY: ['mounting bracket', 'pulley bore', 'shaft keyway', 'flange face', 'adapter plate'],
  FABRICATE: ['support frame', 'conveyor chute', 'skid base', 'guard panel', 'walkway grating', 'pipe spool'],
  SUPPLY: ['hex bolt set', 'bearing kit', 'gasket set', 'bar stock offcut'],
  REVERSE_ENGINEER: ['obsolete gear', 'sample casting', 'legacy coupling', 'worn sprocket'],
  INSPECTION: ['incoming casting batch', 'weld seam', 'machined batch'],
  CAD_DRAWINGS: ['assembly drawing pack', 'part detail set', 'general arrangement'],
  CONSULTATION: ['failure analysis', 'material selection review', 'fitment study'],
  ONSITE: ['line bore', 'flange facing', 'breakdown machining'],
};
const GRADE = {
  STEEL: 'EN24T', STAINLESS_STEEL: '316', ALUMINIUM: '6061-T6', BRASS: 'CZ121', COPPER: 'C101',
  BRONZE: 'PB1', CAST_IRON: 'Grade 250', TITANIUM: 'Grade 5', PLASTIC: 'Acetal',
};
// Job types where dimensions don't make sense in the part description.
const NO_DIMS = new Set(['INSPECTION', 'CAD_DRAWINGS', 'CONSULTATION', 'SUPPLY']);

const CONTEXT = {
  TO_QUOTE: 'quote to be written',
  QUOTE_SENT: 'quote sent, awaiting customer approval',
  OPEN: 'approved, scheduled to start',
  HOLD_PO: 'on hold for the customer\'s purchase order',
  HOLD_MATERIAL: 'on hold for material from supplier',
  HOLD_SUBCONTRACT: 'on hold while out at the subcontractor',
  HOLD_TOOLS: 'on hold for tooling',
  HOLD_CUSTOMER: 'on hold waiting on the customer',
  IN_PROGRESS: 'machining underway',
  DONE: 'complete, QC signed off',
  READY_TO_COLLECT: 'ready for the customer to collect',
  TO_COST: 'collected, to be costed',
  TO_INVOICE: 'costed, to be invoiced',
  CALL_FOR_PAYMENT: 'invoiced, payment being chased',
  ACTION_REQUIRED: 'needs someone to look at it',
  ARCHIVED: 'paid and archived',
};
const NOTES = {
  QUOTE_SENT: ['Quote emailed to the customer.', 'Following up on the quote.'],
  OPEN: ['Drawing approved, tooling list prepared.', 'Scheduled to start next shift.'],
  HOLD_PO: ['Quote confirmed — purchase order requested from customer.', 'Following up with customer for a PO number.'],
  HOLD_MATERIAL: ['Bar stock ordered — ETA 5 working days.', 'Waiting on casting from the foundry.'],
  HOLD_SUBCONTRACT: ['Sent out for heat treatment — back Thursday.', 'At the platers, chasing a return date.'],
  HOLD_TOOLS: ['Waiting on a replacement insert holder.', 'Special reamer on order.'],
  HOLD_CUSTOMER: ['Asked the customer to confirm the tolerance.', 'Waiting on the customer to drop off the sample.'],
  IN_PROGRESS: ['First item machined, first-off inspection passed.', 'Setup complete, running on the CNC now.'],
  DONE: ['All items complete, QC signed off.', 'Finished and ready for customer collection.'],
  READY_TO_COLLECT: ['Customer told the job is ready to collect.', 'Packed and waiting at the front counter.'],
  TO_COST: ['Collected — over to the office for costing.', 'Customer picked it up this morning.'],
  TO_INVOICE: ['Costing checked, ready to bill.', 'Hours and material totalled.'],
  CALL_FOR_PAYMENT: ['Invoice sent — chasing payment.', 'Customer says payment is on its way.'],
  ACTION_REQUIRED: ['Drawing and sample don\'t match — someone needs to call the customer.', 'Material arrived damaged.'],
  ARCHIVED: ['Completed, collected, and paid.', 'Final inspection passed — paid.'],
};

const STARTED = new Set(['IN_PROGRESS', 'DONE', 'READY_TO_COLLECT', 'TO_COST', 'TO_INVOICE', 'CALL_FOR_PAYMENT', 'ACTION_REQUIRED', 'ARCHIVED']);
const FULLY_MACHINED = new Set(['DONE', 'READY_TO_COLLECT', 'TO_COST', 'TO_INVOICE', 'CALL_FOR_PAYMENT', 'ARCHIVED']);
const COSTED = new Set(['IN_PROGRESS', 'DONE', 'READY_TO_COLLECT', 'TO_COST', 'TO_INVOICE', 'CALL_FOR_PAYMENT', 'ACTION_REQUIRED', 'ARCHIVED']);
// Base age (days ago created) per status — terminal jobs are older than fresh ones.
const BASE_AGE = { TO_QUOTE: 2, QUOTE_SENT: 4, OPEN: 3, HOLD_PO: 7, HOLD_MATERIAL: 6, HOLD_SUBCONTRACT: 8, HOLD_TOOLS: 5, HOLD_CUSTOMER: 6, IN_PROGRESS: 9, ACTION_REQUIRED: 10, DONE: 22, READY_TO_COLLECT: 26, TO_COST: 28, TO_INVOICE: 29, CALL_FOR_PAYMENT: 31, ARCHIVED: 32 };
const BASE_DUE = { TO_QUOTE: 21, QUOTE_SENT: 18, OPEN: 14, HOLD_PO: 12, HOLD_MATERIAL: 18, HOLD_SUBCONTRACT: 15, HOLD_TOOLS: 16, HOLD_CUSTOMER: 13, IN_PROGRESS: 8, ACTION_REQUIRED: 4, DONE: 3, READY_TO_COLLECT: -3, TO_COST: -4, TO_INVOICE: -5, CALL_FOR_PAYMENT: -6, ARCHIVED: -8 };

function buildScenarios(contacts, qualityLevels, opts = {}) {
  const workerCount = opts.workerCount || 5;
  const machineNumbers = opts.machineNumbers || ['CNC-01'];
  // Machines that suit metal removal vs. fabrication — keeps time entries believable.
  const machiningMachines = machineNumbers.filter(m => !m.startsWith('WELD'));

  // Rotating counters guarantee every axis value is used at least once.
  const c = { type: 0, mat: 0, treat: 0, draw: 0, prop: 0, prio: 0, contact: 0, qa: 0, worker: 0, machine: 0, note: 0, other: 0 };
  const rot = (arr, key) => arr[c[key]++ % arr.length];
  const nextWorker = () => c.worker++ % workerCount;

  let poNum = 44950; // PO numbers count DOWN from here as jobs get older
  const poRequiredUsed = new Set();

  const jobs = [];
  STATUS_PLAN.forEach((status, jobIdx) => {
    const poRequired = PO_REQUIRED_PLAN[status] && !poRequiredUsed.has(status) ? PO_REQUIRED_PLAN[status] : null;
    if (poRequired) poRequiredUsed.add(status);
    const itemCount = QUOTING.has(status) ? (1 + (jobIdx % 3)) : (1 + (jobIdx % 2)); // quotes 1-3 items, others 1-2
    const items = [];
    for (let n = 0; n < itemCount; n++) {
      const jobType = rot(JOB_TYPES, 'type');
      const material = rot(MATERIALS, 'mat');
      const treatment = rot(TREATMENTS, 'treat');
      const part = PARTS[jobType][(jobIdx + n) % PARTS[jobType].length];
      const dims = NO_DIMS.has(jobType) ? '' : ` Ø${40 + ((jobIdx + n) % 9) * 8}x${60 + ((jobIdx + n) % 7) * 40}mm`;
      const grade = NO_DIMS.has(jobType) ? '' : ` ${GRADE[material]}`;
      const qty = jobType === 'SUPPLY' ? String(10 + (n * 6)) : String(1 + ((jobIdx + n) % 6));
      items.push({
        qty,
        desc: `${part.charAt(0).toUpperCase()}${part.slice(1)}${grade}${dims}`.trim(),
        jobType,
        material,
        treatment,
        drawings: rot(DRAWINGS, 'draw'),
        customerProperty: rot(CUSTOMER_PROPERTY, 'prop'),
      });
    }

    const contact = contacts[c.contact++ % contacts.length];
    const qualityLevel = qualityLevels[c.qa++ % qualityLevels.length];
    const priority = rot(PRIORITIES, 'prio');
    // Every fifth job repeats the job listed just before it (repeatOf: its list position).
    const repeatOf = jobIdx % 5 === 0 && jobIdx > 0 ? jobIdx - 1 : null;
    const daysAgoCreated = BASE_AGE[status] + (jobIdx % 4);
    const daysFromNowDue = BASE_DUE[status] - (jobIdx % 3);
    const hasTreatment = items.some(it => it.treatment);

    // Assignees: 1-3 distinct workers (quoting jobs are unassigned).
    const assignees = [];
    if (!QUOTING.has(status)) {
      const count = 1 + (jobIdx % 3);
      for (let a = 0; a < count; a++) {
        const w = nextWorker();
        if (!assignees.includes(w)) assignees.push(w);
      }
    }

    // Notes: one or two, except fresh quotes which have none.
    const notes = [];
    if (!QUOTING.has(status) && assignees.length) {
      const pool = NOTES[status] || [];
      const noteCount = Math.min(pool.length, 1 + (jobIdx % 2));
      for (let k = 0; k < noteCount; k++) {
        notes.push({ worker: assignees[k % assignees.length], text: pool[k], daysAgo: Math.max(0, daysAgoCreated - 2 - k * 2) });
      }
    }

    // One archived job carries a manually-entered special-labour line (weekend overtime).
    const withOvertime = status === 'ARCHIVED' && jobIdx === 27;

    // Time entries, scaled to how far the job has progressed.
    const timeEntries = [];
    if (STARTED.has(status)) {
      const fullyDone = FULLY_MACHINED.has(status);
      // One IN_PROGRESS job carries a live (still-running) timer.
      const liveTimer = status === 'IN_PROGRESS' && jobIdx === 12;

      items.forEach((it, idx) => {
        const itemNo = String(idx + 1);
        const target = parseInt(it.qty, 10) || 1;
        const worker = assignees[idx % assignees.length] ?? nextWorker();
        const machine = rot(machiningMachines, 'machine');
        const entered = Math.max(1, daysAgoCreated - 2 - idx * 2);

        if (fullyDone) {
          timeEntries.push({ worker, item: itemNo, machine, qty: String(target), scrap: idx === 0 ? 1 : 0, desc: it.desc, daysAgo: entered, startHour: 8, hours: 4 + (idx % 3) });
        } else if (status === 'IN_PROGRESS') {
          if (idx === 0) {
            timeEntries.push({ worker, item: itemNo, machine, qty: String(target), desc: it.desc, daysAgo: entered, startHour: 7, hours: 5 });
          } else if (idx === 1) {
            const partial = Math.max(1, Math.floor(target / 2));
            timeEntries.push({ worker, item: itemNo, machine, qty: String(partial), scrap: 1, desc: it.desc, daysAgo: entered, startHour: 8, hours: 4 });
          }
        }
      });

      if (liveTimer) {
        timeEntries.push({ worker: assignees[0], item: String(items.length), machine: rot(machiningMachines, 'machine'), qty: '0', desc: `${items[items.length - 1].desc} — in progress`, active: true, startMinutesAgo: 75 });
      }
    }

    // Pricing on anything past quoting/opening.
    let costing;
    if (COSTED.has(status)) {
      costing = {
        labourRate: 115,
        // One invoiced job shows the manually-entered special-labour line (e.g. weekend overtime).
        labourSpecialHours: withOvertime ? 8 : 0,
        labourSpecialRate: withOvertime ? 172 : 0,
        labourSpecialDescription: withOvertime ? 'Weekend shift to hit the shutdown date' : null,
        materialsCost: 1500 + (jobIdx % 6) * 2600,
        materialsProfitPercent: 25 + (jobIdx % 4) * 5,
        materialsDescription: `${(items[0].material || 'Bar stock').replace(/_/g, ' ').toLowerCase()} stock for ${items.length} part${items.length > 1 ? 's' : ''}`,
        subcontractorCost: hasTreatment ? 1800 + (jobIdx % 5) * 900 : 0,
        subcontractorProfitPercent: hasTreatment ? 15 : 0,
        subcontractorDescription: hasTreatment ? 'Outsourced treatment and freight both ways' : null,
      };
    }

    const firstPart = items[0].desc.split(' — ')[0].toLowerCase();
    jobs.push({
      description: `${VERB[items[0].jobType]} ${firstPart} — ${CONTEXT[status]}`,
      poNumber: QUOTING.has(status) || poRequired === 'missing' ? null : `PO-${poNum--}`,
      status,
      // Action Required remembers where the job was, so "Put back" has somewhere to go.
      previousStatus: status === 'ACTION_REQUIRED' ? 'IN_PROGRESS' : null,
      requiresPo: Boolean(poRequired),
      priority,
      repeatOf,
      contact,
      qualityLevel,
      daysAgoCreated,
      daysFromNowDue,
      invoicedDaysAgo: BILLED.has(status) ? Math.max(1, Math.floor(daysAgoCreated / 3)) : undefined,
      costing,
      items,
      assignees,
      notes,
      timeEntries,
    });
  });

  return jobs;
}

module.exports = { buildScenarios };
