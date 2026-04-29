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

const uid = (prefix) => `${prefix}:${Date.now()}:${uuidv4().slice(0, 8)}`;

// ─── WIPE ALL TABLES ───
console.log('Wiping all data...');
const tables = [
  'history', 'qa_level_templates', 'qa_forms', 'documents', 'job_costings',
  'time_entries', 'subcontracts', 'job_notes', 'job_assignees', 'job_items',
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
  { id: uid('qalevel'), name: 'Standard', nameLower: 'standard', isActive: 1 },
  { id: uid('qalevel'), name: 'Critical', nameLower: 'critical', isActive: 1 },
];
const insertQALevel = db.prepare('INSERT INTO qa_levels (id, name, name_lower, is_active) VALUES (?, ?, ?, ?)');
for (const q of qaLevels) {
  insertQALevel.run(q.id, q.name, q.nameLower, q.isActive);
}
console.log(`Created ${qaLevels.length} QA levels.`);

// ─── JOB CARDS ───
console.log('Creating job cards...');

const statuses = ['QUOTE', 'OPEN', 'AWAITING_MATERIAL', 'IN_PROGRESS', 'TREATMENT', 'ON_HOLD', 'DONE', 'INVOICED'];
const priorities = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];
const drawingsTypes = tagData.drawings.map(tagValue);

const jobDescriptions = [
  { desc: 'Manufacture 4x hydraulic cylinder rods to drawing', items: [{ qty: '4', desc: 'Hydraulic cylinder rod Ø45x650mm', jobType: 'MANUFACTURE', material: 'STEEL', treatment: 'HEAT_TREATMENT' }] },
  { desc: 'Repair cracked pump housing — weld and re-machine', items: [{ qty: '1', desc: 'Pump housing repair — weld crack', jobType: 'REPAIR', material: 'CAST_IRON', treatment: 'BLASTING' }, { qty: '1', desc: 'Re-machine bore to Ø125H7', jobType: 'MODIFY', material: 'CAST_IRON', treatment: null }] },
  { desc: 'Fabricate structural mounting brackets for conveyor', items: [{ qty: '8', desc: 'Mounting bracket 150x100x12mm mild steel', jobType: 'FABRICATE', material: 'STEEL', treatment: 'GALVANISE' }] },
  { desc: 'Manufacture replacement gearbox shaft', items: [{ qty: '1', desc: 'Gearbox shaft EN19T Ø80x450mm', jobType: 'MANUFACTURE', material: 'STEEL', treatment: 'HEAT_TREATMENT,PRECISION_GRINDING' }] },
  { desc: 'Reverse engineer worn impeller and manufacture new', items: [{ qty: '2', desc: 'Pump impeller Ø280mm CF8M', jobType: 'REVERSE_ENGINEER', material: 'STAINLESS_STEEL', treatment: null }] },
  { desc: 'Modify existing flange to new bolt pattern', items: [{ qty: '3', desc: 'Flange modification — re-drill PCD', jobType: 'MODIFY', material: 'STEEL', treatment: null }] },
  { desc: 'Manufacture precision dowel pins', items: [{ qty: '20', desc: 'Dowel pin Ø10m6 x 40mm', jobType: 'MANUFACTURE', material: 'STEEL', treatment: 'HEAT_TREATMENT' }] },
  { desc: 'CNC machining of valve body — 5-axis work', items: [{ qty: '1', desc: 'Valve body 316SS per DWG-2024-089', jobType: 'MANUFACTURE', material: 'STAINLESS_STEEL', treatment: null }] },
  { desc: 'Fabricate and powder coat control panel enclosure', items: [{ qty: '1', desc: 'Enclosure 600x400x200mm 2mm MS', jobType: 'FABRICATE', material: 'STEEL', treatment: 'POWDERCOAT' }] },
  { desc: 'Manufacture wear plates for crusher', items: [{ qty: '6', desc: 'Wear plate 400BHN 300x200x25mm', jobType: 'MANUFACTURE', material: 'STEEL', treatment: null }] },
  { desc: 'Repair and re-chrome roller shaft', items: [{ qty: '1', desc: 'Roller shaft repair — chrome plating', jobType: 'REPAIR', material: 'STEEL', treatment: 'ELECTROPLATE' }] },
  { desc: 'Manufacture coupling adapter', items: [{ qty: '2', desc: 'Coupling adapter EN8 Ø150x120mm', jobType: 'MANUFACTURE', material: 'STEEL', treatment: null }] },
  { desc: 'Inspection and report on failed bearing housing', items: [{ qty: '1', desc: 'Bearing housing inspection — dimensional report', jobType: 'INSPECTION', material: null, treatment: null }] },
  { desc: 'Manufacture tooling jig for production line', items: [{ qty: '1', desc: 'Assembly jig — welded frame with machined locators', jobType: 'FABRICATE', material: 'STEEL', treatment: 'SPRAYPAINT' }] },
  { desc: 'Supply and machine bronze bushes', items: [{ qty: '10', desc: 'Bronze bush PB1 Ø50x40x30mm', jobType: 'SUPPLY', material: 'BRONZE', treatment: null }] },
  { desc: 'Emergency repair — conveyor drive shaft snapped', items: [{ qty: '1', desc: 'Drive shaft EN24T Ø100x1200mm — emergency', jobType: 'REPAIR', material: 'STEEL', treatment: 'HEAT_TREATMENT' }] },
  { desc: 'Anodise batch of aluminium housings', items: [{ qty: '25', desc: 'Housing 6082-T6 per DWG-2024-115', jobType: 'MANUFACTURE', material: 'ALUMINIUM', treatment: 'ANODISE' }] },
  { desc: 'Manufacture pipe spools to isometric drawing', items: [{ qty: '4', desc: 'Pipe spool 6" Sch40 CS — welded', jobType: 'FABRICATE', material: 'STEEL', treatment: 'BLASTING,SPRAYPAINT' }] },
  { desc: 'CAD drawing service — customer sketch to 3D model', items: [{ qty: '1', desc: 'CAD modelling and drawing production', jobType: 'CAD_DRAWINGS', material: null, treatment: null }] },
  { desc: 'On-site machining of turbine coupling face', items: [{ qty: '1', desc: 'On-site facing — portable lathe', jobType: 'ON_SITE', material: null, treatment: null }] },
];

