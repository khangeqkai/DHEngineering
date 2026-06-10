/**
 * Seed script: Wipes all data and creates realistic mock data for DH Engineering.
 * Run: node server/scripts/seed-mock-data.js
 */

const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Set DATA_DIR before requiring database
process.env.DATA_DIR = path.join(__dirname, '..', '..', 'data');
const { db } = require('../src/db/connection');
require('../src/db/schema'); // run migrations so new columns exist before prepare
const { settingsQueries } = require('../src/db/queries/support');
const { seedHistory } = require('./seed-history');
const { buildScenarios } = require('./seed-scenarios');

const uid = (prefix) => `${prefix}:${uuidv4()}`;

// ─── WIPE ALL TABLES ───
console.log('Wiping all data...');
const tables = [
  'history', 'qa_level_templates', 'job_costings',
  'time_entries', 'job_notes', 'job_assignees', 'job_items',
  'jobcards', 'supplier_service_tags', 'tags', 'machines', 'suppliers',
  'contacts', 'users', 'qa_levels'
];

db.pragma('foreign_keys = OFF');
const wipe = db.transaction(() => {
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  // Reset autoincrement
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'history'").run();
  // Recreate supplier_service_tags to fix stale FK references
  db.prepare('DROP TABLE IF EXISTS supplier_service_tags').run();
  db.prepare(`CREATE TABLE supplier_service_tags (
    supplier_id TEXT NOT NULL,
    service_tag_id TEXT NOT NULL,
    PRIMARY KEY (supplier_id, service_tag_id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (service_tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )`).run();
});
wipe();
db.pragma('foreign_keys = ON');
console.log('All tables wiped.');

// ─── USERS ───
console.log('Creating users...');
const hashedPin = bcrypt.hashSync('1234', 10);

const users = [
  { id: uid('user'), username: 'admin', role: 'admin', name: 'David Henderson', email: 'david@dhengineering.co.za', employeeId: 'EMP001' },
  { id: uid('user'), username: 'jaco', role: 'admin', name: 'Jaco Van Der Merwe', email: 'jaco@dhengineering.co.za', employeeId: 'EMP002' },
  { id: uid('user'), username: 'sipho', role: 'user', name: 'Sipho Mkhize', email: null, employeeId: 'EMP003' },
  { id: uid('user'), username: 'thabo', role: 'user', name: 'Thabo Nkosi', email: null, employeeId: 'EMP004' },
  { id: uid('user'), username: 'pieter', role: 'user', name: 'Pieter Botha', email: null, employeeId: 'EMP005' },
  { id: uid('user'), username: 'mandla', role: 'user', name: 'Mandla Dlamini', email: null, employeeId: 'EMP006' },
  { id: uid('user'), username: 'johan', role: 'user', name: 'Johan Pretorius', email: null, employeeId: 'EMP007' },
];

const insertUser = db.prepare('INSERT INTO users (id, username, password, role, name, email, phone, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (const u of users) {
  insertUser.run(u.id, u.username, hashedPin, u.role, u.name, u.email, null, u.employeeId);
}
const adminId = users[0].id;
console.log(`Created ${users.length} users.`);

// ─── CONTACTS ───
console.log('Creating contacts...');
const contacts = [
  { id: uid('contact'), contactName: 'Mark Thompson', companyName: 'Sasol Synfuels', phone: '011 441 3111', email: 'mark.t@sasol.co.za', address: 'Secunda, Mpumalanga' },
  { id: uid('contact'), contactName: 'Linda Govender', companyName: 'Sappi Southern Africa', phone: '011 407 8111', email: 'linda.g@sappi.com', address: 'Braamfontein, Johannesburg' },
  { id: uid('contact'), contactName: 'André Wessels', companyName: 'Barloworld Equipment', phone: '011 929 0000', email: 'andre.w@barloworld.com', address: 'Isando, Johannesburg' },
  { id: uid('contact'), contactName: 'Nomsa Dube', companyName: 'Eskom Holdings', phone: '011 800 8111', email: 'nomsa.d@eskom.co.za', address: 'Megawatt Park, Sunninghill' },
  { id: uid('contact'), contactName: 'Francois Du Plessis', companyName: 'Anglo American Platinum', phone: '011 638 9111', email: 'francois.dp@angloamerican.com', address: 'Marshalltown, Johannesburg' },
  { id: uid('contact'), contactName: 'Rachel Naidoo', companyName: 'Mondi Group', phone: '011 994 5400', email: 'rachel.n@mondigroup.com', address: 'Rivonia, Sandton' },
  { id: uid('contact'), contactName: 'Willem Joubert', companyName: 'ArcelorMittal SA', phone: '016 889 9111', email: 'willem.j@arcelormittal.com', address: 'Vanderbijlpark, Gauteng' },
  { id: uid('contact'), contactName: 'Precious Mokoena', companyName: 'Transnet SOC', phone: '011 308 3000', email: 'precious.m@transnet.net', address: 'Carlton Centre, Johannesburg' },
  { id: uid('contact'), contactName: 'Gerhard Steyn', companyName: 'Denel SOC', phone: '012 671 2700', email: 'gerhard.s@denel.co.za', address: 'Centurion, Pretoria' },
  { id: uid('contact'), contactName: 'Busisiwe Khumalo', companyName: 'South32 Hillside Aluminium', phone: '035 901 3111', email: 'busi.k@south32.net', address: 'Richards Bay, KwaZulu-Natal' },
];

