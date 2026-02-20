export const JOB_TYPES = [
  'MANUFACTURE', 'REPAIR', 'MODIFY', 'FABRICATE',
  'SUPPLY', 'REVERSE ENGINEER', 'INSPECTION', 'CAD DRAWINGS',
  'CONSULTATION', 'ON-SITE'
];

export const PRIORITY_OPTIONS = ['NONE', 'LOW', 'MEDIUM', 'HIGH'];

export const DRAWINGS_TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'CUSTOMER_CAD', label: 'Customer CAD' },
  { value: 'CUSTOMER_SKETCH', label: 'Customer Sketch' },
  { value: 'DH_CAD', label: 'DH CAD' },
  { value: 'DH_SKETCH', label: 'DH Sketch' },
  { value: 'PREPARE_SKETCH', label: 'Prepare Sketch' },
  { value: 'PREPARE_CAD', label: 'Prepare CAD' }
];

export const TREATMENT_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'HEAT_TREATMENT', label: 'Heat Treatment' },
  { value: 'PRECISION_GRINDING', label: 'Precision Grinding' },
  { value: 'ANODISE', label: 'Anodise' },
  { value: 'ELECTROPLATE', label: 'Electroplate' },
  { value: 'BLASTING', label: 'Blasting' },
  { value: 'POWDERCOAT', label: 'Powdercoat' },
  { value: 'SPRAYPAINT', label: 'Spraypaint' },
  { value: 'GALVANISE', label: 'Galvanise' },
  { value: 'SPECIALISED_COATING', label: 'Specialised Coating' },
  { value: 'OTHER', label: 'Other' }
];

export const CUSTOMER_PROPERTY_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'N/A', label: 'N/A' },
  { value: 'MATERIAL_SUPPLIED', label: 'Material Supplied' },
  { value: 'DAMAGED_WORN_SAMPLE', label: 'Damaged or Worn Sample' },
  { value: 'GOOD_SAMPLE', label: 'Good Sample' },
  { value: 'PART_FOR_REPAIR', label: 'Part for Repair' },
  { value: 'PART_FOR_MODIFICATION', label: 'Part for Modification' }
];

export const STATUS_OPTIONS = [
  { value: 'QUOTE', label: 'Quote' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' }
];

export const QA_FORM_OPTIONS = [
  { code: 'DHE-F39', name: 'Critical QA Inspection Form' },
  { code: 'DHE-F15', name: 'First Article Inspection' },
  { code: 'DHE-F09', name: 'Material Test Certificate' },
  { code: 'DHE-F43', name: 'Non-Conformance Report' }
];
