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
const refData = require('./seed-data');

const uid = (prefix) => `${prefix}:${uuidv4()}`;

// Give every reference record an id up front so the rest of the script can wire
// relationships (assignees, supplier links, treatment→supplier defaults) by id.
const users = refData.users.map(u => ({ ...u, id: uid('user') }));
const contacts = refData.contacts.map(c => ({ ...c, id: uid('contact') }));
const suppliers = refData.suppliers.map(s => ({ ...s, id: uid('supplier') }));
const machines = refData.machines.map(m => ({ ...m, id: uid('machine') }));
const qaLevels = refData.qaLevels.map(q => ({ ...q, id: uid('qalevel') }));

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

const insertUser = db.prepare('INSERT INTO users (id, username, password, role, name, email, phone, employee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (const u of users) {
  insertUser.run(u.id, u.username, hashedPin, u.role, u.name, u.email, null, u.employeeId);
}
const adminId = users[0].id;
console.log(`Created ${users.length} users.`);

// ─── CONTACTS ───
console.log('Creating contacts...');
const insertContact = db.prepare('INSERT INTO contacts (id, contact_name, company_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)');
for (const c of contacts) {
  insertContact.run(c.id, c.contactName, c.companyName, c.phone, c.email, c.address);
}
console.log(`Created ${contacts.length} contacts.`);

// ─── SUPPLIERS ───
console.log('Creating suppliers...');
const insertSupplier = db.prepare('INSERT INTO suppliers (id, name, contact_name, contact_phone, contact_email, services) VALUES (?, ?, ?, ?, ?, ?)');
for (const s of suppliers) {
  insertSupplier.run(s.id, s.name, s.contactName, s.phone, s.email, s.services);
}
console.log(`Created ${suppliers.length} suppliers.`);

// ─── MACHINES ───
console.log('Creating machines...');
const insertMachine = db.prepare('INSERT INTO machines (id, machine_number, name, description) VALUES (?, ?, ?, ?)');
for (const m of machines) {
  insertMachine.run(m.id, m.number, m.name, m.description);
}
console.log(`Created ${machines.length} machines.`);

// Must match seed-tags.js nameToValue: strips special chars, replaces spaces/slashes with _
const tagValue = (name) => name.toUpperCase().replace(/[\s/]+/g, '_').replace(/[^A-Z0-9_]/g, '');

// ─── TAGS ───
console.log('Creating tags...');
const tagData = refData.tagData;

const insertTag = db.prepare('INSERT INTO tags (id, category, name, value, sort_order) VALUES (?, ?, ?, ?, ?)');
const tagIds = {};
const treatmentTagIdByValue = {}; // treatment value → tag id, for supplier service links
let sortOrder = 0;
for (const [category, names] of Object.entries(tagData)) {
  tagIds[category] = [];
  for (const name of names) {
    const id = uid('tag');
    const value = tagValue(name);
    insertTag.run(id, category, name, value, sortOrder++);
    tagIds[category].push(id);
    if (category === 'treatment') treatmentTagIdByValue[value] = id;
  }
}
console.log('Created tags.');

// ─── SETTINGS ───
console.log('Configuring settings...');
for (const [key, val] of Object.entries(refData.settings)) {
  settingsQueries.upsert.run(key, val);
}
console.log(`Settings configured (prefix: ${refData.settings.job_number_prefix}, starting: ${refData.settings.job_number_next}).`);

// ─── QA LEVELS ───
console.log('Creating QA levels...');
const insertQALevel = db.prepare('INSERT INTO qa_levels (id, name, name_lower, is_active) VALUES (?, ?, ?, ?)');
for (const q of qaLevels) {
  insertQALevel.run(q.id, q.name, q.nameLower, q.isActive);
}
console.log(`Created ${qaLevels.length} QA levels.`);

// ─── JOB CARDS ───
console.log('Creating job cards...');