const insertContact = db.prepare('INSERT INTO contacts (id, contact_name, company_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)');
for (const c of contacts) {
  insertContact.run(c.id, c.contactName, c.companyName, c.phone, c.email, c.address);
}
console.log(`Created ${contacts.length} contacts.`);

// ─── SUPPLIERS ───
console.log('Creating suppliers...');
const suppliers = [
  { id: uid('supplier'), name: 'Bohler Uddeholm Africa', contactName: 'Stefan Kruger', phone: '011 571 2500', email: 'stefan@bohler.co.za', services: 'Heat treatment, tool steel supply' },
  { id: uid('supplier'), name: 'Robor Galvanizers', contactName: 'James Pillay', phone: '011 971 1600', email: 'james@robor.co.za', services: 'Hot-dip galvanizing' },
  { id: uid('supplier'), name: 'SA Anodisers', contactName: 'Chris Van Zyl', phone: '011 474 1555', email: 'chris@saanodisers.co.za', services: 'Anodising, hard anodising' },
  { id: uid('supplier'), name: 'Spray Tech Coatings', contactName: 'Mike Richards', phone: '011 824 3500', email: 'mike@spraytech.co.za', services: 'Powder coating, spray painting' },
  { id: uid('supplier'), name: 'Precision Grinding SA', contactName: 'Henk Smit', phone: '011 614 2000', email: 'henk@precisiongrinding.co.za', services: 'Surface grinding, cylindrical grinding' },
];

const insertSupplier = db.prepare('INSERT INTO suppliers (id, name, contact_name, contact_phone, contact_email, services) VALUES (?, ?, ?, ?, ?, ?)');
for (const s of suppliers) {
  insertSupplier.run(s.id, s.name, s.contactName, s.phone, s.email, s.services);
}
console.log(`Created ${suppliers.length} suppliers.`);

// ─── MACHINES ───
console.log('Creating machines...');
const machines = [
  { id: uid('machine'), number: 'CNC-01', name: 'Haas VF-2SS', description: 'CNC Vertical Mill' },
  { id: uid('machine'), number: 'CNC-02', name: 'Haas ST-20Y', description: 'CNC Lathe with Y-axis' },
  { id: uid('machine'), number: 'CNC-03', name: 'DMG Mori CMX 600V', description: 'CNC Vertical Machining Centre' },
  { id: uid('machine'), number: 'MILL-01', name: 'Bridgeport Series 1', description: 'Manual Milling Machine' },
  { id: uid('machine'), number: 'LATHE-01', name: 'Colchester Master 2500', description: 'Manual Lathe' },
  { id: uid('machine'), number: 'LATHE-02', name: 'Pinacho SE 200', description: 'Manual Lathe' },
  { id: uid('machine'), number: 'GRIND-01', name: 'Jones & Shipman 540', description: 'Surface Grinder' },
  { id: uid('machine'), number: 'WELD-01', name: 'Fronius TPS 320i', description: 'MIG/TIG Welder' },
  { id: uid('machine'), number: 'SAW-01', name: 'Bomar Ergonomic 320', description: 'Bandsaw' },
  { id: uid('machine'), number: 'DRILL-01', name: 'Alzmetall AB 40', description: 'Pillar Drill Press' },
];

