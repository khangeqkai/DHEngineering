import { formatDate as fmtDate, formatDateTime as fmtDateTime, todayIsoDate, formatHistoryValue } from './formatters';
import { roundTo } from '../../../server/src/shared/round';
import { STATUS_LABELS, PRIORITY_LABELS } from '../components/JobCardList.constants';
// Tag labels are now dynamic (DB-driven). For exports, convert values to readable labels.

// xlsx is a heavy library (~430 kB) but is only ever needed when the user
// actually exports a spreadsheet. Load it on demand (and cache the module) so it
// stays out of the initial app bundle and the app starts faster.
let xlsxPromise = null;
export function loadXlsx() {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
}

// ── Save helper ──────────────────────────────────────────────────────────────

export async function saveWorkbook(wb, defaultName) {
  const XLSX = await loadXlsx();
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

// A spreadsheet cell holds at most 32,767 characters, and the xlsx writer throws
// on anything longer — which lost the whole export over one job's long comment
// thread. Every text cell of every export passes through here, so a too-long
// value is cut short (and says so) instead.
const MAX_CELL_CHARS = 32767;
const CUT_MARKER = '… (cut short)';

function fitCell(value) {
  if (typeof value !== 'string' || value.length <= MAX_CELL_CHARS) return value;
  let kept = value.slice(0, MAX_CELL_CHARS - CUT_MARKER.length);
  // Don't leave half of a two-part character (an emoji) dangling at the cut.
  if (/[\uD800-\uDBFF]$/.test(kept)) kept = kept.slice(0, -1);
  return kept + CUT_MARKER;
}

export function buildSheet(XLSX, rows, columns) {
  const header = columns.map(c => c.label);
  const data = rows.map(row => columns.map(c => fitCell(c.value(row))));
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

// The local calendar day, not the UTC one — an export made in the morning in Australia
// would otherwise be filed under yesterday's date.
export function timestamp() {
  return todayIsoDate();
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function durationHrs(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end) - new Date(start);
  return roundTo(ms / 3600000, 2);
}

// ── Label lookup helpers ─────────────────────────────────────────────────────

function valueToLabel(val) {
  if (!val) return val;
  return val.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

// ── Tag label lookup (real names, not rebuilt from the stored value) ────────
//
// A stored option value like "PTFE_COATING" gets turned into "Ptfe Coating" by
// valueToLabel above, which is only ever a guess at the option's real name —
// wrong as soon as someone gives the option a name that doesn't title-case back
// to itself. These look the value up in the tag lists (loaded once per export,
// including archived options so a since-retired value still resolves) and only
// fall back to the rebuilt guess when the value isn't found there at all.
export function labelFromMap(map, value) {
  if (!value) return value;
  return map.get(value) || valueToLabel(value);
}

// Each side goes through formatHistoryValue, the same rule the Activity screens use,
// so a stored moment reads on the local clock and a status code as its label here too.
export function formatChangesText(changes) {
  if (!changes || typeof changes !== 'object') return '';
  return Object.entries(changes).map(([field, val]) => {
    if (val && typeof val === 'object' && ('from' in val || 'to' in val)) {
      const side = (v) => formatHistoryValue(field, v) ?? '(empty)';
      return `${field}: ${side(val.from)} → ${side(val.to)}`;
    }
    return `${field}: ${JSON.stringify(val)}`;
  }).join('; ');
}

// ── Column definitions per entity ────────────────────────────────────────────

const CONTACT_COLS = [
  { label: 'Company', value: r => r.companyName },
  { label: 'Contact Name', value: r => r.contactName },
  { label: 'Phone', value: r => r.phone },
  { label: 'Email', value: r => r.email },
  { label: 'Address', value: r => r.address },
  // Whether the customer is archived (shown with "Show archived" ticked).
  { label: 'Status', value: r => r.archived ? 'Archived' : 'Active' },
  { label: 'Notes', value: r => r.notes },
];

const SUPPLIER_COLS = [
  { label: 'Company Name', value: r => r.name },
  { label: 'Contact', value: r => r.contactName },
  { label: 'Phone', value: r => r.contactPhone },
  { label: 'Email', value: r => r.contactEmail },
  { label: 'Address', value: r => r.address },
  { label: 'Services', value: r => (r.serviceTags || []).map(t => t.name).join(', ') },
  { label: 'Status', value: r => r.active ? 'Active' : 'Archived' },
  { label: 'Notes', value: r => r.notes },
];

const USER_COLS = [
  { label: 'Username', value: r => r.username },
  { label: 'Display Name', value: r => r.name },
  { label: 'Email', value: r => r.email },
  { label: 'Role', value: r => r.role },
  { label: 'Status', value: r => r.active ? 'Active' : 'Archived' },
  { label: 'Created', value: r => fmtDateTime(r.createdAt) },
];

const ACTIVITY_COLS = [
  { label: 'Time', value: r => fmtDateTime(r.createdAt) },
  { label: 'User', value: r => r.userName },
  { label: 'Action', value: r => r.action },
  { label: 'Entity Type', value: r => r.entityType },
  { label: 'Entity ID', value: r => r.entityId },
  // A job's entries name the job; the trail itself stores only its internal id.
  { label: 'Job Number', value: r => r.jobNumber ?? '' },
  { label: 'Changes', value: r => formatChangesText(r.changes) },
];

// ── Page export functions ────────────────────────────────────────────────────

export async function exportContacts(contacts) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, contacts, CONTACT_COLS), 'Contacts');
  return saveWorkbook(wb, `Contacts_${timestamp()}.xlsx`);
}

