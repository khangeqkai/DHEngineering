const { splitHours } = require('../utils/overtimeSplit');

function makeDateFormatter(timeZone) {
  const opts = {
    hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  };
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', ...opts });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...opts });
  }
}

function getLocalDateString(fmt, date) {
  try {
    const parts = fmt.formatToParts(date);
    const get = (t) => parts.find(p => p.type === t)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Calculate preset date ranges based strictly on the shop's local calendar
function calculateDateRange(preset, customStart, customEnd, timezone) {
  const fmt = makeDateFormatter(timezone);
  const now = new Date();
  const parts = fmt.formatToParts(now);
  const get = (t) => parseInt(parts.find(p => p.type === t)?.value, 10);

  const curYear = get('year');
  const curMonth = get('month'); // 1-12
  const curDay = get('day');
  const todayYmd = `${curYear}-${pad2(curMonth)}-${pad2(curDay)}`;

  if (preset === 'custom') {
    const validStart = customStart && /^\d{4}-\d{2}-\d{2}$/.test(String(customStart).trim()) && !isNaN(Date.parse(String(customStart).trim()))
      ? String(customStart).trim()
      : null;
    const validEnd = customEnd && /^\d{4}-\d{2}-\d{2}$/.test(String(customEnd).trim()) && !isNaN(Date.parse(String(customEnd).trim()))
      ? String(customEnd).trim()
      : null;

    let startDate = validStart;
    let endDate = validEnd;
    let label = 'Custom Range';

    if (validStart && validEnd) {
      label = `${validStart} to ${validEnd}`;
    } else if (validStart && !validEnd) {
      endDate = todayYmd;
      label = `${validStart} to ${todayYmd}`;
    } else if (!validStart && validEnd) {
      label = `Up to ${validEnd}`;
    } else {
      // Fall back to current month bounded dates when custom range is completely empty
      startDate = `${curYear}-${pad2(curMonth)}-01`;
      endDate = todayYmd;
      const monthName = new Date(curYear, curMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
      label = `Custom (${monthName})`;
    }

    return { startDate, endDate, label };
  }

  if (preset === 'last_month') {
    let prevYear = curYear;
    let prevMonth = curMonth - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();
    const start = `${prevYear}-${pad2(prevMonth)}-01`;
    const end = `${prevYear}-${pad2(prevMonth)}-${pad2(daysInPrevMonth)}`;
    const monthName = new Date(prevYear, prevMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    return { startDate: start, endDate: end, label: monthName };
  }

  if (preset === 'last_3_months') {
    let startYear = curYear;
    let startMonth = curMonth - 2;
    if (startMonth <= 0) {
      startMonth += 12;
      startYear -= 1;
    }
    return {
      startDate: `${startYear}-${pad2(startMonth)}-01`,
      endDate: todayYmd,
      label: 'Last 3 Months'
    };
  }

  if (preset === 'last_6_months') {
    let startYear = curYear;
    let startMonth = curMonth - 5;
    if (startMonth <= 0) {
      startMonth += 12;
      startYear -= 1;
    }
    return {
      startDate: `${startYear}-${pad2(startMonth)}-01`,
      endDate: todayYmd,
      label: 'Last 6 Months'
    };
  }

  if (preset === 'this_year') {
    return {
      startDate: `${curYear}-01-01`,
      endDate: todayYmd,
      label: `${curYear} (YTD)`
    };
  }

  if (preset === 'last_year') {
    return {
      startDate: `${curYear - 1}-01-01`,
      endDate: `${curYear - 1}-12-31`,
      label: `${curYear - 1}`
    };
  }

  if (preset === 'all') {
    return {
      startDate: null,
      endDate: null,
      label: 'All Time'
    };
  }

  // Default: 'this_month'
  const monthName = new Date(curYear, curMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  return {
    startDate: `${curYear}-${pad2(curMonth)}-01`,
    endDate: todayYmd,
    label: monthName
  };
}

function daysDiff(d1Str, d2Str) {
  if (!d1Str || !d2Str) return 0;
  const d1 = new Date(String(d1Str).slice(0, 10));
  const d2 = new Date(String(d2Str).slice(0, 10));
  const t1 = d1.getTime();
  const t2 = d2.getTime();
  if (isNaN(t1) || isNaN(t2)) return 0;
  return Math.round((t1 - t2) / (1000 * 60 * 60 * 24));
}

// The statuses that mean the shop has nothing left to do on a job: the work is done,
// the customer has been told to collect, or it is invoiced. Anything else is still
// live work. Used for the active/overdue counts and for deciding a job has a finish
// date at all, so the two can never disagree about which jobs are still running.
const FINISHED_STATUSES = ['DONE', 'CUST_NOTIFIED', 'INVOICED'];

function getJobFinishDate(job, maxTimeEntryEnd, fmt) {
  let raw = null;
  if (job.invoiced_date) raw = job.invoiced_date;
  else if (job.status === 'DONE' || job.status === 'CUST_NOTIFIED') {
    raw = maxTimeEntryEnd || job.done_history_at || job.updated_at;
  }
  if (!raw) return null;
  if (fmt) {
    return getLocalDateString(fmt, new Date(raw));
  }
  return raw.slice(0, 10);
}

// Split multiple machine tokens in a string like "01, 02" or "M1 / M2"
function parseMachineTokens(machineNumberStr) {
  if (!machineNumberStr) return [];
  return String(machineNumberStr)
    .split(/[,/|;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

// Split integer parts/scrap across machines without fractional inflation
function splitIntegerAcrossTokens(totalQty, tokenIndex, tokenCount) {
  if (totalQty <= 0 || tokenCount <= 0) return 0;
  const base = Math.floor(totalQty / tokenCount);
  const remainder = totalQty % tokenCount;
  return base + (tokenIndex < remainder ? 1 : 0);
}

// Split worker hours respecting each job's captured overtime rules
function splitWorkerHoursByJobRules(entriesByJob, defaultRules) {
  let normalHours = 0, ot1Hours = 0, ot2Hours = 0, holidayHours = 0;

  for (const [, jobData] of entriesByJob.entries()) {
    const rules = jobData.rules || defaultRules;
    const split = splitHours(jobData.entries, rules);
    normalHours += split.normalHours;
    ot1Hours += split.ot1Hours;
    ot2Hours += split.ot2Hours;
    holidayHours += split.holidayHours;
  }

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  return {
    normalHours: round2(normalHours),
    ot1Hours: round2(ot1Hours),
    ot2Hours: round2(ot2Hours),
    holidayHours: round2(holidayHours),
    totalHours: round2(normalHours + ot1Hours + ot2Hours + holidayHours),
    totalOtHours: round2(ot1Hours + ot2Hours + holidayHours)
  };
}

module.exports = {
  FINISHED_STATUSES,
  makeDateFormatter,
  getLocalDateString,
  calculateDateRange,
  daysDiff,
  getJobFinishDate,
  parseMachineTokens,
  splitIntegerAcrossTokens,
  splitWorkerHoursByJobRules
};