const insertMachine = db.prepare('INSERT INTO machines (id, machine_number, name, description) VALUES (?, ?, ?, ?)');
for (const m of machines) {
  insertMachine.run(m.id, m.number, m.name, m.description);
}
console.log(`Created ${machines.length} machines.`);

// Must match seed-tags.js nameToValue: strips special chars, replaces spaces/slashes with _
const tagValue = (name) => name.toUpperCase().replace(/[\s/]+/g, '_').replace(/[^A-Z0-9_]/g, '');

// ─── TAGS ───
console.log('Creating tags...');
const tagData = {
  treatment: ['Heat Treatment', 'Precision Grinding', 'Anodise', 'Electroplate', 'Blasting', 'Powdercoat', 'Spraypaint', 'Galvanise', 'Specialised Coating'],
  material: ['Steel', 'Stainless Steel', 'Aluminium', 'Brass', 'Copper', 'Bronze', 'Cast Iron', 'Titanium', 'Plastic'],
  customer_property: ['N/A', 'Material Supplied', 'Damaged Or Worn Sample', 'Good Sample', 'Part For Repair', 'Part For Modification'],
  drawings: ['Customer CAD', 'Customer Sketch', 'DH CAD', 'DH Sketch', 'Prepare Sketch', 'Prepare CAD'],
  job_type: ['Manufacture', 'Repair', 'Modify', 'Fabricate', 'Supply', 'Reverse Engineer', 'Inspection', 'CAD Drawings', 'Consultation', 'On-Site'],
};

const insertTag = db.prepare('INSERT INTO tags (id, category, name, value, sort_order) VALUES (?, ?, ?, ?, ?)');
const tagIds = {};
let sortOrder = 0;
for (const [category, names] of Object.entries(tagData)) {
  tagIds[category] = [];
  for (const name of names) {
    const id = uid('tag');
    const value = tagValue(name);
    insertTag.run(id, category, name, value, sortOrder++);
    tagIds[category].push(id);
  }
}
console.log('Created tags.');

// ─── SETTINGS ───
console.log('Configuring settings...');
settingsQueries.upsert.run('company_name', 'DH Engineering');
settingsQueries.upsert.run('timezone', 'Africa/Johannesburg');
settingsQueries.upsert.run('job_number_prefix', 'DH-');
settingsQueries.upsert.run('job_number_next', '00001');
settingsQueries.upsert.run('inactivity_timeout_minutes', '5');
console.log('Settings configured (prefix: DH-, starting: 00001).');

// ─── QA LEVELS ───
console.log('Creating QA levels...');
const qaLevels = [
  { id: uid('qalevel'), name: 'Standard', nameLower: 'standard', isActive: 1, requireScannedForms: 0 },
  { id: uid('qalevel'), name: 'Critical', nameLower: 'critical', isActive: 1, requireScannedForms: 1 },
];
const insertQALevel = db.prepare('INSERT INTO qa_levels (id, name, name_lower, is_active, require_scanned_forms) VALUES (?, ?, ?, ?, ?)');
for (const q of qaLevels) {
  insertQALevel.run(q.id, q.name, q.nameLower, q.isActive, q.requireScannedForms);
}
console.log(`Created ${qaLevels.length} QA levels.`);

// ─── JOB CARDS ───
console.log('Creating job cards...');