const insertJobcard = db.prepare(`INSERT INTO jobcards (
  id, job_number, card_type, status, contact_id, contact_name, company_name,
  quality_level, qa_level_id, priority, drawings_type, customer_property,
  description, due_date, is_repeat_job, created_by, updated_by, created_at
) VALUES (?, ?, 'JOB_CARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const insertItem = db.prepare('INSERT INTO job_items (id, jobcard_id, item_number, qty, description, job_type, material, treatment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insertAssignee = db.prepare('INSERT INTO job_assignees (id, jobcard_id, user_id) VALUES (?, ?, ?)');
const insertNote = db.prepare('INSERT INTO job_notes (id, jobcard_id, user_id, user_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertTimeEntry = db.prepare(`INSERT INTO time_entries (id, jobcard_id, user_id, item_number, machine_number, qty, description, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const workerIds = users.filter(u => u.role === 'user').map(u => u.id);
const workerNames = users.filter(u => u.role === 'user').map(u => u.name);
const customerProps = tagData.customer_property.map(tagValue);

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => arr.sort(() => 0.5 - Math.random()).slice(0, n);

// Generate dates spread over last 60 days
const now = new Date();
const daysAgo = (d) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().split('T')[0];
};
const daysFromNow = (d) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split('T')[0];
};

