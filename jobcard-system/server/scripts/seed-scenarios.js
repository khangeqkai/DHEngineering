/**
 * Job-card generator for the seed script.
 *
 * Replaces the old hand-written nine-scenario list with a deterministic generator
 * that walks coverage counters across every axis the app supports, so the demo
 * data exercises ALL of: each status (incl. On Hold), each job type, each
 * material, each treatment (incl. the free-text "Other"), each drawing type,
 * each customer-property value, the repeat-job flag, and every priority.
 *
 * It is deterministic (no randomness) so re-seeding always yields the same set.
 *
 * Output shape per job (consumed by server/scripts/seed-mock-data.js):
 *   description, quoteReference, poNumber?, status, priority, isRepeat,
 *   contact, qaLevel, daysAgoCreated, daysFromNowDue, invoicedDaysAgo?,
 *   costing?, items[], assignees[], notes[], timeEntries[]
 *   items[].treatment       — comma-separated treatment values, or null
 *   items[].drawings / .customerProperty — single tag value (per line item)
 */

// ── Coverage axes (tag VALUES, matching seed-data tagValue output) ──
const STATUS_PLAN = [
  'QUOTE', 'QUOTE', 'QUOTE', 'QUOTE',
  'OPEN', 'OPEN', 'OPEN', 'OPEN',
  'AWAITING_MATERIAL', 'AWAITING_MATERIAL', 'AWAITING_MATERIAL', 'AWAITING_MATERIAL', 'AWAITING_MATERIAL',
  'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS',
  'DONE', 'DONE', 'DONE', 'DONE',
  'INVOICED', 'INVOICED', 'INVOICED', 'INVOICED',
];

const JOB_TYPES = ['MANUFACTURE', 'REPAIR', 'MODIFY', 'FABRICATE', 'SUPPLY', 'REVERSE_ENGINEER', 'INSPECTION', 'CAD_DRAWINGS', 'CONSULTATION', 'ONSITE'];
const MATERIALS = ['STEEL', 'STAINLESS_STEEL', 'ALUMINIUM', 'BRASS', 'COPPER', 'BRONZE', 'CAST_IRON', 'TITANIUM', 'PLASTIC'];
// null entries leave a line item untreated; every real treatment value appears.
const TREATMENTS = [null, 'HEAT_TREATMENT', null, 'PRECISION_GRINDING', 'ANODISE', null, 'ELECTROPLATE', 'BLASTING', null, 'POWDERCOAT', 'SPRAYPAINT', 'GALVANISE', 'SPECIALISED_COATING', null];
const DRAWINGS = ['CUSTOMER_CAD', 'CUSTOMER_SKETCH', 'DH_CAD', 'DH_SKETCH', 'PREPARE_SKETCH', 'PREPARE_CAD'];
const CUSTOMER_PROPERTY = ['N_A', 'MATERIAL_SUPPLIED', 'N_A', 'DAMAGED_OR_WORN_SAMPLE', 'GOOD_SAMPLE', 'N_A', 'PART_FOR_REPAIR', 'PART_FOR_MODIFICATION'];
const PRIORITIES = ['MEDIUM', 'HIGH', 'LOW', 'MEDIUM', 'HIGH', 'NONE', 'MEDIUM', 'LOW'];

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
  QUOTE: 'quote pending customer approval',
  OPEN: 'approved, scheduled to start',
  AWAITING_MATERIAL: 'awaiting material from supplier',
  IN_PROGRESS: 'machining underway',
  DONE: 'complete, awaiting collection',
  INVOICED: 'completed and invoiced',
};
const NOTES = {
  OPEN: ['Drawing approved, tooling list prepared.', 'Scheduled to start next shift.'],
  AWAITING_MATERIAL: ['Bar stock ordered — ETA 5 working days.', 'Waiting on casting from the foundry.'],
  IN_PROGRESS: ['First item machined, first-off inspection passed.', 'Setup complete, running on the CNC now.'],
  DONE: ['All items complete, QC signed off.', 'Finished and ready for customer collection.'],
  INVOICED: ['Completed, collected, and invoiced.', 'Final inspection passed — invoiced.'],
};

const STARTED = new Set(['IN_PROGRESS', 'DONE', 'INVOICED']);
const FULLY_MACHINED = new Set(['DONE', 'INVOICED']);
const COSTED = new Set(['IN_PROGRESS', 'DONE', 'INVOICED']);
// Base age (days ago created) per status — terminal jobs are older than fresh ones.
const BASE_AGE = { QUOTE: 2, OPEN: 3, AWAITING_MATERIAL: 6, IN_PROGRESS: 9, DONE: 22, INVOICED: 32 };
const BASE_DUE = { QUOTE: 21, OPEN: 14, AWAITING_MATERIAL: 18, IN_PROGRESS: 8, DONE: 3, INVOICED: -8 };

