/**
 * Static reference data for the seed script (Australian DH Engineering).
 *
 * Kept separate from the orchestrator so the main seed file stays under the
 * 600-line limit while the demo data set grows. Ids are assigned by the caller
 * (it owns the uid() helper), so each record here is plain data only.
 *
 * Suppliers carry an `offers` list of treatment tag VALUES they provide. The
 * orchestrator derives both the supplier↔treatment links and the
 * treatment→default-supplier map from this single source of truth, so the two
 * never drift apart.
 */

// ─── USERS: 2 admins + 10 floor workers (workers are indices 0-9 after filter) ───
const users = [
  { username: 'admin',   role: 'admin', name: 'David Henderson',    email: 'david@dhengineering.com.au',  employeeId: 'EMP001' },
  { username: 'sandra',  role: 'admin', name: 'Sandra Phillips',    email: 'sandra@dhengineering.com.au', employeeId: 'EMP002' },
  { username: 'liam',    role: 'user',  name: 'Liam Murphy',        email: null, employeeId: 'EMP003' },
  { username: 'jack',    role: 'user',  name: 'Jack Wilson',        email: null, employeeId: 'EMP004' },
  { username: 'ethan',   role: 'user',  name: 'Ethan Nguyen',       email: null, employeeId: 'EMP005' },
  { username: 'noah',    role: 'user',  name: 'Noah Kelly',         email: null, employeeId: 'EMP006' },
  { username: 'lachlan', role: 'user',  name: 'Lachlan Brown',      email: null, employeeId: 'EMP007' },
  { username: 'cooper',  role: 'user',  name: 'Cooper Walsh',       email: null, employeeId: 'EMP008' },
  { username: 'riley',   role: 'user',  name: 'Riley Jackson',      email: null, employeeId: 'EMP009' },
  { username: 'mason',   role: 'user',  name: 'Mason Tran',         email: null, employeeId: 'EMP010' },
  { username: 'tyler',   role: 'user',  name: 'Tyler Costa',        email: null, employeeId: 'EMP011' },
  { username: 'dylan',   role: 'user',  name: 'Dylan Papadopoulos', email: null, employeeId: 'EMP012' },
];

