const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  db,
  userQueries,
  customerQueries,
  supplierQueries,
  machineQueries,
  jobcardQueries,
  jobItemQueries,
  jobAssigneeQueries,
  subcontractQueries,
  timeEntryQueries,
  qaFormQueries,
  recordHistory,
  generateJobNumber
} = require('./database');

// Run database migrations for existing databases
function runMigrations() {
  console.log('Running migrations...');

  // Get existing columns in jobcards table
  const tableInfo = db.prepare("PRAGMA table_info(jobcards)").all();
  const existingColumns = tableInfo.map(col => col.name);

  // Migration: Add contact override fields to jobcards
  const contactColumns = ['contact_name', 'contact_phone', 'contact_email'];
  for (const col of contactColumns) {
    if (!existingColumns.includes(col)) {
      console.log(`  Adding column: jobcards.${col}`);
      db.exec(`ALTER TABLE jobcards ADD COLUMN ${col} TEXT`);
    }
  }

  console.log('Migrations complete');
}

async function initializeDatabase() {
  console.log('Initializing database...');

  // Run migrations for existing databases
  runMigrations();

  // Check if admin user exists
  const adminUser = userQueries.getByUsername.get('admin');

  if (!adminUser) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const adminId = `user:${uuidv4()}`;

    userQueries.create.run(
      adminId,
      'admin',
      hashedPassword,
      'admin',
      'Administrator',
      'admin@dhengineering.com',
      null,
      'EMP001'
    );

    recordHistory('user', adminId, 'create', null, 'system', null, {
      username: 'admin',
      role: 'admin',
      name: 'Administrator'
    });

    console.log('  Created default admin user (username: admin, password: admin123)');
  } else {
    console.log('  Admin user already exists');
  }

  // Initialize default settings
  const settingsStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  settingsStmt.run('company_name', 'DH Engineering');
  settingsStmt.run('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);

  console.log('Database initialization complete');
}

