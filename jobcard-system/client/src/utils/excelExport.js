import * as XLSX from 'xlsx';
import { api } from '../services/api';
// Tag labels are now dynamic (DB-driven). For exports, convert values to readable labels.

// ── Save helper ──────────────────────────────────────────────────────────────

export async function saveWorkbook(wb, defaultName) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  if (window.electronAPI?.saveFile) {
    const result = await window.electronAPI.saveFile(defaultName, buf);
    if (result.canceled) return 'canceled';
    return true;
  }

  // Web fallback — blob download
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

// ── Sheet builder helpers ────────────────────────────────────────────────────

function buildSheet(rows, columns) {
  const header = columns.map(c => c.label);
  const data = rows.map(row => columns.map(c => c.value(row)));
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Auto-width based on content
  ws['!cols'] = columns.map((c, i) => {
    const maxLen = data.reduce(
      (max, r) => Math.max(max, String(r[i] ?? '').length),
      c.label.length
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });

  return ws;
}

function timestamp() {
  return new Date().toISOString().slice(0, 10);
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-ZA');
}

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-ZA');
}

function durationHrs(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end) - new Date(start);
  return Math.round((ms / 3600000) * 100) / 100;
}

// ── Label lookup helpers ─────────────────────────────────────────────────────

function valueToLabel(val) {
  if (!val) return val;
  return val.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

function fmtCodeList(val) {
  if (!val) return '';
  return val.split(',').map(v => valueToLabel(v.trim())).join(', ');
}

function fmtDrawings(val) { return fmtCodeList(val); }
function fmtTreatment(val) { return fmtCodeList(val); }
function fmtCustomerProperty(val) { return fmtCodeList(val); }

// ── Column definitions per entity ────────────────────────────────────────────

const CONTACT_COLS = [
  { label: 'Company', value: r => r.companyName },
  { label: 'Contact Name', value: r => r.contactName },
  { label: 'Phone', value: r => r.phone },
  { label: 'Email', value: r => r.email },
  { label: 'Address', value: r => r.address },
  { label: 'Notes', value: r => r.notes },
];

const SUPPLIER_COLS = [
  { label: 'Company Name', value: r => r.name },
  { label: 'Contact', value: r => r.contactName },
  { label: 'Phone', value: r => r.contactPhone },
  { label: 'Email', value: r => r.contactEmail },
  { label: 'Address', value: r => r.address },
  { label: 'Services', value: r => (r.serviceTags || []).map(t => t.name).join(', ') },
  { label: 'Notes', value: r => r.notes },
];

const EQUIPMENT_COLS = [
  { label: 'Machine Number', value: r => r.machineNumber },
  { label: 'Name', value: r => r.name },
  { label: 'Description', value: r => r.description },
];

const USER_COLS = [
  { label: 'Username', value: r => r.username },
  { label: 'Display Name', value: r => r.name },
  { label: 'Email', value: r => r.email },
  { label: 'Role', value: r => r.role },
  { label: 'Status', value: r => r.active ? 'Active' : 'Inactive' },
  { label: 'Created', value: r => fmtDateTime(r.createdAt) },
];

function formatChangesText(changes) {
  if (!changes || typeof changes !== 'object') return '';
  return Object.entries(changes).map(([field, val]) => {
    if (val && typeof val === 'object' && ('from' in val || 'to' in val)) {
      return `${field}: ${val.from ?? ''} → ${val.to ?? ''}`;
    }
    return `${field}: ${JSON.stringify(val)}`;
  }).join('; ');
}

const ACTIVITY_COLS = [
  { label: 'Time', value: r => fmtDateTime(r.createdAt) },
  { label: 'User', value: r => r.userName },
  { label: 'Action', value: r => r.action },
  { label: 'Entity Type', value: r => r.entityType },
  { label: 'Entity ID', value: r => r.entityId },
  { label: 'Changes', value: r => formatChangesText(r.changes) },
];

const JOBCARD_SUMMARY_COLS = [
  { label: 'Job #', value: r => r.jobNumber },
  { label: 'Company', value: r => r.companyName || r.storedCompanyName },
  { label: 'Contact Name', value: r => r.contactName || r.storedContactName },
  { label: 'Contact Phone', value: r => r.contactPhone },
  { label: 'Contact Email', value: r => r.contactEmail },
  { label: 'Type', value: r => r.cardType },
  { label: 'Status', value: r => r.status },
  { label: 'Priority', value: r => r.priority },
  { label: 'QA Level', value: r => r.qualityLevel },
  { label: 'Due Date', value: r => fmtDate(r.dueDate) },
  { label: 'Description', value: r => r.description },
  { label: 'Assigned To', value: r => (r.assignees || []).map(a => a.userName || a.name).join(', ') },
  { label: 'Items', value: r => (r.items || []).map(it => `#${it.itemNumber}: ${it.description || ''}`).join(', ') },
  { label: 'PO Number', value: r => r.poNumber },
  { label: 'Job Type', value: r => r.jobType },
  { label: 'Drawings', value: r => fmtDrawings(r.drawingsType) },
  { label: 'Treatment', value: r => {
    const items = r.items || [];
    const all = [...new Set(items.flatMap(i => (i.treatment || '').split(',').filter(v => v && v !== 'NONE')))];
    return fmtTreatment(all.join(','));
  }},
  { label: 'Treatment Other', value: r => {
    const items = r.items || [];
    return items.map(i => i.treatmentOther).filter(Boolean).join(', ');
  }},
  { label: 'Customer Property', value: r => fmtCustomerProperty(r.customerProperty) },
  { label: 'Subcontractors', value: r => (r._subcontracts || []).map(s => s.supplierName).join(', ') },
  { label: 'Notes', value: r => (r._notes || []).map(n => n.text).join(' | ') },
  { label: 'Repeat Job', value: r => r.isRepeatJob ? 'Yes' : 'No' },
  { label: 'Repeat Job Ref', value: r => r.repeatJobReference },
  { label: 'Invoiced Date', value: r => fmtDate(r.invoicedDate) },
  { label: 'Created', value: r => fmtDateTime(r.createdAt) },
];

const TIME_ENTRY_COLS = [
  { label: 'Job #', value: r => r._jobNumber },
  { label: 'Worker', value: r => r.userName },
  { label: 'Item #', value: r => r.itemNumber },
  { label: 'Machine #', value: r => r.machineNumber },
  { label: 'Qty', value: r => r.qty },
  { label: 'Description', value: r => r.description },
  { label: 'Start', value: r => fmtDateTime(r.startTime) },
  { label: 'End', value: r => fmtDateTime(r.endTime) },
  { label: 'Duration (hrs)', value: r => durationHrs(r.startTime, r.endTime) },
  { label: 'Special Labour', value: r => r.isSpecialLabour ? 'Yes' : 'No' },
];

const SUBCONTRACT_COLS = [
  { label: 'Job #', value: r => r._jobNumber },
  { label: 'Supplier', value: r => r.supplierName },
  { label: 'Date Sent', value: r => fmtDate(r.dateSent) },
  { label: 'Date Expected', value: r => fmtDate(r.dateExpected) },
  { label: 'Date Received', value: r => fmtDate(r.dateReceived) },
  { label: 'Status', value: r => r.status },
  { label: 'Notes', value: r => r.notes },
];

const ITEM_COLS = [
  { label: 'Job #', value: r => r._jobNumber },
  { label: 'Item #', value: r => r.itemNumber },
  { label: 'Qty', value: r => r.qty },
  { label: 'Description', value: r => r.description },
];

const COSTING_COLS = [
  { label: 'Job #', value: r => r._jobNumber },
  { label: 'Labour Hours', value: r => r.labourHours },
  { label: 'Labour Rate', value: r => r.labourRate },
  { label: 'Labour Total', value: r => r.labourTotal },
  { label: 'Special Hours', value: r => r.labourSpecialHours },
  { label: 'Special Rate', value: r => r.labourSpecialRate },
  { label: 'Special Total', value: r => r.labourSpecialTotal },
  { label: 'Materials Cost', value: r => r.materialsCost },
  { label: 'Materials Markup %', value: r => r.materialsProfitPercent },
  { label: 'Materials Total', value: r => r.materialsTotal },
  { label: 'Subcontractor Cost', value: r => r.subcontractorCost },
  { label: 'Subcontractor Markup %', value: r => r.subcontractorProfitPercent },
  { label: 'Subcontractor Total', value: r => r.subcontractorTotal },
  { label: 'Grand Total', value: r => r.grandTotal },
];

// ── Page export functions ────────────────────────────────────────────────────

export function exportContacts(contacts) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(contacts, CONTACT_COLS), 'Contacts');
  return saveWorkbook(wb, `Contacts_${timestamp()}.xlsx`);
}

