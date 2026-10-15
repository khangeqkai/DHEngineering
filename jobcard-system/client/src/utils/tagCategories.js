// The option categories the Job Options page shows as tabs, plus Equipment
// (machines, kept in their own table and shown on their own page). Also names a
// tag's category in the page's activity log. `addLabel` is what the page's Add
// button says on that tab.
export const TAG_CATEGORY_INFO = {
  treatment: { label: 'Service', addLabel: 'Add service', description: 'Service options for parts. Used on job card parts and supplier services.' },
  material: { label: 'Material', addLabel: 'Add material', description: 'Material options for parts.' },
  customer_property: { label: 'Customer Property', addLabel: 'Add option', description: 'Types of customer property received with a job.' },
  drawings: { label: 'Drawings', addLabel: 'Add option', description: 'Drawing types associated with a job.' },
  job_type: { label: 'Job Type', addLabel: 'Add job type', description: 'Classification of the type of work.' },
  equipment: { label: 'Equipment', addLabel: 'Add machine', description: 'Machines and equipment used in time tracking.' }
};