const insertJobcard = db.prepare(`INSERT INTO jobcards (
  id, job_number, card_type, status, contact_id, contact_name, company_name,
  contact_phone, contact_email,
  quality_level, qa_level_id, priority, drawings_type, customer_property,
  quote_reference, po_number,
  description, due_date, is_repeat_job, created_by, updated_by, created_at,
  archived, invoiced_date
) VALUES (?, ?, 'JOB_CARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertItem = db.prepare('INSERT INTO job_items (id, jobcard_id, item_number, qty, description, job_type, material, treatments) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertAssignee = db.prepare('INSERT INTO job_assignees (id, jobcard_id, user_id) VALUES (?, ?, ?)');
const insertNote = db.prepare('INSERT INTO job_notes (id, jobcard_id, user_id, user_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertTimeEntry = db.prepare(`INSERT INTO time_entries (id, jobcard_id, user_id, item_id, machine_number, qty, scrap_qty, description, start_time, end_time, is_special_labour) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertCosting = db.prepare(`INSERT INTO job_costings (
  id, jobcard_id,
  labour_hours, labour_rate, labour_total,
  labour_special_hours, labour_special_rate, labour_special_total,
  materials_cost, materials_profit_percent, materials_total,
  subcontractor_cost, subcontractor_profit_percent, subcontractor_total,
  grand_total
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const workers = users.filter(u => u.role === 'user'); // 0=sipho, 1=thabo, 2=pieter, 3=mandla, 4=johan
const now = new Date();

function makeDate(daysAgo, hour = 8, minute = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const treatmentSupplierMap = {
  HEAT_TREATMENT: suppliers[0],     // Bohler
  PRECISION_GRINDING: suppliers[4], // Precision Grinding SA
  ANODISE: suppliers[2],            // SA Anodisers
  ELECTROPLATE: suppliers[2],
  BLASTING: suppliers[3],
  POWDERCOAT: suppliers[3],
  SPRAYPAINT: suppliers[3],
  GALVANISE: suppliers[1]           // Robor
};

function buildTreatments(treatmentStr) {
  if (!treatmentStr) return null;
  const values = treatmentStr.split(',').map(v => v.trim()).filter(Boolean);
  if (values.length === 0) return null;
  return JSON.stringify(values.map(value => {
    const sup = treatmentSupplierMap[value] || suppliers[0];
    return { value, otherText: '', supplierId: sup.id, supplierName: sup.name };
  }));
}

// 9 scenarios covering the full status progression — see seed-scenarios.js.
const scenarios = buildScenarios(contacts, qaLevels);

// Collected per-job metadata, handed to the activity-trail generator after all
// jobs are written so the seeded history matches the data exactly.
const jobsForHistory = [];

const createJobs = db.transaction(() => {
  let jobNum = 1;

  for (const s of scenarios) {
    const jobId = uid('jobcard');
    const jobNumber = `DH-${String(jobNum++).padStart(5, '0')}`;
    const createdAt = makeDate(s.daysAgoCreated, 8, 30).toISOString();
    const dueDate = (() => {
      const d = new Date(now);
      d.setDate(d.getDate() + s.daysFromNowDue);
      return d.toISOString().split('T')[0];
    })();
    const archived = s.status === 'INVOICED' ? 1 : 0;
    const invoicedDate = s.status === 'INVOICED'
      ? makeDate(s.invoicedDaysAgo, 16, 0).toISOString()
      : null;

    insertJobcard.run(
      jobId, jobNumber, s.status, s.contact.id, s.contact.contactName, s.contact.companyName,
      s.contact.phone, s.contact.email,
      s.qaLevel.name.toUpperCase(), s.qaLevel.id, s.priority,
      s.drawingsType, s.customerProperty,
      s.quoteReference || null, s.poNumber || null,
      s.description, dueDate, 0,
      adminId, adminId, createdAt,
      archived, invoicedDate
    );

    // Remember each line's id by its position number, so time entries can link to
    // the line itself rather than its fragile position number.
    const itemIdByNumber = {};
    s.items.forEach((item, idx) => {
      const itemId = uid('item');
      itemIdByNumber[idx + 1] = itemId;
      insertItem.run(itemId, jobId, idx + 1, item.qty, item.desc, item.jobType, item.material, buildTreatments(item.treatment));
    });

    for (const wIdx of s.assignees) {
      insertAssignee.run(uid('assignee'), jobId, workers[wIdx].id);
    }

    const noteHistory = [];
    for (const n of s.notes) {
      const noteAt = makeDate(n.daysAgo, 14, 0).toISOString();
      insertNote.run(uid('note'), jobId, workers[n.worker].id, workers[n.worker].name, n.text, noteAt);
      noteHistory.push({ workerId: workers[n.worker].id, workerName: workers[n.worker].name, text: n.text, at: noteAt });
    }

    // Sum completed labour hours (split regular/special) so seeded costing totals
    // line up with the read endpoint's live recompute.
    let regularHours = 0;
    let specialHours = 0;
    const timerHistory = [];
    for (const e of s.timeEntries) {
      let start, endIso;
      if (e.active) {
        start = new Date(now.getTime() - e.startMinutesAgo * 60 * 1000);
        endIso = null;
      } else {
        start = makeDate(e.daysAgo, e.startHour, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + e.hours);
        endIso = end.toISOString();
        if (e.special) specialHours += e.hours; else regularHours += e.hours;
      }
      insertTimeEntry.run(
        uid('timeentry'), jobId, workers[e.worker].id,
        itemIdByNumber[parseInt(e.item, 10)] || null, e.machine, e.qty, e.scrap || 0, e.desc,
        start.toISOString(), endIso,
        e.special ? 1 : 0
      );
      if (endIso) {
        timerHistory.push({ workerId: workers[e.worker].id, workerName: workers[e.worker].name, desc: e.desc, at: endIso });
      }
    }

    if (s.costing) {
      const c = s.costing;
      const labourRate = c.labourRate || 0;
      const labourTotal = regularHours * labourRate;
      const labourSpecialRate = c.labourSpecialRate || 0;
      const labourSpecialTotal = specialHours * labourSpecialRate;
      const materialsCost = c.materialsCost || 0;
      const materialsProfit = c.materialsProfitPercent || 0;
      const materialsTotal = materialsCost * (1 + materialsProfit / 100);
      const subcontractorCost = c.subcontractorCost || 0;
      const subcontractorProfit = c.subcontractorProfitPercent || 0;
      const subcontractorTotal = subcontractorCost * (1 + subcontractorProfit / 100);
      const grandTotal = labourTotal + labourSpecialTotal + materialsTotal + subcontractorTotal;
      insertCosting.run(
        uid('costing'), jobId,
        regularHours, labourRate, labourTotal,
        specialHours, labourSpecialRate, labourSpecialTotal,
        materialsCost, materialsProfit, materialsTotal,
        subcontractorCost, subcontractorProfit, subcontractorTotal,
        grandTotal
      );
    }

    jobsForHistory.push({
      id: jobId, jobNumber, status: s.status, description: s.description,
      createdAt, invoicedDate, notes: noteHistory, timers: timerHistory,
    });
  }

  settingsQueries.upsert.run('job_number_next', String(jobNum).padStart(5, '0'));
});

createJobs();
console.log(`Created ${scenarios.length} job cards covering QUOTE → OPEN → AWAITING_MATERIAL → IN_PROGRESS (mixed/active/two-item) → TREATMENT → DONE → INVOICED.`);

// ─── ACTIVITY HISTORY TRAIL ───
console.log('Generating activity history...');
const historyRows = seedHistory({
  db, adminId, adminName: users[0].name,
  users, contacts, suppliers, machines, qaLevels,
  jobs: jobsForHistory,
  setupAt: makeDate(40, 8, 0).toISOString(),
});
console.log(`Created ${historyRows} activity log entries.`);

// ─── SUPPLIER SERVICE TAGS ───
console.log('Linking suppliers to treatment tags...');
const insertServiceTag = db.prepare('INSERT OR IGNORE INTO supplier_service_tags (supplier_id, service_tag_id) VALUES (?, ?)');
// Bohler → Heat Treatment
insertServiceTag.run(suppliers[0].id, tagIds.treatment[0]);
// Robor → Galvanise
insertServiceTag.run(suppliers[1].id, tagIds.treatment[7]);
// SA Anodisers → Anodise, Electroplate
insertServiceTag.run(suppliers[2].id, tagIds.treatment[2]);
insertServiceTag.run(suppliers[2].id, tagIds.treatment[3]);
// Spray Tech → Blasting, Powdercoat, Spraypaint
insertServiceTag.run(suppliers[3].id, tagIds.treatment[4]);
insertServiceTag.run(suppliers[3].id, tagIds.treatment[5]);
insertServiceTag.run(suppliers[3].id, tagIds.treatment[6]);
// Precision Grinding → Precision Grinding
insertServiceTag.run(suppliers[4].id, tagIds.treatment[1]);
console.log('Supplier tags linked.');

console.log('\n✓ Mock data seeded successfully!');
console.log('  - 7 users (admin/1234, jaco/1234, sipho/1234, thabo/1234, pieter/1234, mandla/1234, johan/1234)');
console.log('  - 10 contacts (SA industrial companies)');
console.log('  - 5 suppliers');
console.log('  - 10 machines');
console.log('  - 2 QA levels (Standard, Critical — Critical requires scanned forms)');
console.log('  - 9 job cards: quote, open, awaiting-material, mixed-progress, active-timer, two-item-progress, treatment, done, invoiced+special');
console.log('  - Quote references on all jobs; PO numbers on post-quote jobs');
console.log('  - Scrap pieces recorded on several time entries');
console.log('  - Pricing on 4 jobs (in-progress, treatment, done, invoiced)');
console.log('  - Activity history backfilled for setup, jobs, notes, and timers');
console.log('  - Job numbering: DH-00001 to DH-00009, next: DH-00010');