export async function exportSuppliers(suppliers) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, suppliers, SUPPLIER_COLS), 'Suppliers');
  return saveWorkbook(wb, `Suppliers_${timestamp()}.xlsx`);
}

export async function exportUsers(users) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, users, USER_COLS), 'Users');
  return saveWorkbook(wb, `Users_${timestamp()}.xlsx`);
}

export async function exportActivityLog(activities) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, activities, ACTIVITY_COLS), 'Activity Log');
  return saveWorkbook(wb, `Activity_Log_${timestamp()}.xlsx`);
}

// ── Statistics Export ────────────────────────────────────────────────────────

const STATS_WORKER_COLS = [
  { label: 'Rank', value: r => r.rank || 1 },
  { label: 'Worker Name', value: r => r.userName },
  { label: 'Employee ID', value: r => r.employeeId },
  { label: 'Role', value: r => r.role },
  { label: 'Total Hours', value: r => r.totalHours },
  { label: 'Normal Hours', value: r => r.normalHours },
  { label: 'OT1 Hours', value: r => r.ot1Hours },
  { label: 'OT2 Hours', value: r => r.ot2Hours },
  { label: 'Holiday Hours', value: r => r.holidayHours },
  { label: 'Total OT Hours', value: r => r.totalOtHours },
  { label: 'Jobs Count', value: r => r.jobsCount },
  { label: 'Sessions Count', value: r => r.sessionsCount },
  { label: 'Parts Produced', value: r => r.partsProduced },
  { label: 'Scrap (Bin)', value: r => r.scrapBinQty },
  { label: 'Scrap (Recycle)', value: r => r.scrapRecycleQty },
  { label: 'Total Scrap', value: r => r.totalScrapQty },
  { label: 'Inspection Checks', value: r => r.qaChecks || 0 },
  { label: 'Avg Session (hrs)', value: r => r.avgSessionHours },
];

const STATS_TREND_COLS = [
  { label: 'Period', value: r => r.period },
  { label: 'Jobs Created', value: r => r.jobsCreated },
  { label: 'Jobs Completed', value: r => r.jobsCompleted },
  { label: 'On-Time Completed', value: r => r.onTimeCompleted },
  { label: 'Late Completed', value: r => r.lateCompleted },
  { label: 'On-Time Rate %', value: r => r.onTimeRate !== null ? `${r.onTimeRate}%` : '—' },
  { label: 'Total Hours', value: r => r.totalHours },
  { label: 'Parts Produced', value: r => r.partsProduced },
  { label: 'Scrap Recorded', value: r => r.scrapQty },
];

const STATS_MACHINE_COLS = [
  { label: 'Machine #', value: r => r.machineNumber },
  { label: 'Name', value: r => r.name },
  { label: 'Description', value: r => r.description },
  { label: 'Status', value: r => r.active ? 'Active' : 'Archived' },
  { label: 'Operating Hours', value: r => r.totalHours },
  { label: 'Time Sessions', value: r => r.sessionCount },
  { label: 'Parts Produced', value: r => r.partsProduced },
  { label: 'Scrap Qty', value: r => r.scrapQty },
];

