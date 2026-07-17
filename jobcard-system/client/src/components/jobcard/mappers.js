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
    endTime: e.endTime
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
    // The auto-tallied hours from logged time — shown as a reference and used as the
    // fallback when no manual override is in place.
    labourHoursCalculated: 0,
    // True once the admin has typed their own labour hours over the calculated figure.
    labourHoursOverridden: false,
    labourRate: 0,
    // The current company default — shown only as a "use default" convenience; the job's
    // rate (labourRate) is its own, seeded from this at creation.
    labourDefaultRate: 0,
    // Overtime tiers — hours auto-split from logged time, each hand-overridable. Each
    // tier charges labourRate × its multiplier. The two overtime multipliers start on
    // the company setting (the *Calculated figure) and can be hand-overridden per job,
    // exactly like the hours.
    labourOt1Hours: 0,
    labourOt1HoursCalculated: 0,
    labourOt1Overridden: false,
    labourOt1Multiplier: 1.5,
    labourOt1MultiplierCalculated: 1.5,
    labourOt1MultiplierOverridden: false,
    labourOt2Hours: 0,
    labourOt2HoursCalculated: 0,
    labourOt2Overridden: false,
    labourOt2Multiplier: 2,
    labourOt2MultiplierCalculated: 2,
    labourOt2MultiplierOverridden: false,
    labourHolidayHours: 0,
    labourHolidayHoursCalculated: 0,
    labourHolidayOverridden: false,
    labourHolidayMultiplier: 2.5,
    labourSpecialHours: 0,
    labourSpecialRate: 0,
    materialsCost: 0,
    materialsProfitPercent: 100,
    subcontractorCost: 0,
    subcontractorProfitPercent: 0,
    // True when the job is invoiced — costing is locked/frozen and can't be saved.
    frozen: false
  };
}

// Build the job-card save payload the server expects from the open form. Customer
// details are only sent on a brand-new job (they're frozen and read-only once a job
// exists, and the server ignores them on edit anyway).
export function buildJobcardPayload({ formData, contactFormData, assignees, validItems, canManage, isEdit, contactId }) {
  return {
    status: formData.status,
    ...(canManage && !isEdit && {
      contactId,
      contactName: contactFormData.contactName,
      companyName: contactFormData.companyName,
      contactPhone: contactFormData.phone,
      contactEmail: contactFormData.email,
    }),
    qualityLevel: formData.qualityLevel,
    qaLevelId: formData.qaLevelId || null,
    priority: formData.priority,
    poNumber: formData.poNumber,
    quoteReference: formData.quoteReference,
    description: formData.description,
    dueDate: formData.dueDate,
    isRepeatJob: formData.isRepeatJob,
    repeatJobReference: formData.repeatJobReference,
    assigneeIds: assignees.map(a => a.userId),
    items: validItems.map((item, idx) => ({
      // Send the line's saved id (only real, already-saved lines have an "item:" id)
      // so the server keeps each line's identity across the edit and a worker's
      // recorded time/scrap stays with the right line. New lines have a temporary
      // local id and are left without one so the server makes one.
      ...(typeof item.id === 'string' && item.id.startsWith('item:') ? { id: item.id } : {}),
      itemNumber: item.itemNumber || idx + 1,
      qty: item.qty,
      description: item.description,
      jobType: item.jobType || null,
      material: item.material || null,
      treatments: (item.treatments || []).map(t => ({
        value: t.value,
        supplierId: t.supplierId || '',
        supplierName: t.supplierName || ''
      })),
      drawingsType: item.drawingsType || null,
      customerProperty: item.customerProperty || null
    }))
  };
}

// Turn a costing response from the server into the plain data object the job card
// modal holds and feeds to the costing hook. One place, so the modal's initial load
// and its post-save refresh can't drift apart.
export function mapCostingResponseToData(costingRes) {
  return {
    labourHours: costingRes.labourHours || 0,
    labourHoursCalculated: costingRes.labourHoursCalculated || 0,
    labourHoursOverride: costingRes.labourHoursOverride ?? null,
    labourRate: costingRes.labourRate || 0,
    labourDefaultRate: costingRes.labourDefaultRate || 0,
    labourOt1Hours: costingRes.labourOt1Hours || 0,
    labourOt1HoursCalculated: costingRes.labourOt1HoursCalculated || 0,
    labourOt1Override: costingRes.labourOt1Override ?? null,
    labourOt1Multiplier: costingRes.labourOt1Multiplier ?? 1.5,
    labourOt1MultiplierCalculated: costingRes.labourOt1MultiplierCalculated ?? 1.5,
    labourOt1MultiplierOverride: costingRes.labourOt1MultiplierOverride ?? null,
    labourOt2Hours: costingRes.labourOt2Hours || 0,
    labourOt2HoursCalculated: costingRes.labourOt2HoursCalculated || 0,
    labourOt2Override: costingRes.labourOt2Override ?? null,
    labourOt2Multiplier: costingRes.labourOt2Multiplier ?? 2,
    labourOt2MultiplierCalculated: costingRes.labourOt2MultiplierCalculated ?? 2,
    labourOt2MultiplierOverride: costingRes.labourOt2MultiplierOverride ?? null,
    labourHolidayHours: costingRes.labourHolidayHours || 0,
    labourHolidayHoursCalculated: costingRes.labourHolidayHoursCalculated || 0,
    labourHolidayOverride: costingRes.labourHolidayOverride ?? null,
    labourHolidayMultiplier: costingRes.labourHolidayMultiplier ?? 2.5,
    labourSpecialHours: costingRes.labourSpecialHours || 0,
    labourSpecialRate: costingRes.labourSpecialRate || 0,
    materialsCost: costingRes.materialsCost || 0,
    materialsProfitPercent: costingRes.materialsProfitPercent ?? 100,
    subcontractorCost: costingRes.subcontractorCost || 0,
    subcontractorProfitPercent: costingRes.subcontractorProfitPercent ?? 0,
    frozen: costingRes.frozen || false
  };
}