async function seedMockData() {
  console.log('\nSeeding mock data...');

  // Check if mock data already exists
  const existingCustomers = customerQueries.getAll.all();
  if (existingCustomers.length > 0) {
    console.log('  Mock data already exists, skipping...');
    return;
  }

  const hashedPassword = await bcrypt.hash('password123', 10);

  // ============================================
  // EMPLOYEES
  // ============================================
  console.log('  Creating employees...');
  const employees = [
    { id: `user:${uuidv4()}`, username: 'jsmith', name: 'John Smith', role: 'user', empId: 'EMP002', email: 'jsmith@dhengineering.com' },
    { id: `user:${uuidv4()}`, username: 'mwilson', name: 'Mike Wilson', role: 'user', empId: 'EMP003', email: 'mwilson@dhengineering.com' },
    { id: `user:${uuidv4()}`, username: 'sjohnson', name: 'Sarah Johnson', role: 'user', empId: 'EMP004', email: 'sjohnson@dhengineering.com' },
    { id: `user:${uuidv4()}`, username: 'dlee', name: 'David Lee', role: 'user', empId: 'EMP005', email: 'dlee@dhengineering.com' },
    { id: `user:${uuidv4()}`, username: 'abrown', name: 'Amy Brown', role: 'admin', empId: 'EMP006', email: 'abrown@dhengineering.com' },
  ];

  for (const emp of employees) {
    userQueries.create.run(emp.id, emp.username, hashedPassword, emp.role, emp.name, emp.email, null, emp.empId);
  }
  console.log(`    Created ${employees.length} employees`);

  // ============================================
  // CUSTOMERS
  // ============================================
  console.log('  Creating customers...');
  const customers = [
    { id: `customer:${uuidv4()}`, name: 'BHP Mining Services', contact: 'Peter Thompson', phone: '08 9234 5678', email: 'peter.t@bhp.com.au', address: '125 St Georges Terrace, Perth WA 6000', critical: true },
    { id: `customer:${uuidv4()}`, name: 'Rio Tinto Operations', contact: 'Susan Clarke', phone: '08 9327 2000', email: 'susan.clarke@riotinto.com', address: '152 St Georges Terrace, Perth WA 6000', critical: true },
    { id: `customer:${uuidv4()}`, name: 'Woodside Energy', contact: 'Mark Davidson', phone: '08 9348 4000', email: 'mark.davidson@woodside.com.au', address: 'Mia Yellagonga, Perth WA 6000', critical: true },
    { id: `customer:${uuidv4()}`, name: 'Austral Engineering', contact: 'James Wilson', phone: '08 9456 7890', email: 'james@australeng.com.au', address: '45 Industrial Drive, Welshpool WA 6106', critical: false },
    { id: `customer:${uuidv4()}`, name: 'Perth Mechanical Services', contact: 'Linda Chen', phone: '08 9321 4567', email: 'linda@perthmech.com.au', address: '78 Railway Parade, Bassendean WA 6054', critical: false },
    { id: `customer:${uuidv4()}`, name: 'Fortescue Metals Group', contact: 'Robert Hughes', phone: '08 6218 8888', email: 'robert.hughes@fmgl.com.au', address: '87 Adelaide Terrace, Perth WA 6000', critical: true },
    { id: `customer:${uuidv4()}`, name: 'Komatsu Australia', contact: 'Steve Martin', phone: '08 9340 5555', email: 'steve.martin@komatsu.com.au', address: '12 Freight Road, Welshpool WA 6106', critical: false },
    { id: `customer:${uuidv4()}`, name: 'Caterpillar WA', contact: 'Michelle Taylor', phone: '08 9413 7000', email: 'mtaylor@cat.com', address: '95 Hardey Road, Belmont WA 6104', critical: false },
  ];

  for (const cust of customers) {
    customerQueries.create.run(cust.id, cust.name, cust.contact, cust.phone, cust.email, cust.address, cust.critical ? 1 : 0, null);
  }
  console.log(`    Created ${customers.length} customers`);

  // ============================================
  // SUPPLIERS (Approved Supplier List)
  // ============================================
  console.log('  Creating suppliers...');
  const suppliers = [
    { id: `supplier:${uuidv4()}`, name: 'Heat Treatment Australia', contact: 'Gary White', phone: '08 9478 1234', email: 'gary@hta.com.au', services: 'Heat Treatment, Annealing, Hardening' },
    { id: `supplier:${uuidv4()}`, name: 'Perth Precision Grinding', contact: 'Neil Brown', phone: '08 9350 6789', email: 'neil@perthgrinding.com.au', services: 'Precision Grinding, Surface Grinding, Cylindrical Grinding' },
    { id: `supplier:${uuidv4()}`, name: 'Advanced Coatings WA', contact: 'Jenny Liu', phone: '08 9456 2345', email: 'jenny@advcoatings.com.au', services: 'Anodising, Electroplating, Specialised Coatings' },
    { id: `supplier:${uuidv4()}`, name: 'Blastrite Industries', contact: 'Tom Anderson', phone: '08 9367 8901', email: 'tom@blastrite.com.au', services: 'Blasting, Surface Preparation' },
    { id: `supplier:${uuidv4()}`, name: 'Superior Powdercoat', contact: 'Rachel Green', phone: '08 9249 5678', email: 'rachel@superiorpc.com.au', services: 'Powdercoating, Spraypaint, Industrial Coating' },
    { id: `supplier:${uuidv4()}`, name: 'Galvanising Services Australia', contact: 'Paul Davis', phone: '08 9434 9012', email: 'paul@gsa.com.au', services: 'Hot Dip Galvanising, Zinc Plating' },
    { id: `supplier:${uuidv4()}`, name: 'WA Laser Cutting', contact: 'Chris Wong', phone: '08 9478 3456', email: 'chris@walaser.com.au', services: 'Laser Cutting, Plasma Cutting, Waterjet' },
  ];

  for (const sup of suppliers) {
    supplierQueries.create.run(sup.id, sup.name, sup.contact, sup.phone, sup.email, null, sup.services, 1, null);
  }
  console.log(`    Created ${suppliers.length} suppliers`);

  // ============================================
  // MACHINES
  // ============================================
  console.log('  Creating machines...');
  const machines = [
    { id: `machine:${uuidv4()}`, number: 'CNC-01', name: 'Haas VF-2 CNC Mill', desc: 'Vertical Machining Center' },
    { id: `machine:${uuidv4()}`, number: 'CNC-02', name: 'Haas ST-20 CNC Lathe', desc: 'CNC Turning Center' },
    { id: `machine:${uuidv4()}`, number: 'CNC-03', name: 'DMG Mori NLX 2500', desc: 'CNC Turning Center' },
    { id: `machine:${uuidv4()}`, number: 'MILL-01', name: 'Bridgeport Manual Mill', desc: 'Manual Vertical Mill' },
    { id: `machine:${uuidv4()}`, number: 'MILL-02', name: 'Deckel FP4M', desc: 'Universal Milling Machine' },
    { id: `machine:${uuidv4()}`, number: 'LATHE-01', name: 'Colchester Master', desc: 'Manual Lathe' },
    { id: `machine:${uuidv4()}`, number: 'LATHE-02', name: 'Harrison M300', desc: 'Manual Lathe' },
    { id: `machine:${uuidv4()}`, number: 'GRIND-01', name: 'Jones & Shipman 540P', desc: 'Surface Grinder' },
    { id: `machine:${uuidv4()}`, number: 'WELD-01', name: 'Miller TIG Welder', desc: 'TIG Welding Station' },
    { id: `machine:${uuidv4()}`, number: 'WELD-02', name: 'Lincoln MIG Welder', desc: 'MIG Welding Station' },
  ];

  for (const m of machines) {
    machineQueries.create.run(m.id, m.number, m.name, m.desc);
  }
  console.log(`    Created ${machines.length} machines`);

  // ============================================
  // JOB CARDS
  // ============================================
  console.log('  Creating job cards...');

  const adminUser = userQueries.getByUsername.get('admin');
  const adminId = adminUser.id;

  // Helper to get date strings
  const today = new Date();
  const daysAgo = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
  };
  const daysFromNow = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const jobCards = [
    // Active Jobs - IN PROGRESS
    {
      type: 'JOB_CARD', status: 'IN_PROGRESS', customer: customers[0], quality: 'CRITICAL',
      jobType: 'MANUFACTURE', priority: 'HIGH', po: 'PO-BHP-2024-001', drawings: 'CUSTOMER_CAD',
      property: 'MATERIAL_SUPPLIED', desc: 'Manufacture 10x custom hydraulic cylinder shafts to drawing',
      due: daysFromNow(5), treatment: 'HEAT_TREATMENT,PRECISION_GRINDING',
      items: [{ qty: '10', desc: 'Hydraulic Cylinder Shaft - 316 Stainless Steel, 50mm OD x 400mm' }]
    },
    {
      type: 'JOB_CARD', status: 'IN_PROGRESS', customer: customers[1], quality: 'CRITICAL',
      jobType: 'REPAIR', priority: 'HIGH', po: 'PO-RIO-2024-089', drawings: 'DH_SKETCH',
      property: 'PART_FOR_REPAIR', desc: 'Repair worn drive shaft - build up and machine to original dimensions',
      due: daysFromNow(3), treatment: 'HEAT_TREATMENT',
      items: [{ qty: '1', desc: 'Drive Shaft Repair - Build up worn journal, machine to spec' }]
    },
    {
      type: 'JOB_CARD', status: 'IN_PROGRESS', customer: customers[3], quality: 'STANDARD',
      jobType: 'FABRICATE', priority: 'MEDIUM', po: 'AE-2024-156', drawings: 'CUSTOMER_SKETCH',
      property: 'NONE', desc: 'Fabricate mounting brackets for conveyor system',
      due: daysFromNow(7), treatment: 'GALVANISE',
      items: [
        { qty: '8', desc: 'Mounting Bracket Type A - 10mm plate, 150x100mm' },
        { qty: '4', desc: 'Mounting Bracket Type B - 12mm plate, 200x150mm' }
      ]
    },

    // Active Jobs - OPEN
    {
      type: 'JOB_CARD', status: 'OPEN', customer: customers[2], quality: 'CRITICAL',
      jobType: 'REVERSE ENGINEER', priority: 'MEDIUM', po: 'WS-PO-45678', drawings: 'DH_CAD',
      property: 'GOOD_SAMPLE', desc: 'Reverse engineer obsolete valve body - create CAD and manufacture',
      due: daysFromNow(14), treatment: 'NONE',
      items: [{ qty: '5', desc: 'Valve Body - Reverse engineered from sample, Brass' }]
    },
    {
      type: 'JOB_CARD', status: 'OPEN', customer: customers[4], quality: 'STANDARD',
      jobType: 'MODIFY', priority: 'LOW', po: 'PMS-2024-234', drawings: 'CUSTOMER_CAD',
      property: 'PART_FOR_MODIFICATION', desc: 'Modify existing flange - add extra bolt holes',
      due: daysFromNow(10), treatment: 'NONE',
      items: [{ qty: '2', desc: 'Flange Modification - Add 4x M12 holes on 150 PCD' }]
    },

    // ON HOLD
    {
      type: 'JOB_CARD', status: 'ON_HOLD', customer: customers[5], quality: 'CRITICAL',
      jobType: 'MANUFACTURE', priority: 'HIGH', po: 'FMG-2024-777', drawings: 'CUSTOMER_CAD',
      property: 'MATERIAL_SUPPLIED', desc: 'Manufacture wear liners - ON HOLD waiting for material delivery',
      due: daysFromNow(21), treatment: 'HEAT_TREATMENT',
      items: [
        { qty: '20', desc: 'Wear Liner Plate A - Hardox 450, 25mm thick' },
        { qty: '10', desc: 'Wear Liner Plate B - Hardox 450, 32mm thick' }
      ]
    },

    // DONE (ready for invoicing)
    {
      type: 'JOB_CARD', status: 'DONE', customer: customers[6], quality: 'STANDARD',
      jobType: 'SUPPLY', priority: 'NONE', po: 'KOM-2024-123', drawings: 'NONE',
      property: 'NONE', desc: 'Supply standard bolts and fasteners',
      due: daysAgo(2), treatment: 'NONE',
      items: [
        { qty: '100', desc: 'M16x60 Hex Bolt Grade 8.8 Zinc' },
        { qty: '100', desc: 'M16 Hex Nut Grade 8 Zinc' },
        { qty: '200', desc: 'M16 Flat Washer Zinc' }
      ]
    },
    {
      type: 'JOB_CARD', status: 'DONE', customer: customers[7], quality: 'STANDARD',
      jobType: 'INSPECTION', priority: 'NONE', po: 'CAT-INS-2024-05', drawings: 'CUSTOMER_CAD',
      property: 'GOOD_SAMPLE', desc: 'Dimensional inspection of machined components',
      due: daysAgo(1), treatment: 'NONE',
      items: [{ qty: '25', desc: 'Dimensional Inspection - CMM measurement and report' }]
    },

    // QUOTES
    {
      type: 'QUOTE', status: 'QUOTE', customer: customers[0], quality: 'CRITICAL',
      jobType: 'MANUFACTURE', priority: 'NONE', po: '', drawings: 'CUSTOMER_CAD',
      property: 'NONE', desc: 'Quote for batch of precision machined components',
      due: null, treatment: 'ANODISE',
      items: [
        { qty: '50', desc: 'Precision Pin - 6061 Aluminium, 12mm dia x 80mm' },
        { qty: '50', desc: 'Precision Bush - 6061 Aluminium, 25mm OD x 12mm ID x 30mm' }
      ]
    },
    {
      type: 'QUOTE', status: 'QUOTE', customer: customers[3], quality: 'STANDARD',
      jobType: 'FABRICATE', priority: 'NONE', po: '', drawings: 'PREPARE_CAD',
      property: 'NONE', desc: 'Quote for custom steel frame fabrication',
      due: null, treatment: 'POWDERCOAT',
      items: [{ qty: '1', desc: 'Steel Frame Assembly - 50x50 RHS, 2m x 1.5m x 1m' }]
    },

    // OVERDUE job
    {
      type: 'JOB_CARD', status: 'IN_PROGRESS', customer: customers[4], quality: 'STANDARD',
      jobType: 'REPAIR', priority: 'HIGH', po: 'PMS-URG-001', drawings: 'DH_SKETCH',
      property: 'DAMAGED_WORN_SAMPLE', desc: 'URGENT: Repair broken pump shaft',
      due: daysAgo(2), treatment: 'NONE',
      items: [{ qty: '1', desc: 'Pump Shaft Repair - Weld and machine worn areas' }]
    },
  ];

  for (const jc of jobCards) {
    const isQuote = jc.type === 'QUOTE';
    const jobNumber = generateJobNumber(isQuote);
    const id = `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;

    jobcardQueries.create.run(
      id, jobNumber, jc.type, jc.status, jc.customer.id,
      jc.quality, jc.jobType, jc.priority, jc.po || null, null,
      jc.drawings, jc.property, jc.desc, jc.due,
      0, null, jc.treatment, null, null, null,
      adminId, adminId
    );

    // Add line items
    for (let i = 0; i < jc.items.length; i++) {
      const item = jc.items[i];
      const itemId = `item:${Date.now()}:${uuidv4().slice(0, 8)}`;
      jobItemQueries.create.run(itemId, id, i + 1, item.qty, item.desc);
    }

    // Add assignees for non-quote jobs
    if (!isQuote && jc.status !== 'DONE') {
      const assigneeIds = employees.slice(0, Math.floor(Math.random() * 3) + 1).map(e => e.id);
      for (const empId of assigneeIds) {
        const assigneeId = `assignee:${Date.now()}:${uuidv4().slice(0, 8)}`;
        try {
          jobAssigneeQueries.create.run(assigneeId, id, empId);
        } catch (e) { /* ignore duplicate */ }
      }
    }

    // Add QA forms for critical jobs
    if (jc.quality === 'CRITICAL') {
      const qaForms = [
        { code: 'DHE-F39', name: 'Critical Parts Inspection & Test Plan' },
        { code: 'DHE-F15', name: 'Inwards Goods Inspection Sticker' },
        { code: 'DHE-F09', name: 'Inspection Report' },
        { code: 'DHE-F43', name: 'Hazard, Incident, Non-Conformance & Customer Complaint' }
      ];
      for (const form of qaForms) {
        const formId = `qaform:${Date.now()}:${uuidv4().slice(0, 8)}`;
        qaFormQueries.create.run(formId, id, form.code, form.name, 'PENDING');
      }
    }

    // Add some subcontracts for jobs with treatment
    if (jc.treatment && jc.treatment !== 'NONE' && !isQuote) {
      const treatments = jc.treatment.split(',');
      for (const t of treatments) {
        let supplier = null;
        if (t.includes('HEAT')) supplier = suppliers[0];
        else if (t.includes('GRINDING')) supplier = suppliers[1];
        else if (t.includes('ANODISE') || t.includes('ELECTROPLATE') || t.includes('COATING')) supplier = suppliers[2];
        else if (t.includes('BLAST')) supplier = suppliers[3];
        else if (t.includes('POWDER') || t.includes('SPRAY')) supplier = suppliers[4];
        else if (t.includes('GALVAN')) supplier = suppliers[5];

        if (supplier) {
          const subId = `subcontract:${Date.now()}:${uuidv4().slice(0, 8)}`;
          subcontractQueries.create.run(
            subId, id, supplier.id,
            jc.status === 'IN_PROGRESS' ? daysAgo(3) : null,
            jc.status === 'IN_PROGRESS' ? daysFromNow(2) : null,
            null, jc.status === 'IN_PROGRESS' ? 'SENT' : 'PENDING'
          );
        }
      }
    }

    // Add time entries for IN_PROGRESS jobs
    if (jc.status === 'IN_PROGRESS') {
      const numEntries = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < numEntries; i++) {
        const emp = employees[Math.floor(Math.random() * employees.length)];
        const machine = machines[Math.floor(Math.random() * machines.length)];
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 5));
        startDate.setHours(8 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);

        const endDate = new Date(startDate);
        endDate.setHours(endDate.getHours() + 1 + Math.floor(Math.random() * 4));

        const entryId = `timeentry:${Date.now()}:${uuidv4().slice(0, 8)}`;
        timeEntryQueries.create.run(
          entryId, id, emp.id,
          1, // item number
          machine.number,
          jc.items[0].qty,
          `Working on ${jc.items[0].desc.substring(0, 50)}`,
          startDate.toISOString(),
          endDate.toISOString(),
          1, 1, // equipment checks done, measuring done
          'OK', null, 'OK', null, // first off OK, in process OK
          1, 0, 0 // scrap all good
        );
      }
    }

    recordHistory('jobcard', id, 'create', adminId, 'Administrator', null, { jobNumber, status: jc.status });
  }

  console.log(`    Created ${jobCards.length} job cards`);
  console.log('\nMock data seeding complete!');
  console.log('\n========================================');
  console.log('  Test Accounts:');
  console.log('  - admin / admin123 (Administrator)');
  console.log('  - jsmith / password123 (User)');
  console.log('  - mwilson / password123 (User)');
  console.log('  - abrown / password123 (Admin)');
  console.log('========================================\n');
}

module.exports = { initializeDatabase, seedMockData };
