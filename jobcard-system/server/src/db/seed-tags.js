const { db } = require('./connection');

function nameToValue(name) {
  return name.toUpperCase().replace(/[\s/]+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

const insertTag = db.prepare(`
  INSERT OR IGNORE INTO tags (id, category, name, value, is_system, active, sort_order)
  VALUES (?, ?, ?, ?, 1, 1, ?)
`);

const seedTags = [
  { category: 'treatment', name: 'Heat Treatment' },
  { category: 'treatment', name: 'Precision Grinding' },
  { category: 'treatment', name: 'Anodise' },
  { category: 'treatment', name: 'Electroplate' },
  { category: 'treatment', name: 'Blasting' },
  { category: 'treatment', name: 'Powdercoat' },
  { category: 'treatment', name: 'Spraypaint' },
  { category: 'treatment', name: 'Galvanise' },
  { category: 'treatment', name: 'Specialised Coating' },

  { category: 'customer_property', name: 'N/A' },
  { category: 'customer_property', name: 'Material Supplied' },
  { category: 'customer_property', name: 'Damaged or Worn Sample' },
  { category: 'customer_property', name: 'Good Sample' },
  { category: 'customer_property', name: 'Part for Repair' },
  { category: 'customer_property', name: 'Part for Modification' },

  { category: 'drawings', name: 'Customer CAD' },
  { category: 'drawings', name: 'Customer Sketch' },
  { category: 'drawings', name: 'DH CAD' },
  { category: 'drawings', name: 'DH Sketch' },
  { category: 'drawings', name: 'Prepare Sketch' },
  { category: 'drawings', name: 'Prepare CAD' },

  { category: 'job_type', name: 'Manufacture' },
  { category: 'job_type', name: 'Repair' },
  { category: 'job_type', name: 'Modify' },
  { category: 'job_type', name: 'Fabricate' },
  { category: 'job_type', name: 'Supply' },
  { category: 'job_type', name: 'Reverse Engineer' },
  { category: 'job_type', name: 'Inspection' },
  { category: 'job_type', name: 'CAD Drawings' },
  { category: 'job_type', name: 'Consultation' },
  { category: 'job_type', name: 'On-Site' },
];

const categoryCounters = {};
for (const tag of seedTags) {
  categoryCounters[tag.category] = (categoryCounters[tag.category] || 0);
  const sortOrder = categoryCounters[tag.category]++;
  const value = nameToValue(tag.name);
  const id = `${tag.category}-${value.toLowerCase().replace(/_/g, '-')}`;
  try {
    insertTag.run(id, tag.category, tag.name, value, sortOrder);
  } catch (err) {
    // Tag might already exist, ignore
  }
}