// ─── CONTACTS: 20 real Australian industrial customers across WA/NSW/VIC/QLD ───
const contacts = [
  // Western Australia (08)
  { contactName: 'Daniel Foster',   companyName: 'Rio Tinto Iron Ore',     phone: '08 9327 2000', email: 'daniel.foster@riotinto.com',      address: 'Central Park, Perth WA' },
  { contactName: 'Sarah Mitchell',  companyName: 'BHP',                    phone: '08 6321 4000', email: 'sarah.mitchell@bhp.com',          address: 'Brookfield Place, Perth WA' },
  { contactName: 'James Carter',    companyName: 'Fortescue Metals Group', phone: '08 6218 8888', email: 'james.carter@fmgl.com.au',        address: 'East Perth WA' },
  { contactName: 'Emma Robinson',   companyName: 'Roy Hill',               phone: '08 6242 0888', email: 'emma.robinson@royhill.com.au',    address: 'Perth WA' },
  { contactName: 'Michael Nguyen',  companyName: 'Woodside Energy',        phone: '08 9348 4000', email: 'michael.nguyen@woodside.com',     address: 'Mia Yellagonga, Perth WA' },
  { contactName: 'Olivia Turner',   companyName: 'Alcoa Australia',        phone: '08 9316 5111', email: 'olivia.turner@alcoa.com',         address: 'Kwinana WA' },
  { contactName: 'Ryan Walsh',      companyName: 'Monadelphous',           phone: '08 9329 1888', email: 'ryan.walsh@monadelphous.com.au',  address: 'Victoria Park WA' },
  { contactName: 'Chloe Adams',     companyName: 'Civmec',                 phone: '08 9437 6288', email: 'chloe.adams@civmec.com.au',       address: 'Henderson WA' },
  // New South Wales (02)
  { contactName: 'Matthew Cooper',  companyName: 'BlueScope Steel',        phone: '02 4275 7000', email: 'matthew.cooper@bluescope.com',    address: 'Port Kembla NSW' },
  { contactName: 'Jessica Hall',    companyName: 'InfraBuild',             phone: '02 4033 0500', email: 'jessica.hall@infrabuild.com',     address: 'Newcastle NSW' },
  { contactName: 'Andrew Scott',    companyName: 'Bradken',                phone: '02 4924 8200', email: 'andrew.scott@bradken.com',        address: 'Mayfield NSW' },
  { contactName: 'Lauren Young',    companyName: 'Downer Group',           phone: '02 9468 9700', email: 'lauren.young@downergroup.com',    address: 'North Ryde NSW' },
  { contactName: 'Nathan King',     companyName: 'Boral',                  phone: '02 9220 6300', email: 'nathan.king@boral.com.au',        address: 'North Sydney NSW' },
  // Victoria (03)
  { contactName: 'Hannah Wright',   companyName: 'Orica',                  phone: '03 9665 7111', email: 'hannah.wright@orica.com',         address: 'East Melbourne VIC' },
  { contactName: 'Joshua Green',    companyName: 'Incitec Pivot',          phone: '03 8695 4400', email: 'joshua.green@incitecpivot.com.au', address: 'Southbank VIC' },
  { contactName: 'Grace Edwards',   companyName: 'Visy Industries',        phone: '03 9518 6111', email: 'grace.edwards@visy.com.au',       address: 'Springvale VIC' },
  { contactName: 'Samuel Baker',    companyName: 'Alstom Transport',       phone: '03 9794 2222', email: 'samuel.baker@alstomgroup.com',    address: 'Dandenong VIC' },
  // Queensland (07)
  { contactName: 'Zoe Campbell',    companyName: 'Aurizon',                phone: '07 3019 9000', email: 'zoe.campbell@aurizon.com.au',     address: 'Brisbane QLD' },
  { contactName: 'Benjamin Ward',   companyName: 'Glencore Mount Isa',     phone: '07 4744 2011', email: 'benjamin.ward@glencore.com.au',   address: 'Mount Isa QLD' },
  { contactName: 'Isabella Reed',   companyName: 'Sandvik Mining',         phone: '07 3308 1900', email: 'isabella.reed@sandvik.com',       address: 'Heatherbrae QLD' },
];

// ─── SUPPLIERS: 10 Australian outside-service firms; `offers` = treatment values ───
const suppliers = [
  { name: 'Bodycote Australia',         contactName: 'Geoff Harris',  phone: '08 9350 5400', email: 'geoff@bodycote.com.au',       services: 'Heat treatment, metallurgical processing', offers: ['HEAT_TREATMENT'] },
  { name: 'Heat Treatment Australia',   contactName: 'Paul Jenkins',  phone: '07 3265 2000', email: 'paul@hta.net.au',             services: 'Heat treatment, hardening, tempering',     offers: ['HEAT_TREATMENT'] },
  { name: 'Industrial Galvanizers',     contactName: 'Tony Russo',    phone: '08 9456 3500', email: 'tony@indgalv.com.au',         services: 'Hot-dip galvanizing',                      offers: ['GALVANISE'] },
  { name: 'Precision Grinding Services', contactName: 'Wayne Carter', phone: '08 9248 7700', email: 'wayne@precisiongrind.com.au', services: 'Surface and cylindrical grinding',         offers: ['PRECISION_GRINDING'] },
  { name: 'Antec Anodising',            contactName: 'Sandra Lee',    phone: '08 9377 2400', email: 'sandra@antecanodising.com.au', services: 'Anodising, hard anodising',               offers: ['ANODISE'] },
  { name: 'Chrome Plating Australia',   contactName: 'Mark Davies',   phone: '03 9314 6100', email: 'mark@chromeplating.com.au',   services: 'Hard chrome, electroplating',              offers: ['ELECTROPLATE', 'SPECIALISED_COATING'] },
  { name: 'Blastone Surface Prep',      contactName: 'Craig Newman',  phone: '08 9244 9988', email: 'craig@blastone.com.au',       services: 'Abrasive blasting, surface preparation',   offers: ['BLASTING'] },
  { name: 'Australian Powder Coating',  contactName: 'Dean Foster',   phone: '08 9455 1200', email: 'dean@auspowdercoat.com.au',   services: 'Powder coating',                           offers: ['POWDERCOAT'] },
  { name: 'Pro Spray Finishes',         contactName: 'Luke Bennett',  phone: '02 9604 8800', email: 'luke@prospray.com.au',        services: 'Industrial spray painting, powder coating', offers: ['SPRAYPAINT', 'POWDERCOAT'] },
  { name: 'Hardchrome Engineering',     contactName: 'Scott Murray',  phone: '08 9410 2900', email: 'scott@hardchrome.com.au',     services: 'Hard chrome, grinding, specialised coatings', offers: ['ELECTROPLATE', 'PRECISION_GRINDING', 'SPECIALISED_COATING'] },
];