const createJobs = db.transaction(() => {
  let jobNum = 1;

  for (let i = 0; i < 20; i++) {
    const jobId = uid('jobcard');
    const jobNumber = `DH-${String(jobNum++).padStart(5, '0')}`;
    const contact = contacts[i % contacts.length];
    const jobData = jobDescriptions[i];
    const status = statuses[i % statuses.length];
    const priority = priorities[i % priorities.length];
    const qaLevel = i % 5 === 0 ? qaLevels[1] : qaLevels[0]; // every 5th is Critical

    // Spread creation dates over last 45 days
    const createdDaysAgo = Math.floor(Math.random() * 45) + 5;
    const createdAt = new Date(now);
    createdAt.setDate(createdAt.getDate() - createdDaysAgo);

    // Due dates: some in the past (overdue), some in the future
    let dueDate;
    if (i < 4) {
      // Overdue
      dueDate = daysAgo(Math.floor(Math.random() * 10) + 1);
    } else if (status === 'DONE' || status === 'INVOICED') {
      dueDate = daysAgo(Math.floor(Math.random() * 20) + 5);
    } else {
      dueDate = daysFromNow(Math.floor(Math.random() * 30) + 3);
    }

    insertJobcard.run(
      jobId, jobNumber, status, contact.id, contact.contactName, contact.companyName,
      qaLevel.name.toUpperCase(), qaLevel.id, priority,
      pick(drawingsTypes), pick(customerProps),
      jobData.desc, dueDate, i % 7 === 0 ? 1 : 0,
      adminId, adminId, createdAt.toISOString()
    );

    // Line items
    jobData.items.forEach((item, idx) => {
      insertItem.run(uid('item'), jobId, idx + 1, item.qty, item.desc, item.jobType, item.material, item.treatment);
    });

    // Assign 1-3 workers
    const assigned = pickN([...workerIds], Math.floor(Math.random() * 3) + 1);
    for (const wId of assigned) {
      insertAssignee.run(uid('assignee'), jobId, wId);
    }

    // Add notes for in-progress/done jobs
    if (['IN_PROGRESS', 'TREATMENT', 'DONE', 'INVOICED'].includes(status)) {
      const workerIdx = Math.floor(Math.random() * workerNames.length);
      insertNote.run(uid('note'), jobId, workerIds[workerIdx], workerNames[workerIdx],
        pick([
          'Material received, starting setup.',
          'First-off inspection passed. Running batch.',
          'Waiting for heat treatment to come back.',
          'Completed machining, moving to finishing.',
          'Customer called — confirmed dimensions are correct.',
          'Machine issue on CNC-02, switched to CNC-01.',
          'Job complete, ready for QC check.',
        ]),
        createdAt.toISOString()
      );
    }

    // Add time entries for in-progress/done jobs
    if (['IN_PROGRESS', 'DONE', 'INVOICED'].includes(status)) {
      const numEntries = Math.floor(Math.random() * 3) + 1;
      for (let t = 0; t < numEntries; t++) {
        const workerId = pick(assigned);
        const startHour = 7 + Math.floor(Math.random() * 8);
        const duration = 1 + Math.floor(Math.random() * 4);
        const workDate = new Date(createdAt);
        workDate.setDate(workDate.getDate() + t + 1);
        const start = new Date(workDate);
        start.setHours(startHour, 0, 0, 0);
        const end = new Date(start);
        end.setHours(startHour + duration);

        insertTimeEntry.run(
          uid('timeentry'), jobId, workerId,
          String(1), pick(machines.map(m => m.number)),
          jobData.items[0].qty, jobData.items[0].desc,
          start.toISOString(), end.toISOString()
        );
      }
    }
  }

  // Update the job number counter
  settingsQueries.upsert.run('job_number_next', String(jobNum).padStart(5, '0'));
});

createJobs();
console.log('Created 20 job cards with items, assignees, notes, and time entries.');

// ─── SUPPLIER SERVICE TAGS ───
console.log('Linking suppliers to treatment tags...');
const insertServiceTag = db.prepare('INSERT OR IGNORE INTO supplier_service_tags (supplier_id, service_tag_id) VALUES (?, ?)');
// Bohler → Heat Treatment
insertServiceTag.run(suppliers[0].id, tagIds.treatment[0]);
// Robor → Galvanise
insertServiceTag.run(suppliers[1].id, tagIds.treatment[7]);
// SA Anodisers → Anodise
insertServiceTag.run(suppliers[2].id, tagIds.treatment[2]);
// Spray Tech → Powdercoat, Spraypaint
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
console.log('  - 2 QA levels (Standard, Critical)');
console.log('  - 20 job cards with items, assignees, notes, time entries');
console.log('  - Job numbering: DH-00001 to DH-00020, next: DH-00021');