const insertJobcard = db.prepare(`INSERT INTO jobcards (
  id, job_number, card_type, status, contact_id, contact_name, company_name,
  contact_phone, contact_email,
  quality_level, qa_level_id, priority,
  quote_reference, po_number,
  description, due_date, is_repeat_job, created_by, updated_by, created_at,
  archived, invoiced_date
) VALUES (?, ?, 'JOB_CARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertItem = db.prepare('INSERT INTO job_items (id, jobcard_id, item_number, qty, description, job_type, material, treatments, drawings_type, customer_property) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
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

const workers = users.filter(u => u.role === 'user'); // floor staff, referenced by index in scenarios
const now = new Date();

function makeDate(daysAgo, hour = 8, minute = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Default supplier for each treatment = the first supplier whose `offers` lists it.
// Derived from one source of truth so it can never disagree with the service-tag links.
const treatmentSupplierMap = {};
for (const s of suppliers) {
  for (const t of s.offers || []) {
    if (!treatmentSupplierMap[t]) treatmentSupplierMap[t] = s;
  }
}
// Free-text "Other" treatments still need a supplier; use a specialised-coating shop.
const otherSupplier = treatmentSupplierMap.SPECIALISED_COATING || suppliers[0];

function buildTreatments(treatmentStr, otherText) {
  if (!treatmentStr) return null;
  const values = treatmentStr.split(',').map(v => v.trim()).filter(Boolean);
  if (values.length === 0) return null;
  return JSON.stringify(values.map(value => {
    const isOther = value === 'OTHER';
    const sup = isOther ? otherSupplier : (treatmentSupplierMap[value] || suppliers[0]);
    return {
      value,
      otherText: isOther ? (otherText || 'Special process per customer spec') : '',
      supplierId: sup.id,
      supplierName: sup.name,
    };
  }));
}

// Generated job set covering every status, job type, material, treatment, drawing,
// customer-property value, the repeat flag, and every priority — see seed-scenarios.js.
const scenarios = buildScenarios(contacts, qaLevels, {
  workerCount: workers.length,
  machineNumbers: machines.map(m => m.number),
});

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
      s.quoteReference || null, s.poNumber || null,
      s.description, dueDate, s.isRepeat ? 1 : 0,
      adminId, adminId, createdAt,
      archived, invoicedDate
    );

    // Remember each line's id by its position number, so time entries can link to
    // the line itself rather than its fragile position number.
    const itemIdByNumber = {};
    s.items.forEach((item, idx) => {
      const itemId = uid('item');
      itemIdByNumber[idx + 1] = itemId;
      insertItem.run(itemId, jobId, idx + 1, item.qty, item.desc, item.jobType, item.material, buildTreatments(item.treatment, item.treatmentOther), item.drawings || 'N_A', item.customerProperty || 'N_A');
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
console.log(`Created ${scenarios.length} job cards covering every status, job type, material, treatment, drawing, and customer-property value.`);

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
// Each supplier is linked to every treatment value listed in its `offers`.
for (const s of suppliers) {
  for (const t of s.offers || []) {
    const tagId = treatmentTagIdByValue[t];
    if (tagId) insertServiceTag.run(s.id, tagId);
  }
}
console.log('Supplier tags linked.');

const lastJob = `DH-${String(scenarios.length).padStart(5, '0')}`;
const nextJob = `DH-${String(scenarios.length + 1).padStart(5, '0')}`;
console.log('\n✓ Mock data seeded successfully!');
console.log(`  - ${users.length} users (all PIN 1234): ${users.map(u => u.username).join(', ')}`);
console.log(`  - ${contacts.length} contacts (Australian industrial companies across WA/NSW/VIC/QLD)`);
console.log(`  - ${suppliers.length} suppliers covering every treatment type`);
console.log(`  - ${machines.length} machines`);
console.log(`  - ${qaLevels.length} QA levels (${qaLevels.map(q => q.name).join(', ')})`);
console.log(`  - ${scenarios.length} job cards covering every status, job type, material, treatment, drawing, and customer-property value`);
console.log('  - Repeat-job flag, every priority (incl. None), and a free-text "Other" treatment all represented');
console.log('  - Quote references on all jobs; PO numbers on post-quote jobs');
console.log('  - Scrap pieces, a live running timer, and Saturday special labour recorded');
console.log('  - Pricing on in-progress, treatment, done, and invoiced jobs');
console.log('  - Activity history backfilled for setup, jobs, notes, and timers');
console.log(`  - Job numbering: DH-00001 to ${lastJob}, next: ${nextJob}`);