export function exportSuppliers(suppliers) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(suppliers, SUPPLIER_COLS), 'Suppliers');
  return saveWorkbook(wb, `Suppliers_${timestamp()}.xlsx`);
}

export function exportEquipment(machines) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(machines, EQUIPMENT_COLS), 'Equipment');
  return saveWorkbook(wb, `Equipment_${timestamp()}.xlsx`);
}

export function exportUsers(users) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(users, USER_COLS), 'Users');
  return saveWorkbook(wb, `Users_${timestamp()}.xlsx`);
}

export function exportActivityLog(activities) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(activities, ACTIVITY_COLS), 'Activity Log');
  return saveWorkbook(wb, `Activity_Log_${timestamp()}.xlsx`);
}

// ── Job Cards — shared multi-sheet builder ───────────────────────────────────

async function fetchInBatches(ids, fetcher, batchSize = 5) {
  const results = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fetcher));
    results.push(...batchResults);
  }
  return results;
}

async function buildJobCardWorkbook(cards, onProgress) {
  if (!cards.length) return false;

  const ids = cards.map(c => c.id);

  // Fetch full card details (list endpoint omits items/subcontracts)
  onProgress?.('Fetching job card details...');
  const fullCards = await fetchInBatches(ids, id =>
    api.getJobcard(id).catch(() => null)
  );
  const fullCardMap = {};
  for (const fc of fullCards) {
    if (fc) fullCardMap[fc.id] = fc;
  }
  const mergedCards = cards.map(c => fullCardMap[c.id] || c);

  onProgress?.('Fetching time entries...');
  const timeEntriesPerJob = await fetchInBatches(ids, id =>
    api.getTimeEntries(id).then(entries => ({ id, entries })).catch(() => ({ id, entries: [] }))
  );

  onProgress?.('Fetching costing...');
  const costingPerJob = await fetchInBatches(ids, id =>
    api.getCosting(id).then(costing => ({ id, costing })).catch(() => ({ id, costing: null }))
  );

  onProgress?.('Fetching notes...');
  const notesPerJob = await fetchInBatches(ids, id =>
    api.getJobNotes(id).then(notes => ({ id, notes })).catch(() => ({ id, notes: [] }))
  );

  const jobLookup = {};
  for (const c of mergedCards) jobLookup[c.id] = c.jobNumber;

  const notesByJob = {};
  for (const { id, notes } of notesPerJob) notesByJob[id] = notes;

  const enrichedCards = mergedCards.map(c => ({
    ...c,
    _subcontracts: c.subcontracts || [],
    _notes: notesByJob[c.id] || [],
  }));

  const allItems = [];
  for (const c of mergedCards) {
    for (const item of c.items || []) {
      allItems.push({ ...item, _jobNumber: c.jobNumber });
    }
  }

  const allTimeEntries = [];
  for (const { id, entries } of timeEntriesPerJob) {
    for (const e of entries) {
      allTimeEntries.push({ ...e, _jobNumber: jobLookup[id] });
    }
  }

  const allSubcontracts = [];
  for (const c of mergedCards) {
    for (const s of c.subcontracts || []) {
      allSubcontracts.push({ ...s, _jobNumber: c.jobNumber });
    }
  }

  const allCosting = [];
  for (const { id, costing } of costingPerJob) {
    if (costing) {
      allCosting.push({ ...costing, _jobNumber: jobLookup[id] });
    }
  }

  onProgress?.('Building workbook...');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(enrichedCards, JOBCARD_SUMMARY_COLS), 'Summary');
  XLSX.utils.book_append_sheet(wb, buildSheet(allItems, ITEM_COLS), 'Items');
  XLSX.utils.book_append_sheet(wb, buildSheet(allTimeEntries, TIME_ENTRY_COLS), 'Time Entries');
  XLSX.utils.book_append_sheet(wb, buildSheet(allSubcontracts, SUBCONTRACT_COLS), 'Subcontracts');
  XLSX.utils.book_append_sheet(wb, buildSheet(allCosting, COSTING_COLS), 'Costing');

  return wb;
}

export async function exportJobCardList(cards, onProgress) {
  const wb = await buildJobCardWorkbook(cards, onProgress);
  if (!wb) return false;
  return saveWorkbook(wb, `Job_Cards_${timestamp()}.xlsx`);
}

export async function exportJobCardsFull(onProgress) {
  onProgress?.('Fetching job cards...');
  const cards = await api.getJobcards();
  if (!cards.length) return false;

  const wb = await buildJobCardWorkbook(cards, onProgress);
  if (!wb) return false;
  return saveWorkbook(wb, `Job_Cards_Full_${timestamp()}.xlsx`);
}