// ─── MACHINES: 12 (10 original + wire EDM + waterjet for more variety) ───
const machines = [
  { number: 'CNC-01',   name: 'Haas VF-2SS',          description: 'CNC Vertical Mill' },
  { number: 'CNC-02',   name: 'Haas ST-20Y',          description: 'CNC Lathe with Y-axis' },
  { number: 'CNC-03',   name: 'DMG Mori CMX 600V',     description: 'CNC Vertical Machining Centre' },
  { number: 'MILL-01',  name: 'Bridgeport Series 1',   description: 'Manual Milling Machine' },
  { number: 'LATHE-01', name: 'Colchester Master 2500', description: 'Manual Lathe' },
  { number: 'LATHE-02', name: 'Pinacho SE 200',        description: 'Manual Lathe' },
  { number: 'GRIND-01', name: 'Jones & Shipman 540',   description: 'Surface Grinder' },
  { number: 'WELD-01',  name: 'Fronius TPS 320i',      description: 'MIG/TIG Welder' },
  { number: 'SAW-01',   name: 'Bomar Ergonomic 320',   description: 'Bandsaw' },
  { number: 'DRILL-01', name: 'Alzmetall AB 40',       description: 'Pillar Drill Press' },
  { number: 'EDM-01',   name: 'Sodick AG400L',         description: 'Wire EDM' },
  { number: 'WJET-01',  name: 'Flow Mach 200',         description: 'Waterjet Cutter' },
];

// ─── QA LEVELS: only the extra levels someone creates. "Standard" is the baseline,
// not a row — a job is labelled STANDARD whenever no special level is chosen (qa_level_id
// NULL), so it's never seeded here. Whether a job needs a form is decided by whether the
// level has a form attached, not by any per-level flag. ───
const qaLevels = [
  { name: 'Critical',   nameLower: 'critical',   isActive: 1 },
];

// ─── TAGS: every dropdown/multi-select option the app supports ───
const tagData = {
  treatment: ['Heat Treatment', 'Precision Grinding', 'Anodise', 'Electroplate', 'Blasting', 'Powdercoat', 'Spraypaint', 'Galvanise', 'Specialised Coating'],
  material: ['Steel', 'Stainless Steel', 'Aluminium', 'Brass', 'Copper', 'Bronze', 'Cast Iron', 'Titanium', 'Plastic'],
  customer_property: ['N/A', 'Material Supplied', 'Damaged Or Worn Sample', 'Good Sample', 'Part For Repair', 'Part For Modification'],
  drawings: ['Customer CAD', 'Customer Sketch', 'DH CAD', 'DH Sketch', 'Prepare Sketch', 'Prepare CAD'],
  job_type: ['Manufacture', 'Repair', 'Modify', 'Fabricate', 'Supply', 'Reverse Engineer', 'Inspection', 'CAD Drawings', 'Consultation', 'On-Site'],
};

// ─── SETTINGS ───
const settings = {
  company_name: 'DH Engineering',
  timezone: 'Australia/Sydney',
  job_number_prefix: 'DH-',
  job_number_next: '00001',
  inactivity_timeout_minutes: '5',
};

module.exports = { users, contacts, suppliers, machines, qaLevels, tagData, settings };
