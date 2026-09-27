// The option categories the Tags & Equipment page shows as tabs, plus Equipment
// (machines, kept in their own table). Also names a tag's category in the page's
// activity log.
export const TAG_CATEGORY_INFO = {
  treatment: { label: 'Service', description: 'Service options for parts. Used on job card parts and supplier services.' },
  material: { label: 'Material', description: 'Material options for parts.' },
  customer_property: { label: 'Customer Property', description: 'Types of customer property received with a job.' },
  drawings: { label: 'Drawings', description: 'Drawing types associated with a job.' },
  job_type: { label: 'Job Type', description: 'Classification of the type of work.' },
  equipment: { label: 'Equipment', description: 'Machines and equipment used in time tracking.' }
};
