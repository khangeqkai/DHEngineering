// Tag-based options are now loaded dynamically from the database via useTags hook.
// These legacy exports are kept as empty fallbacks — components should use useTags() instead.

export const PRIORITY_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' }
];

export const STATUS_OPTIONS = [
  { value: 'QUOTE', label: 'Quote' },
  { value: 'OPEN', label: 'Open' },
  { value: 'AWAITING_MATERIAL', label: 'Material/Treatment' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
  { value: 'INVOICED', label: 'Invoiced' }
];

export const QA_FORM_OPTIONS = [
  { code: 'DHE-F39', name: 'Critical QA Inspection Form' },
  { code: 'DHE-F15', name: 'First Article Inspection' },
  { code: 'DHE-F09', name: 'Material Test Certificate' },
  { code: 'DHE-F43', name: 'Non-Conformance Report' }
];
