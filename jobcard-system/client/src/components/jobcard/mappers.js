// Data mapping utilities for JobCardModal
// Consolidates API response to form state conversions

export function mapTimeEntryFromApi(e) {
  return {
    id: e.id,
    userId: e.userId,
    userName: e.userName,
    itemNumber: e.itemNumber,
    machineNumber: e.machineNumber,
    qty: e.qty,
    scrapBinQty: e.scrapBinQty != null ? e.scrapBinQty : 0,
    scrapRecycleQty: e.scrapRecycleQty != null ? e.scrapRecycleQty : 0,
    firstOffInspection: e.firstOffInspection ?? null,
    inProcessValidation: e.inProcessValidation ?? null,
    measuringEquipmentVerification: e.measuringEquipmentVerification ?? null,
    equipmentChecks: e.equipmentChecks ?? null,
    equipmentChecksComments: e.equipmentChecksComments || '',
    description: e.description,
    startTime: e.startTime,
    endTime: e.endTime,
    isSpecialLabour: e.isSpecialLabour || false
  };
}

export function mapAssigneeFromApi(a) {
  return {
    userId: a.userId,
    userName: a.userName || a.username
  };
}

export function mapLineItemFromApi(item) {
  return {
    id: item.id,
    itemNumber: item.itemNumber,
    qty: item.qty || '',
    description: item.description || '',
    jobType: item.jobType || '',
    material: item.material || '',
    treatments: Array.isArray(item.treatments) ? item.treatments.map(mapTreatmentFromApi) : [],
    drawingsType: item.drawingsType || '',
    customerProperty: item.customerProperty || ''
  };
}

export function mapTreatmentFromApi(t) {
  return {
    value: t.value || '',
    otherText: t.otherText || '',
    supplierId: t.supplierId || '',
    supplierName: t.supplierName || ''
  };
}

export function getDefaultFormData() {
  return {
    jobNumber: '',
    status: 'OPEN',
    contactId: '',
    contactName: '',
    companyName: '',
    contactPhone: '',
    contactEmail: '',
    qualityLevel: 'STANDARD',
    qaLevelId: null,
    priority: 'NONE',
    poNumber: '',
    quoteReference: '',
    description: '',
    dueDate: '',
    isRepeatJob: false,
    repeatJobReference: ''
  };
}

// Convert a stored full ISO timestamp (UTC, e.g. "2025-06-04T04:30:00.000Z")
// into a value for a datetime-local input, shown in the browser's local time.
// Returns '' for empty/invalid input.
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Shift by the local offset so slicing yields local wall-clock, not UTC.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// Convert a datetime-local input value (bare local wall-clock, e.g.
// "2025-06-04T14:30") into a full ISO timestamp with time zone for storage.
// Returns null for empty/invalid input.
export function localInputToIso(localStr) {
  if (!localStr) return null;
  const d = new Date(localStr); // bare string is read as local time
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function getDefaultTimeEntryForm() {
  return {
    workerId: '',
    itemNumber: '',
    machineNumber: '',
    qty: '',
    scrapBinQty: '',
    scrapRecycleQty: '',
    firstOffInspection: null,
    inProcessValidation: null,
    measuringEquipmentVerification: null,
    equipmentChecks: null,
    equipmentChecksComments: '',
    description: '',
    startTime: '',
    endTime: ''
  };
}

export function getDefaultCostingForm() {
  return {
    labourHours: 0,
    labourRate: 0,
    labourSpecialHours: 0,
    labourSpecialRate: 0,
    materialsCost: 0,
    materialsProfitPercent: 100,
    subcontractorCost: 0,
    subcontractorProfitPercent: 0
  };
}
