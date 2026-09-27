// Data mapping utilities for JobCardModal
// Consolidates API response to form state conversions

import { isSavedLineItem } from './jobCardValidation.mjs';

export function mapTimeEntryFromApi(e) {
  return {
    id: e.id,
    userId: e.userId,
    userName: e.userName,
    itemNumber: e.itemNumber,
    // The part's permanent id. item_number is only a display position derived from it,
    // so anything matching a block to a part should key off this.
    itemId: e.itemId,
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

export function mapLineItemFromApi(item) {
  return {
    id: item.id,
    itemNumber: item.itemNumber,
    // The part's position in the job's ordered list (1, 2, 3…) — the server
    // states it; nothing on screen recomputes it. null for a row the server
    // hasn't seen yet (there is none on a brand-new job's initial payload).
    position: item.position != null ? item.position : null,
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
    // Whether the job is invoiced and closed — the one flag jobLock.js's
    // isJobClosed() reads, the same one the server's closedJobGuard keys on. A
    // brand-new job is never closed; setFormDataFromJobCard (useJobCardForm.js)
    // carries the loaded job's real value once one exists.
    archived: false,
    companyId: '',
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
    // The worker's stored name, kept alongside workerId only so an edit on an
    // archived worker's block can still show who it is — the active-workers
    // dropdown won't carry them any more once they're archived, so this is the
    // fallback text (see TimeEntryForm.jsx).
    workerName: '',
    // The part this block belongs to, by its permanent id — never its
    // item_number, which is only a sort order the server owns and may have gaps.
    itemId: '',
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

// The form before the job's own pricing has arrived — every figure null, not a company
// default: the server is the only source of pricing figures (see
// mapCostingResponseToForm below). The Costing tab shows a "Loading pricing…"
// placeholder until costingLoaded, so this shape is never displayed, edited or saved.
export function getDefaultCostingForm() {
  return {
    labourHours: null,
    // The auto-tallied hours from logged time — shown as a reference and used as the
    // fallback when no manual override is in place.
    labourHoursCalculated: null,
    // True once the admin has typed their own labour hours over the calculated figure.
    labourHoursOverridden: false,
    labourRate: null,
    // The current company default — shown only as a "use default" convenience; the job's
    // rate (labourRate) is its own, seeded from this at creation.
    labourDefaultRate: null,
    // Overtime tiers — hours auto-split from logged time, each hand-overridable. Each
    // tier charges labourRate × its multiplier. The two overtime multipliers start on
    // the company setting (the *Calculated figure) and can be hand-overridden per job,
    // exactly like the hours.
    labourOt1Hours: null,
    labourOt1HoursCalculated: null,
    labourOt1Overridden: false,
    labourOt1Multiplier: null,
    labourOt1MultiplierCalculated: null,
    labourOt1MultiplierOverridden: false,
    labourOt2Hours: null,
    labourOt2HoursCalculated: null,
    labourOt2Overridden: false,
    labourOt2Multiplier: null,
    labourOt2MultiplierCalculated: null,
    labourOt2MultiplierOverridden: false,
    labourHolidayHours: null,
    labourHolidayHoursCalculated: null,
    labourHolidayOverridden: false,
    labourHolidayMultiplier: null,
    labourSpecialHours: null,
    labourSpecialRate: null,
    materialsCost: null,
    materialsProfitPercent: null,
    subcontractorCost: null,
    subcontractorProfitPercent: null,
    // Free-text note beside each manual cost line, saying what the cost covers.
    labourSpecialDescription: '',
    materialsDescription: '',
    subcontractorDescription: ''
  };
}

// The subset of a line item's own fields the server accepts, shared by the
// create payload below and the per-row instant-save writes in useInstantItems.js —
// one shape, so the two send paths can't quietly drift apart.
export function buildItemPayload(item) {
  return {
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
  };
}

// Build the job-card save payload the server expects from the open form. Customer
// details are only sent on a brand-new job (they're frozen and read-only once a job
// exists, and the server ignores them on edit anyway).
export function buildJobcardPayload({
  formData, contactFormData, assignees, validItems, canManage, isEdit, companyId, contactId,
  // Set only when the customer was picked from the autocomplete (not typed fresh) —
  // detailChanges (useContactSearch.js) names which of their stored details were
  // edited for this job, old -> new. With nobody picked, every field travels, same
  // as before. With somebody picked, only a field actually changed for this job is
  // sent; the rest are left out entirely so the server copies them from the saved
  // contact as-is (validateJobcardContactFields / POST /jobcards, server S3) —
  // picking a saved person is not a re-check of their stored phone/email.
  pickedPerson = null,
  detailChanges = {}
}) {
  return {
    status: formData.status,
    // The customer is settled once, when the job is created. The company name
    // isn't sent — the server takes it from the customer record so the job can
    // never be filed under a name that customer never had.
    ...(canManage && !isEdit && {
      companyId,
      contactId,
      // All three trimmed the same way before they travel — a pasted trailing
      // space on the phone or the name would otherwise sit in what's stored even
      // though the server's own optionalString check trims contactName itself;
      // optionalPhone does not trim, and optionalEmail's isEmail() check rejects
      // a trailing space outright, so email in particular needs this client-side.
      ...((!pickedPerson || detailChanges.contactName) && { contactName: contactFormData.contactName.trim() }),
      ...((!pickedPerson || detailChanges.phone) && { contactPhone: contactFormData.phone.trim() }),
      ...((!pickedPerson || detailChanges.email) && { contactEmail: (contactFormData.email || '').trim() }),
    }),
    qualityLevel: formData.qualityLevel,
    qaLevelId: formData.qaLevelId || null,
    priority: formData.priority,
    poNumber: formData.poNumber,
    quoteReference: formData.quoteReference,
    description: formData.description,
    dueDate: formData.dueDate,
    isRepeatJob: formData.isRepeatJob,
    // A previous-job reference only exists on a repeat job (the server holds the
    // same rule), so a reference typed before unticking the box never travels.
    repeatJobReference: formData.isRepeatJob ? formData.repeatJobReference : null,
    // Assignees and parts are only sent here on a brand-new job — there's nobody to
    // write to yet, so both travel in the create payload as a one-shot. On an
    // existing job each tick and each row edit already wrote itself through the
    // instant assignee/item routes, so sending either list again here would flatten
    // anything a timer credited, or another row's edit, since the screen loaded.
    ...(!isEdit && {
      assigneeIds: assignees.map(a => a.userId),
      items: validItems.map((item, idx) => ({
        // Send the line's saved id (only real, already-saved lines have an "item:" id)
        // so the server keeps each line's identity across the edit and a worker's
        // recorded time/scrap stays with the right line. New lines have a temporary
        // local id and are left without one so the server makes one.
        ...(isSavedLineItem(item) ? { id: item.id } : {}),
        itemNumber: item.itemNumber || idx + 1,
        ...buildItemPayload(item)
      }))
    })
  };
}

// Turn a costing response from the server into the costing form the sheet holds and
// edits — the one reply→form mapping. The server is the only source of pricing figures
// and every figure it sends is already filled in, so nothing here falls back to a
// default rate. Only the *Override fields may be null, meaning "follow the calculated
// figure", which is what the derived *Overridden flags capture.
export function mapCostingResponseToForm(costingRes) {
  return {
    labourHours: costingRes.labourHours,
    labourHoursCalculated: costingRes.labourHoursCalculated,
    labourHoursOverridden: costingRes.labourHoursOverride != null,
    labourRate: costingRes.labourRate,
    labourDefaultRate: costingRes.labourDefaultRate,
    labourOt1Hours: costingRes.labourOt1Hours,
    labourOt1HoursCalculated: costingRes.labourOt1HoursCalculated,
    labourOt1Overridden: costingRes.labourOt1Override != null,
    labourOt1Multiplier: costingRes.labourOt1Multiplier,
    labourOt1MultiplierCalculated: costingRes.labourOt1MultiplierCalculated,
    labourOt1MultiplierOverridden: costingRes.labourOt1MultiplierOverride != null,
    labourOt2Hours: costingRes.labourOt2Hours,
    labourOt2HoursCalculated: costingRes.labourOt2HoursCalculated,
    labourOt2Overridden: costingRes.labourOt2Override != null,
    labourOt2Multiplier: costingRes.labourOt2Multiplier,
    labourOt2MultiplierCalculated: costingRes.labourOt2MultiplierCalculated,
    labourOt2MultiplierOverridden: costingRes.labourOt2MultiplierOverride != null,
    labourHolidayHours: costingRes.labourHolidayHours,
    labourHolidayHoursCalculated: costingRes.labourHolidayHoursCalculated,
    labourHolidayOverridden: costingRes.labourHolidayOverride != null,
    labourHolidayMultiplier: costingRes.labourHolidayMultiplier,
    labourSpecialHours: costingRes.labourSpecialHours,
    labourSpecialRate: costingRes.labourSpecialRate,
    materialsCost: costingRes.materialsCost,
    materialsProfitPercent: costingRes.materialsProfitPercent,
    subcontractorCost: costingRes.subcontractorCost,
    subcontractorProfitPercent: costingRes.subcontractorProfitPercent,
    // The free-text note on each manual cost line ("what this covers").
    labourSpecialDescription: costingRes.labourSpecialDescription || '',
    materialsDescription: costingRes.materialsDescription || '',
    subcontractorDescription: costingRes.subcontractorDescription || ''
  };
}
