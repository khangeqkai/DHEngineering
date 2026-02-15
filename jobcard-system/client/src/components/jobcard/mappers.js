// Data mapping utilities for JobCardModal
// Consolidates repeated camelCase to snake_case conversions

export function mapTimeEntryFromApi(e) {
  return {
    id: e.id,
    user_id: e.userId,
    user_name: e.userName,
    item_number: e.itemNumber,
    machine_number: e.machineNumber,
    qty: e.qty,
    description: e.description,
    start_time: e.startTime,
    end_time: e.endTime,
    equipment_checks_done: e.equipmentChecksDone,
    measuring_verification_done: e.measuringVerificationDone,
    first_off_inspection: e.firstOffInspection,
    first_off_inspection_notes: e.firstOffInspectionNotes,
    in_process_validation: e.inProcessValidation,
    in_process_validation_notes: e.inProcessValidationNotes,
    scrap_all_good: e.scrapAllGood,
    scrap_recycle_inhouse_qty: e.scrapRecycleInhouseQty,
    scrap_recycle_bin_qty: e.scrapRecycleBinQty
  };
}

export function mapSubcontractFromApi(s) {
  return {
    id: s.id,
    supplier_id: s.supplierId || s.supplier_id,
    supplier_name: s.supplierName || s.supplier_name,
    date_sent: s.dateSent || s.date_sent || '',
    date_expected: s.dateExpected || s.date_expected || '',
    date_received: s.dateReceived || s.date_received || '',
    status: s.status,
    notes: s.notes || ''
  };
}

export function mapQaFormFromApi(f) {
  return {
    id: f.id,
    form_code: f.formCode,
    form_name: f.formName,
    status: f.status,
    printed_at: f.printedAt,
    scanned_at: f.scannedAt,
    notes: f.notes
  };
}

export function mapAssigneeFromApi(a) {
  return {
    user_id: a.userId,
    user_name: a.userName || a.username
  };
}

export function mapLineItemFromApi(item) {
  return {
    id: item.id,
    item_number: item.itemNumber,
    qty: item.qty || '',
    description: item.description || ''
  };
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatFileDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getDefaultFormData() {
  return {
    job_number: '',
    status: 'OPEN',
    contact_id: '',
    contact_name: '',
    company_name: '',
    contact_phone: '',
    contact_email: '',
    quality_level: 'STANDARD',
    job_type: '',
    priority: 'NONE',
    po_number: '',
    quote_reference: '',
    drawings_type: 'NONE',
    customer_property: '',
    description: '',
    due_date: '',
    is_repeat_job: false,
    repeat_job_reference: '',
    treatment_required: 'NONE',
    treatment_other: '',
    notes: ''
  };
}

export function getDefaultTimeEntryForm() {
  return {
    item_number: '',
    machine_number: '',
    qty: '',
    description: '',
    start_time: '',
    end_time: '',
    equipment_checks_done: false,
    measuring_verification_done: false,
    first_off_inspection: 'NOT_APPLICABLE',
    first_off_inspection_notes: '',
    in_process_validation: 'NOT_APPLICABLE',
    in_process_validation_notes: '',
    scrap_all_good: true,
    scrap_recycle_inhouse_qty: 0,
    scrap_recycle_bin_qty: 0
  };
}

export function getDefaultSubcontractForm() {
  return {
    supplier_id: '',
    date_sent: '',
    date_expected: '',
    date_received: '',
    notes: '',
    status: 'PENDING'
  };
}

export function getDefaultCostingForm() {
  return {
    labour_hours: 0,
    labour_rate: 0,
    labour_special_hours: 0,
    labour_special_rate: 0,
    materials_cost: 0,
    materials_profit_percent: 100,
    subcontractor_cost: 0,
    subcontractor_profit_percent: 0
  };
}

export function getDefaultCustomerFormData() {
  return {
    company_name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    is_critical_qa: false
  };
}