function buildScenarios(contacts, qaLevels, opts = {}) {
  const workerCount = opts.workerCount || 5;
  const machineNumbers = opts.machineNumbers || ['CNC-01'];
  // Machines that suit metal removal vs. fabrication — keeps time entries believable.
  const machiningMachines = machineNumbers.filter(m => !m.startsWith('WELD'));

  // Rotating counters guarantee every axis value is used at least once.
  const c = { type: 0, mat: 0, treat: 0, draw: 0, prop: 0, prio: 0, contact: 0, qa: 0, worker: 0, machine: 0, note: 0, other: 0 };
  const rot = (arr, key) => arr[c[key]++ % arr.length];
  const nextWorker = () => c.worker++ % workerCount;

  let qtNum = 142;   // quote refs count DOWN from here as jobs get older
  let poNum = 44950; // PO numbers likewise

  const jobs = [];
  STATUS_PLAN.forEach((status, jobIdx) => {
    const itemCount = status === 'QUOTE' ? (1 + (jobIdx % 3)) : (1 + (jobIdx % 2)); // quotes 1-3 items, others 1-2
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
    const qaLevel = qaLevels[c.qa++ % qaLevels.length];
    const priority = rot(PRIORITIES, 'prio');
    const isRepeat = jobIdx % 5 === 0;
    const daysAgoCreated = BASE_AGE[status] + (jobIdx % 4);
    const daysFromNowDue = BASE_DUE[status] - (jobIdx % 3);
    const hasTreatment = items.some(it => it.treatment);

    // Assignees: 1-3 distinct workers (QUOTE jobs are unassigned).
    const assignees = [];
    if (status !== 'QUOTE') {
      const count = 1 + (jobIdx % 3);
      for (let a = 0; a < count; a++) {
        const w = nextWorker();
        if (!assignees.includes(w)) assignees.push(w);
      }
    }

    // Notes: one or two, except fresh quotes which have none.
    const notes = [];
    if (status !== 'QUOTE' && assignees.length) {
      const pool = NOTES[status] || [];
      const noteCount = Math.min(pool.length, 1 + (jobIdx % 2));
      for (let k = 0; k < noteCount; k++) {
        notes.push({ worker: assignees[k % assignees.length], text: pool[k], daysAgo: Math.max(0, daysAgoCreated - 2 - k * 2) });
      }
    }

    // Time entries, scaled to how far the job has progressed.
    const timeEntries = [];
    if (STARTED.has(status)) {
      const fullyDone = FULLY_MACHINED.has(status);
      // One IN_PROGRESS job carries a live (still-running) timer; one INVOICED job a Saturday special-labour entry.
      const liveTimer = status === 'IN_PROGRESS' && jobIdx === 12;
      const withSpecial = status === 'INVOICED' && jobIdx === 27;

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
      if (withSpecial) {
        timeEntries.push({ worker: assignees[0], item: '1', machine: 'GRIND-01', qty: '0', desc: 'Saturday overtime — pre-grind before plating', daysAgo: daysAgoCreated - 4, startHour: 7, hours: 8, special: true });
      }
    }

    // Pricing on anything past quoting/opening.
    let costing;
    if (COSTED.has(status)) {
      costing = {
        labourRate: 115,
        labourSpecialRate: status === 'INVOICED' ? 172 : 0,
        materialsCost: 1500 + (jobIdx % 6) * 2600,
        materialsProfitPercent: 25 + (jobIdx % 4) * 5,
        subcontractorCost: hasTreatment ? 1800 + (jobIdx % 5) * 900 : 0,
        subcontractorProfitPercent: hasTreatment ? 15 : 0,
      };
    }

    const firstPart = items[0].desc.split(' — ')[0].toLowerCase();
    jobs.push({
      description: `${VERB[items[0].jobType]} ${firstPart} — ${CONTEXT[status]}`,
      quoteReference: `QT-2026-${String(qtNum--).padStart(4, '0')}`,
      poNumber: status === 'QUOTE' ? null : `PO-${poNum--}`,
      status,
      priority,
      isRepeat,
      contact,
      qaLevel,
      daysAgoCreated,
      daysFromNowDue,
      invoicedDaysAgo: status === 'INVOICED' ? Math.max(1, Math.floor(daysAgoCreated / 3)) : undefined,
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
