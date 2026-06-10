/**
 * Job-card scenarios for the seed script, kept separate to hold the main script
 * under the file-size limit. Each scenario maps to one demo job and is written to
 * exercise a distinct state: empty-state rendering, mixed per-item progress, an
 * active running timer, out-for-treatment, completed, and invoiced + special labour.
 *
 * Indices into `contacts` / `qaLevels` are resolved by the caller, so this module
 * takes those arrays and returns the fully-built scenario list.
 *
 * Field reference (consumed by server/scripts/seed-mock-data.js):
 *   quoteReference / poNumber — strings written to the job card (PO only once ordered)
 *   costing — optional { labourRate, labourSpecialRate?, materialsCost,
 *             materialsProfitPercent, subcontractorCost, subcontractorProfitPercent }
 *   items[].treatment — comma-separated treatment tag values (or null)
 *   notes[].worker / timeEntries[].worker — index into the worker users
 *   timeEntries[].scrap — pieces scrapped on that entry (defaults to 0)
 *   timeEntries[].special — marks a special-labour (overtime) entry
 *   timeEntries[].active — a still-running timer (no end time)
 */

function buildScenarios(contacts, qaLevels) {
  return [
    // 1 — Fresh quote: no assignees, no notes, no time entries (empty-state rendering).
    {
      description: 'Quote: manufacture replacement gearbox housing assembly per DWG GB-2024-117',
      quoteReference: 'QT-2026-0142',
      status: 'QUOTE',
      priority: 'MEDIUM',
      contact: contacts[0], // Sasol
      qaLevel: qaLevels[0],
      drawingsType: 'CUSTOMER_CAD',
      customerProperty: 'N_A',
      daysAgoCreated: 2,
      daysFromNowDue: 21,
      items: [
        { qty: '1', desc: 'Gearbox housing CI per DWG GB-2024-117', jobType: 'MANUFACTURE', material: 'CAST_IRON', treatment: null },
        { qty: '2', desc: 'Bearing cap to match housing', jobType: 'MANUFACTURE', material: 'CAST_IRON', treatment: null },
        { qty: '4', desc: 'Custom socket head bolt M16x80 grade 12.9', jobType: 'MANUFACTURE', material: 'STEEL', treatment: 'HEAT_TREATMENT' },
      ],
      assignees: [],
      notes: [],
      timeEntries: [],
    },

    // 2 — OPEN: job approved and assigned, ready to start but zero work logged yet (0/qty all items).
    {
      description: 'Manufacture flange adapters for new steam line — drawing approved, scheduled for Monday',
      quoteReference: 'QT-2026-0118',
      poNumber: 'PO-44821',
      status: 'OPEN',
      priority: 'MEDIUM',
      contact: contacts[8], // Denel
      qaLevel: qaLevels[0],
      drawingsType: 'CUSTOMER_CAD',
      customerProperty: 'N_A',
      daysAgoCreated: 1,
      daysFromNowDue: 14,
      items: [
        { qty: '6', desc: 'Flange adapter 4" 150# 316SS', jobType: 'MANUFACTURE', material: 'STAINLESS_STEEL', treatment: null },
        { qty: '6', desc: 'Reducing bush 4"-3" mating',   jobType: 'MANUFACTURE', material: 'STAINLESS_STEEL', treatment: null },
      ],
      assignees: [0, 3],
      notes: [
        { worker: 0, text: 'Drawing approved this morning. Setting up tooling list, will start first thing Monday.', daysAgo: 0 },
      ],
      timeEntries: [],
    },

    // 3 — AWAITING_MATERIAL: assigned but waiting on bar stock from supplier.
    {
      description: 'Manufacture replacement bearing housings — awaiting EN24T bar from supplier',
      quoteReference: 'QT-2026-0103',
      poNumber: 'PO-44790',
      status: 'AWAITING_MATERIAL',
      priority: 'MEDIUM',
      contact: contacts[4], // Anglo American Platinum
      qaLevel: qaLevels[0],
      drawingsType: 'CUSTOMER_CAD',
      customerProperty: 'N_A',
      daysAgoCreated: 6,
      daysFromNowDue: 18,
      items: [
        { qty: '4', desc: 'Bearing housing EN24T Ø150x80mm',     jobType: 'MANUFACTURE', material: 'STEEL',           treatment: 'HEAT_TREATMENT' },
        { qty: '8', desc: 'Bearing locking ring 316SS Ø160x10mm', jobType: 'MANUFACTURE', material: 'STAINLESS_STEEL', treatment: null },
      ],
      assignees: [1, 2],
      notes: [
        { worker: 1, text: 'EN24T bar ordered from Bohler. Expected 5 working days.', daysAgo: 5 },
      ],
      timeEntries: [],
    },

    // 4 — Mixed per-item progress: item1 fully done, item2 partial, item3 untouched.
    {
      description: 'Manufacture pump impellers, shafts, and couplings — cooling water plant batch',
      quoteReference: 'QT-2026-0091',
      poNumber: 'PO-44712',
      costing: { labourRate: 650, materialsCost: 18500, materialsProfitPercent: 30, subcontractorCost: 4200, subcontractorProfitPercent: 15 },
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      contact: contacts[3], // Eskom
      qaLevel: qaLevels[1], // Critical
      drawingsType: 'CUSTOMER_CAD',
      customerProperty: 'MATERIAL_SUPPLIED',
      daysAgoCreated: 12,
      daysFromNowDue: 7,
      items: [
        { qty: '4',  desc: 'Pump impeller Ø180mm CF8M cast',      jobType: 'MANUFACTURE', material: 'STAINLESS_STEEL', treatment: null },
        { qty: '6',  desc: 'Pump shaft EN24T Ø50x350mm',           jobType: 'MANUFACTURE', material: 'STEEL',           treatment: 'HEAT_TREATMENT' },
        { qty: '12', desc: 'Coupling adapter PB1 Ø80x50mm',        jobType: 'MANUFACTURE', material: 'BRONZE',          treatment: null },
      ],
      assignees: [0, 1, 2],
      notes: [
        { worker: 0, text: 'Material from Eskom received. Starting impellers on CNC-03.', daysAgo: 10 },
        { worker: 1, text: 'All 4 impellers machined. First-off inspection passed.',       daysAgo: 6 },
        { worker: 2, text: 'Started shafts on LATHE-01. Heat treatment booked for next week.', daysAgo: 4 },
      ],
      timeEntries: [
        // Item 1 → 4/4 DONE
        { worker: 0, item: '1', machine: 'CNC-03',   qty: '2', desc: 'Pump impeller Ø180mm CF8M cast', daysAgo: 10, startHour: 8, hours: 5 },
        { worker: 1, item: '1', machine: 'CNC-03',   qty: '2', desc: 'Pump impeller Ø180mm CF8M cast', daysAgo: 9,  startHour: 7, hours: 6 },
        // Item 2 → 3/6 PARTIAL
        { worker: 2, item: '2', machine: 'LATHE-01', qty: '2', scrap: 1, desc: 'Pump shaft EN24T Ø50x350mm',     daysAgo: 4,  startHour: 8,  hours: 4 },
        { worker: 2, item: '2', machine: 'LATHE-01', qty: '1', desc: 'Pump shaft EN24T Ø50x350mm',     daysAgo: 3,  startHour: 13, hours: 3 },
        // Item 3 → untouched
      ],
    },

    // 5 — Active timer running right now (no end_time) on item 2 while item 1 is done.
    {
      description: 'Emergency repair: cracked exhaust manifold — weld crack and re-machine flange face',
      quoteReference: 'QT-2026-0156',
      poNumber: 'PO-44903',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      contact: contacts[6], // ArcelorMittal
      qaLevel: qaLevels[0],
      drawingsType: 'CUSTOMER_SKETCH',
      customerProperty: 'PART_FOR_REPAIR',
      daysAgoCreated: 2,
      daysFromNowDue: 1,
      items: [
        { qty: '1', desc: 'Manifold crack repair — TIG weld preheat 250°C', jobType: 'REPAIR', material: 'CAST_IRON', treatment: null },
        { qty: '1', desc: 'Re-machine flange face flat to 0.05mm',          jobType: 'MODIFY', material: 'CAST_IRON', treatment: null },
      ],
      assignees: [3, 4],
      notes: [
        { worker: 3, text: 'Weld done. Cooled slowly under blanket — no re-cracking.', daysAgo: 1 },
        { worker: 4, text: 'Setup on Bridgeport. Indicating face now.',                 daysAgo: 0 },
      ],
      timeEntries: [
        { worker: 3, item: '1', machine: 'WELD-01', qty: '1', desc: 'Manifold crack repair — TIG weld preheat 250°C', daysAgo: 1, startHour: 9, hours: 4 },
        // Active — started 90 minutes ago, no end_time.
        { worker: 4, item: '2', machine: 'MILL-01', qty: '0', desc: 'Re-machine flange face',                          active: true, startMinutesAgo: 90 },
      ],
    },

    // 6 — Two-item job: item 1 fully done, item 2 partial across two workers (5/8).
    {
      description: 'Fabricate conveyor mounting brackets and matched locator pins',
      quoteReference: 'QT-2026-0077',
      poNumber: 'PO-44688',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      contact: contacts[7], // Transnet
      qaLevel: qaLevels[0],
      drawingsType: 'DH_CAD',
      customerProperty: 'N_A',
      daysAgoCreated: 8,
      daysFromNowDue: 14,
      items: [
        { qty: '8', desc: 'Mounting bracket 150x100x12 MS welded', jobType: 'FABRICATE',   material: 'STEEL', treatment: 'GALVANISE' },
        { qty: '8', desc: 'Locator pin Ø20m6 x 60mm hardened',     jobType: 'MANUFACTURE', material: 'STEEL', treatment: 'HEAT_TREATMENT' },
      ],
      assignees: [0, 4],
      notes: [
        { worker: 0, text: 'Welded all brackets in the morning, switched to CNC-02 for pins after lunch.', daysAgo: 5 },
      ],
      timeEntries: [
        // Item 1 → 8/8 DONE
        { worker: 0, item: '1', machine: 'WELD-01', qty: '8', desc: 'Welded all 8 brackets',              daysAgo: 5, startHour: 7,  hours: 4 },
        // Item 2 → 3 + 2 = 5/8 PARTIAL
        { worker: 0, item: '2', machine: 'CNC-02',  qty: '3', desc: 'Turned first 3 locator pins',        daysAgo: 5, startHour: 11, hours: 3 },
        { worker: 4, item: '2', machine: 'CNC-02',  qty: '2', scrap: 1, desc: 'Locator pin Ø20m6 x 60mm hardened',  daysAgo: 3, startHour: 8,  hours: 4 },
      ],
    },

    // 7 — TREATMENT: machining done in-house, plates shipped out for galvanising.
    {
      description: 'Manufacture wear plates — machined and out at Robor for galvanising',
      quoteReference: 'QT-2026-0064',
      poNumber: 'PO-44651',
      costing: { labourRate: 650, materialsCost: 9200, materialsProfitPercent: 25, subcontractorCost: 2800, subcontractorProfitPercent: 20 },
      status: 'TREATMENT',
      priority: 'MEDIUM',
      contact: contacts[5], // Mondi
      qaLevel: qaLevels[0],
      drawingsType: 'DH_CAD',
      customerProperty: 'N_A',
      daysAgoCreated: 18,
      daysFromNowDue: 10,
      items: [
        { qty: '6', desc: 'Wear plate 400BHN 300x200x25mm drilled', jobType: 'MANUFACTURE', material: 'STEEL', treatment: 'GALVANISE' },
      ],
      assignees: [0, 4],
      notes: [
        { worker: 0, text: 'All 6 plates profiled and drilled. Ready for galvanising.', daysAgo: 8 },
        { worker: 4, text: 'Dropped off at Robor. ETA back is 4 working days.',         daysAgo: 6 },
      ],
      timeEntries: [
        // Item 1 → 6/6 machining done; awaiting return from Robor.
        { worker: 0, item: '1', machine: 'CNC-01',   qty: '3', desc: 'Wear plate — profile cut', daysAgo: 12, startHour: 7, hours: 6 },
        { worker: 4, item: '1', machine: 'DRILL-01', qty: '3', desc: 'Wear plate — drilling',     daysAgo: 8,  startHour: 8, hours: 5 },
      ],
    },

    // 8 — DONE: all items complete, QC signed off, awaiting customer collection / invoice.
    {
      description: 'Manufacture coupling adapters — complete, awaiting customer collection',
      quoteReference: 'QT-2026-0029',
      poNumber: 'PO-44503',
      costing: { labourRate: 650, materialsCost: 3400, materialsProfitPercent: 35, subcontractorCost: 0, subcontractorProfitPercent: 0 },
      status: 'DONE',
      priority: 'LOW',
      contact: contacts[9], // South32
      qaLevel: qaLevels[0],
      drawingsType: 'CUSTOMER_CAD',
      customerProperty: 'N_A',
      daysAgoCreated: 22,
      daysFromNowDue: 2,
      items: [
        { qty: '2', desc: 'Coupling adapter EN8 Ø150x120mm', jobType: 'MANUFACTURE', material: 'STEEL', treatment: null },
      ],
      assignees: [2, 3],
      notes: [
        { worker: 2, text: 'First adapter complete and inspected.',                       daysAgo: 14 },
        { worker: 3, text: 'Both adapters done. QC signed off. Ready for collection.',    daysAgo: 5 },
      ],
      timeEntries: [
        { worker: 2, item: '1', machine: 'LATHE-01', qty: '1', scrap: 1, desc: 'Coupling adapter EN8 Ø150x120mm', daysAgo: 14, startHour: 8, hours: 6 },
        { worker: 3, item: '1', machine: 'LATHE-01', qty: '1', desc: 'Coupling adapter EN8 Ø150x120mm', daysAgo: 5,  startHour: 9, hours: 5 },
      ],
    },

    // 9 — Fully done + INVOICED (archived) + Saturday special labour entry.
    {
      description: 'Chrome plate worn roller shafts — printer plant rush',
      quoteReference: 'QT-2026-0012',
      poNumber: 'PO-44388',
      costing: { labourRate: 650, labourSpecialRate: 975, materialsCost: 1200, materialsProfitPercent: 40, subcontractorCost: 5600, subcontractorProfitPercent: 15 },
      status: 'INVOICED',
      priority: 'HIGH',
      contact: contacts[1], // Sappi
      qaLevel: qaLevels[0],
      drawingsType: 'CUSTOMER_SKETCH',
      customerProperty: 'PART_FOR_REPAIR',
      daysAgoCreated: 30,
      daysFromNowDue: -10,
      invoicedDaysAgo: 12,
      items: [
        { qty: '2', desc: 'Roller shaft Ø80mm — strip chrome, re-plate, grind to size', jobType: 'REPAIR', material: 'STEEL', treatment: 'ELECTROPLATE,PRECISION_GRINDING' },
      ],
      assignees: [2, 3],
      notes: [
        { worker: 2, text: 'Stripped old chrome. Sent to SA Anodisers for re-plating.', daysAgo: 25 },
        { worker: 3, text: 'Back from platers. Grinding to nominal Ø80h6.',             daysAgo: 18 },
        { worker: 2, text: 'Both shafts within tolerance. Customer collected.',          daysAgo: 14 },
      ],
      timeEntries: [
        { worker: 2, item: '1', machine: 'LATHE-02', qty: '0', desc: 'Strip old chrome from both shafts',                  daysAgo: 25, startHour: 8, hours: 6 },
        { worker: 3, item: '1', machine: 'GRIND-01', qty: '0', desc: 'Saturday overtime — pre-grind both shafts before plating', daysAgo: 22, startHour: 7, hours: 8, special: true },
        { worker: 3, item: '1', machine: 'GRIND-01', qty: '2', scrap: 1, desc: 'Roller shaft — final grind to Ø80h6',                daysAgo: 18, startHour: 8, hours: 5 },
      ],
    },
  ];
}

module.exports = { buildScenarios };
