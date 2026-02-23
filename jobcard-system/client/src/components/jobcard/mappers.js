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
    description: e.description,
    startTime: e.startTime,
    endTime: e.endTime,
    isSpecialLabour: e.isSpecialLabour || false
  };
}

export function mapSubcontractFromApi(s) {
  return {
    id: s.id,
    supplierId: s.supplierId,
    supplierName: s.supplierName,
    dateSent: s.dateSent || '',
    dateExpected: s.dateExpected || '',
    dateReceived: s.dateReceived || '',
    status: s.status,
    notes: s.notes || ''
  };
}

export function mapQaFormFromApi(f) {
  return {
    id: f.id,
    formCode: f.formCode,
    formName: f.formName,
    status: f.status,
    printedAt: f.printedAt,
    scannedAt: f.scannedAt,
    notes: f.notes
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
    jobNumber: '',
    status: 'OPEN',
    contactId: '',
    contactName: '',
    companyName: '',
    contactPhone: '',
    contactEmail: '',
    qualityLevel: 'STANDARD',
    qaLevelId: null,
    jobType: '',
    priority: 'NONE',
    poNumber: '',
    quoteReference: '',
    drawingsType: 'NONE',
    customerProperty: '',
    description: '',
    dueDate: '',
    isRepeatJob: false,
    repeatJobReference: '',
    treatmentRequired: 'NONE',
    treatmentOther: '',
    notes: ''
  };
}

export function getDefaultTimeEntryForm() {
  return {
    itemNumber: '',
    machineNumber: '',
    qty: '',
    description: '',
    startTime: '',
    endTime: ''
  };
}

export function getDefaultSubcontractForm() {
  return {
    supplierId: '',
    dateSent: '',
    dateExpected: '',
    dateReceived: '',
    notes: '',
    status: 'PENDING'
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