const getStatsCustomerCols = (hasMoney) => [
  { label: 'Customer Name', value: r => r.companyName },
  { label: 'Total Jobs', value: r => r.jobsCount },
  { label: 'Completed Jobs', value: r => r.completedCount },
  { label: 'On-Time Rate %', value: r => r.onTimeRate !== null ? `${r.onTimeRate}%` : '—' },
  { label: 'Repeat Jobs', value: r => r.repeatCount },
  { label: 'Repeat %', value: r => `${r.repeatPercent}%` },
  { label: 'Labour Hours in Period', value: r => r.totalHours },
  ...(hasMoney ? [{ label: 'Invoiced Total ($)', value: r => r.invoicedTotal || 0 }] : []),
];

const STATS_DELAYED_COLS = [
  { label: 'Job #', value: r => r.jobNumber },
  { label: 'Customer', value: r => r.companyName },
  { label: 'Due Date', value: r => fmtDate(r.dueDate) },
  { label: 'Finish Date', value: r => fmtDate(r.finishDate) },
  { label: 'Days Late', value: r => r.daysLate },
  { label: 'Status', value: r => STATUS_LABELS[r.status] || r.status },
  { label: 'QA Level', value: r => r.qualityLevel },
];

// The invoiced-money column goes by the person's pricing access right now, not by
// whether the loaded figures happen to carry money — the same rule as the job-card
// export's Costing sheet — so figures loaded before a demotion can't export it.
export async function exportStatistics(data, canSeePricing) {
  if (!data) return false;
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();

  // Overview Summary Sheet
  const summaryRows = [
    ['Range', data.range?.label || 'All'],
    ['On-Time Delivery Rate', data.summary?.onTimeRate !== null && data.summary?.onTimeRate !== undefined ? `${data.summary.onTimeRate}%` : '—'],
    ['Completed Jobs in Period', data.summary?.completedJobsCount || 0],
    ['On-Time Finished Jobs', data.summary?.onTimeJobsCount || 0],
    ['Late Finished Jobs', data.summary?.lateJobsCount || 0],
    ['Average Days Late (when overdue)', `${data.summary?.avgDaysLate || 0} days`],
    ['Average Job Turnaround Time', `${data.summary?.avgTurnaroundDays || 0} days`],
    ['Total Workshop Labour Hours', `${data.summary?.totalWorkshopHours || 0} hrs`],
    ['Active Jobs (Live)', data.summary?.activeJobsCount || 0],
    ['In Progress Jobs', data.summary?.inProgressJobsCount || 0],
    ['Currently Overdue Active Jobs', data.summary?.overdueActiveJobsCount || 0],
    ['Total Jobs Created in Period', data.summary?.totalJobsCreated || 0],
    ['Total Good Parts Produced', data.summary?.totalPartsProduced || 0],
    ['Scrap (Bin)', data.summary?.totalScrapBin || 0],
    ['Scrap (Recycled)', data.summary?.totalScrapRecycle || 0],
    ['Total Scrap Recorded', data.summary?.totalScrap || 0],
    ['Scrap Rate', `${data.summary?.scrapRate || 0}%`],
    ['Repeat Jobs Rate', `${data.summary?.repeatRate || 0}%`],
    ['Inspection Checks Completed', data.summary?.totalInspectionChecks || 0],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet([['Metric', 'Value'], ...summaryRows]);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Overview');

  if (data.workerLeaderboard?.length) {
    XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, data.workerLeaderboard, STATS_WORKER_COLS), 'Workers');
  }

  if (data.periodTrends?.length) {
    XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, data.periodTrends, STATS_TREND_COLS), 'Period Trends');
  }

  if (data.machineUtilization?.length) {
    XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, data.machineUtilization, STATS_MACHINE_COLS), 'Machines');
  }

  if (data.customerRankings?.length) {
    XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, data.customerRankings, getStatsCustomerCols(!!canSeePricing)), 'Customers');
  }

  if (data.delayedJobsList?.length) {
    XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, data.delayedJobsList, STATS_DELAYED_COLS), 'Late Jobs');
  }

  const rangeSlug = (data.range?.preset || 'report').replace(/_/g, '-');
  return saveWorkbook(wb, `Workshop_Statistics_${rangeSlug}_${timestamp()}.xlsx`);
}
