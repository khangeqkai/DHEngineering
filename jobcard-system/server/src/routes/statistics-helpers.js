const { splitHours } = require('../utils/overtimeSplit');
const { makeOfficeFormatter: makeDateFormatter, officeDateString } = require('../utils/officeTime');
const { isCalendarDate } = require('../shared/calendarDate');
const { roundTo } = require('../shared/round');
const jobStatuses = require('../shared/jobStatuses.json');
const logger = require('../utils/logger');
const { db, getJobCostingOvertimeRowsByJobcardIds } = require('../db/database');
const { computeLiveCosting, jobOvertimeBaseline } = require('../utils/costingCompute');
const { can } = require('../middleware/auth');

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
    const validStart = customStart && isCalendarDate(String(customStart).trim())
      ? String(customStart).trim()
      : null;
    const validEnd = customEnd && isCalendarDate(String(customEnd).trim())
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
// From the one shared jobStatuses.json (also read by the client's SETTLED_STATUSES,
// client/src/components/JobCardList.constants.js).
const FINISHED_STATUSES = jobStatuses.settledStatuses;

function getJobFinishDate(job, maxTimeEntryEnd, fmt) {
  // The finish day is when the shop actually finished the work — the end of the
  // last logged time block — not when the office got around to invoicing it.
  // Using the invoice date flipped an on-time job to late the moment it was
  // invoiced days or weeks after the work was done. Fall back to the
  // invoice/done date only when a job has no logged work to date from at all.
  let raw = null;
  if (maxTimeEntryEnd) {
    raw = maxTimeEntryEnd;
  } else if (job.invoiced_date) {
    raw = job.invoiced_date;
  } else if (job.status === 'DONE' || job.status === 'CUST_NOTIFIED') {
    raw = job.done_history_at || job.updated_at;
  }
  if (!raw) return null;
  if (fmt) {
    return officeDateString(new Date(raw), fmt);
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

  return {
    normalHours: roundTo(normalHours, 2),
    ot1Hours: roundTo(ot1Hours, 2),
    ot2Hours: roundTo(ot2Hours, 2),
    holidayHours: roundTo(holidayHours, 2),
    totalHours: roundTo(normalHours + ot1Hours + ot2Hours + holidayHours, 2),
    totalOtHours: roundTo(ot1Hours + ot2Hours + holidayHours, 2)
  };
}

// One time entry's worth of logged work — the elapsed hours and its good-parts /
// scrap figures, exactly as the summary totals loop and the period trend loop
// both read them, so a session can never mean two different things to the two
// totals. Returns null for a backwards or zero-length entry (contributes
// nothing to either). Used by processTimeEntries and buildPeriodTrends below.
function measureTimeEntry(te) {
  const startMs = new Date(te.start_time).getTime();
  const endMs = new Date(te.end_time).getTime();
  if (endMs <= startMs) return null;
  return {
    hours: (endMs - startMs) / 3600000,
    qty: parseInt(te.qty, 10) || 0,
    scrapBin: te.scrap_bin_qty || 0,
    scrapRecycle: te.scrap_recycle_qty || 0
  };
}

// 1. Fetch jobcards. A job matters to SOME statistic below only if it is one of:
//   (a) currently active/unfinished — the active/in-progress/overdue counters are a
//       live snapshot, read for every preset regardless of the date range, so these
//       rows are never bounded by date;
//   (b) created inside the (buffered) range — feeds totalJobsCreated, the QA/priority
//       distributions, repeat-job count, and the "jobsCreated" trend/customer buckets;
//   (c) possibly finished inside the (buffered) range — a job's finish date is
//       COALESCE(last logged time-entry end, invoiced_date, the DONE history
//       timestamp, updated_at), the exact same fallback order getJobFinishDate uses
//       (see getJobFinishDate above) — feeds completedJobsCount, on-time/late, and the
//       "jobsCompleted"/customer buckets.
// The WHERE below is a strict superset of that (2-day buffer either side, and the
// finish-date OR-branch is looser than getJobFinishDate's per-status gating), so the
// unchanged JS loop further down still decides exactly which of these fetched jobs
// count for which figure — no figure can change, only the row count fetched shrinks.
// For the "all" preset (both null) no bound is applied at all, matching today exactly.
function fetchStatsJobs(startDate, endDate, bufferedStartIso, bufferedEndIso) {
  let jobsSql = `
    WITH job_calc AS (
      SELECT
        j.*,
        c.name AS resolved_company_name,
        qa.name AS qa_level_name,
        (SELECT MAX(te.end_time) FROM time_entries te WHERE te.jobcard_id = j.id AND te.end_time IS NOT NULL) AS max_entry_end,
        (SELECT MAX(h.created_at) FROM history h WHERE h.entity_type = 'jobcard' AND h.entity_id = j.id AND (h.changes LIKE '%"to":"DONE"%' OR h.changes LIKE '%"to": "DONE"%')) AS done_history_at
      FROM jobcards j
      LEFT JOIN companies c ON j.company_id = c.id
      LEFT JOIN qa_levels qa ON j.qa_level_id = qa.id
    )
    SELECT * FROM job_calc
  `;
  const jobsParams = [];
  if (startDate || endDate) {
    const finishedPlaceholders = FINISHED_STATUSES.map(() => '?').join(', ');
    const createdCond = [];
    if (bufferedStartIso) { createdCond.push('created_at >= ?'); }
    if (bufferedEndIso) { createdCond.push('created_at <= ?'); }
    const finishExpr = 'COALESCE(max_entry_end, invoiced_date, done_history_at, updated_at)';
    const finishCond = [];
    if (bufferedStartIso) { finishCond.push(`${finishExpr} >= ?`); }
    if (bufferedEndIso) { finishCond.push(`${finishExpr} <= ?`); }
    jobsSql += `
      WHERE (archived = 0 AND status NOT IN (${finishedPlaceholders}))
         OR (${createdCond.join(' AND ')})
         OR (${finishCond.join(' AND ')})
    `;
    jobsParams.push(...FINISHED_STATUSES);
    if (bufferedStartIso) jobsParams.push(bufferedStartIso);
    if (bufferedEndIso) jobsParams.push(bufferedEndIso);
    if (bufferedStartIso) jobsParams.push(bufferedStartIso);
    if (bufferedEndIso) jobsParams.push(bufferedEndIso);
  }
  jobsSql += ' ORDER BY created_at DESC';
  return db.prepare(jobsSql).all(...jobsParams);
}

// 2. Fetch machines: active machines sorted first so they take priority in lookup
function buildMachineMaps() {
  const machinesList = db.prepare('SELECT * FROM machines ORDER BY active DESC, id DESC').all();
  const activeMachinesMap = new Map();
  const machineStatsMap = new Map();
  for (const m of machinesList) {
    const key = String(m.machine_number).trim().toLowerCase();
    if (!activeMachinesMap.has(key) || m.active === 1) {
      activeMachinesMap.set(key, m);
    }
    if (m.active === 1 && !machineStatsMap.has(key)) {
      machineStatsMap.set(key, {
        machineNumber: m.machine_number,
        name: m.name,
        description: m.description || '',
        active: true,
        totalHours: 0,
        sessionCount: 0,
        partsProduced: 0,
        scrapQty: 0
      });
    }
  }
  return { activeMachinesMap, machineStatsMap };
}

// 3. Time entries query (same 2-day SQL boundary buffer as the jobs query above,
// so dates bounded here never load all history)
function fetchInRangeTimeEntries(bufferedStartIso, bufferedEndIso, startDate, endDate, fmt) {
  let teSql = `
    SELECT te.id, te.jobcard_id, te.user_id, te.machine_number, te.start_time, te.end_time,
           te.qty, te.scrap_bin_qty, te.scrap_recycle_qty,
           te.first_off_inspection, te.in_process_validation,
           te.measuring_equipment_verification, te.equipment_checks,
           u.name AS user_name, u.username, u.employee_id, u.role, u.active AS user_active,
           j.job_number, j.company_name AS j_company_name, c.name AS j_resolved_company
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    JOIN jobcards j ON te.jobcard_id = j.id
    LEFT JOIN companies c ON j.company_id = c.id
    WHERE te.end_time IS NOT NULL
  `;
  const teParams = [];
  if (bufferedStartIso) {
    teSql += ' AND te.start_time >= ?';
    teParams.push(bufferedStartIso);
  }
  if (bufferedEndIso) {
    teSql += ' AND te.start_time <= ?';
    teParams.push(bufferedEndIso);
  }
  teSql += ' ORDER BY te.start_time ASC';

  const rawTimeEntries = db.prepare(teSql).all(...teParams);

  // Filter time entries strictly by local date boundary in shop's timezone
  const inRangeTimeEntries = [];
  for (const te of rawTimeEntries) {
    const localDate = officeDateString(new Date(te.start_time), fmt);
    if (startDate && localDate < startDate) continue;
    if (endDate && localDate > endDate) continue;
    inRangeTimeEntries.push({ ...te, localDate });
  }
  return inRangeTimeEntries;
}

// 4. Fetch job costings only for the jobs whose logged time is actually in range —
// the returned map is only ever looked up by an in-range time entry's jobcard_id
// (see processTimeEntries' entriesByJob), so a job with no in-range time entries
// can never be consulted and doesn't need a row fetched for it.
function buildJobCostingsMap(inRangeTimeEntries, ot) {
  const costingJobIds = [...new Set(inRangeTimeEntries.map(te => te.jobcard_id))];
  const costingsRows = getJobCostingOvertimeRowsByJobcardIds(costingJobIds);
  const jobCostingsMap = new Map();
  for (const row of costingsRows) {
    // Same "this job's captured rules, else today's settings" lookup
    // computeLiveCosting uses — only the schedule/holidays/timezone piece of
    // it is needed here.
    const { schedule, holidays, timezone: jTimezone } = jobOvertimeBaseline(row, ot);
    jobCostingsMap.set(row.jobcard_id, {
      rules: { schedule, holidays, timezone: jTimezone }
    });
  }
  return jobCostingsMap;
}

// ── Process Job Metrics ──
function processJobMetrics(allJobs, fmt, todayStr, startDate, endDate) {
  let totalJobsCreated = 0;
  let completedJobsCount = 0;
  let onTimeJobsCount = 0;
  let lateJobsCount = 0;
  let noDueDateJobsCount = 0;
  let totalDaysLate = 0;
  let totalTurnaroundDays = 0;
  let turnaroundCount = 0;
  let activeJobsCount = 0;
  let inProgressJobsCount = 0;
  let overdueActiveJobsCount = 0;
  let repeatJobsCount = 0;

  const delayedJobsList = [];
  const qaLevelDistribution = {};
  const priorityDistribution = {};
  const inRangeJobs = [];
  const completedInRangeJobs = [];

  for (const job of allJobs) {
    const createdLocalDate = job.created_at ? officeDateString(new Date(job.created_at), fmt) : null;
    const finishDate = getJobFinishDate(job, job.max_entry_end, fmt);
    const isFinished = FINISHED_STATUSES.includes(job.status);

    const isCreatedInRange = (!startDate || (createdLocalDate && createdLocalDate >= startDate)) &&
                             (!endDate || (createdLocalDate && createdLocalDate <= endDate));

    const isCompletedInRange = isFinished && finishDate &&
                               (!startDate || finishDate >= startDate) &&
                               (!endDate || finishDate <= endDate);

    if (isCreatedInRange) {
      totalJobsCreated++;
      inRangeJobs.push(job);

      const qaName = job.qa_level_name || (job.quality_level ? (job.quality_level.charAt(0).toUpperCase() + job.quality_level.slice(1).toLowerCase()) : 'Standard');
      qaLevelDistribution[qaName] = (qaLevelDistribution[qaName] || 0) + 1;

      const prio = job.priority || 'NONE';
      priorityDistribution[prio] = (priorityDistribution[prio] || 0) + 1;

      if (job.is_repeat_job) repeatJobsCount++;
    }

    if (job.archived === 0 && !FINISHED_STATUSES.includes(job.status)) {
      activeJobsCount++;
      if (job.status === 'IN_PROGRESS') inProgressJobsCount++;
      if (job.due_date && job.due_date < todayStr) overdueActiveJobsCount++;
    }

    if (isCompletedInRange) {
      completedJobsCount++;
      completedInRangeJobs.push(job);
      if (createdLocalDate && finishDate) {
        totalTurnaroundDays += Math.max(0, daysDiff(finishDate, createdLocalDate));
        turnaroundCount++;
      }

      if (!finishDate || !job.due_date) {
        noDueDateJobsCount++;
      } else {
        const diff = daysDiff(finishDate, job.due_date);
        if (diff <= 0) {
          onTimeJobsCount++;
        } else {
          lateJobsCount++;
          totalDaysLate += diff;
          delayedJobsList.push({
            id: job.id,
            jobNumber: job.job_number,
            companyName: job.resolved_company_name || job.company_name || '—',
            dueDate: job.due_date,
            finishDate,
            daysLate: diff,
            status: job.status,
            qualityLevel: job.qa_level_name || (job.quality_level ? (job.quality_level.charAt(0).toUpperCase() + job.quality_level.slice(1).toLowerCase()) : 'Standard')
          });
        }
      }
    }
  }

  delayedJobsList.sort((a, b) => b.daysLate - a.daysLate);

  const onTimeRate = (onTimeJobsCount + lateJobsCount) > 0
    ? roundTo((onTimeJobsCount / (onTimeJobsCount + lateJobsCount)) * 100, 1)
    : null;

  return {
    totalJobsCreated,
    completedJobsCount,
    onTimeJobsCount,
    lateJobsCount,
    noDueDateJobsCount,
    totalDaysLate,
    totalTurnaroundDays,
    turnaroundCount,
    activeJobsCount,
    inProgressJobsCount,
    overdueActiveJobsCount,
    repeatJobsCount,
    delayedJobsList,
    qaLevelDistribution,
    priorityDistribution,
    inRangeJobs,
    completedInRangeJobs,
    onTimeRate
  };
}

// ── Process Time Entries (Workers, Machines, Customer Hours) ──
// Mutates machineStatsMap in place (adding any machine token not already seeded
// by buildMachineMaps) — the same single shared map today's code builds on.
function processTimeEntries(inRangeTimeEntries, jobCostingsMap, defaultRules, activeMachinesMap, machineStatsMap) {
  const workerEntriesMap = new Map();
  const customerHoursMap = new Map();

  let totalWorkshopHours = 0;
  let totalScrapBin = 0;
  let totalScrapRecycle = 0;
  let totalPartsProduced = 0;
  let totalInspectionChecks = 0;

  for (const te of inRangeTimeEntries) {
    const measured = measureTimeEntry(te);
    if (!measured) continue;
    const { hours: dur, qty, scrapBin, scrapRecycle: scrapRec } = measured;

    totalWorkshopHours += dur;

    if (qty > 0) totalPartsProduced += qty;

    totalScrapBin += scrapBin;
    totalScrapRecycle += scrapRec;

    if (te.first_off_inspection === 1) totalInspectionChecks++;
    if (te.in_process_validation === 1) totalInspectionChecks++;
    if (te.measuring_equipment_verification === 1) totalInspectionChecks++;
    if (te.equipment_checks === 1) totalInspectionChecks++;

    // Customer hours directly from period entries
    const custName = te.j_resolved_company || te.j_company_name || 'Unknown';
    customerHoursMap.set(custName, (customerHoursMap.get(custName) || 0) + dur);

    // Worker aggregation
    if (!workerEntriesMap.has(te.user_id)) {
      workerEntriesMap.set(te.user_id, {
        userId: te.user_id,
        userName: te.user_name || te.username,
        employeeId: te.employee_id || '—',
        role: te.role,
        active: te.user_active === 1,
        jobsSet: new Set(),
        entriesByJob: new Map(),
        partsProduced: 0,
        scrapBinQty: 0,
        scrapRecycleQty: 0,
        qaChecks: 0,
        sessionCount: 0
      });
    }
    const w = workerEntriesMap.get(te.user_id);
    w.jobsSet.add(te.jobcard_id);
    w.partsProduced += qty;
    w.scrapBinQty += scrapBin;
    w.scrapRecycleQty += scrapRec;
    w.sessionCount++;

    if (te.first_off_inspection === 1) w.qaChecks++;
    if (te.in_process_validation === 1) w.qaChecks++;
    if (te.measuring_equipment_verification === 1) w.qaChecks++;
    if (te.equipment_checks === 1) w.qaChecks++;

    if (!w.entriesByJob.has(te.jobcard_id)) {
      const jCosting = jobCostingsMap.get(te.jobcard_id);
      w.entriesByJob.set(te.jobcard_id, {
        rules: jCosting?.rules || defaultRules,
        entries: []
      });
    }
    w.entriesByJob.get(te.jobcard_id).entries.push({ start_time: te.start_time, end_time: te.end_time });

    // Multi-machine splitting with integer part distribution
    const machineTokens = parseMachineTokens(te.machine_number);
    const tokenCount = machineTokens.length;
    if (tokenCount > 0) {
      for (let i = 0; i < tokenCount; i++) {
        const token = machineTokens[i];
        const key = token.toLowerCase();
        if (!machineStatsMap.has(key)) {
          const matched = activeMachinesMap.get(key);
          machineStatsMap.set(key, {
            machineNumber: matched ? matched.machine_number : token,
            name: matched ? matched.name : token,
            description: matched ? matched.description : '',
            active: matched ? matched.active === 1 : true,
            totalHours: 0,
            sessionCount: 0,
            partsProduced: 0,
            scrapQty: 0
          });
        }
        const m = machineStatsMap.get(key);
        m.totalHours += (dur / tokenCount);
        m.sessionCount += 1;
        m.partsProduced += splitIntegerAcrossTokens(qty, i, tokenCount);
        m.scrapQty += (splitIntegerAcrossTokens(scrapBin, i, tokenCount) + splitIntegerAcrossTokens(scrapRec, i, tokenCount));
      }
    }
  }

  return { workerEntriesMap, customerHoursMap, totalWorkshopHours, totalScrapBin, totalScrapRecycle, totalPartsProduced, totalInspectionChecks };
}

// Build worker leaderboard
function buildWorkerLeaderboard(workerEntriesMap, defaultRules) {
  let workerLeaderboard = [];
  for (const w of workerEntriesMap.values()) {
    const split = splitWorkerHoursByJobRules(w.entriesByJob, defaultRules);
    workerLeaderboard.push({
      userId: w.userId,
      userName: w.userName,
      employeeId: w.employeeId,
      role: w.role,
      active: w.active,
      jobsCount: w.jobsSet.size,
      sessionsCount: w.sessionCount,
      partsProduced: w.partsProduced,
      scrapBinQty: w.scrapBinQty,
      scrapRecycleQty: w.scrapRecycleQty,
      totalScrapQty: w.scrapBinQty + w.scrapRecycleQty,
      qaChecks: w.qaChecks,
      totalHours: split.totalHours,
      normalHours: split.normalHours,
      ot1Hours: split.ot1Hours,
      ot2Hours: split.ot2Hours,
      holidayHours: split.holidayHours,
      totalOtHours: split.totalOtHours,
      avgSessionHours: w.sessionCount > 0 ? roundTo(split.totalHours / w.sessionCount, 2) : 0
    });
  }
  workerLeaderboard.sort((a, b) => b.totalHours - a.totalHours);
  workerLeaderboard = workerLeaderboard.map((w, idx) => ({ ...w, rank: idx + 1 }));
  return workerLeaderboard;
}

// Format machine utilization
function formatMachineUtilization(machineStatsMap) {
  return Array.from(machineStatsMap.values())
    .map(m => ({ ...m, totalHours: roundTo(m.totalHours, 1) }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

// ── Trend Buckets (Strictly in range) ──
function buildPeriodTrends(inRangeJobs, completedInRangeJobs, inRangeTimeEntries, fmt, groupBy) {
  const trendMap = new Map();
  const getPeriodKey = (dStr) => (dStr ? (groupBy === 'year' ? dStr.slice(0, 4) : dStr.slice(0, 7)) : null);

  for (const j of inRangeJobs) {
    const pKey = getPeriodKey(j.created_at ? officeDateString(new Date(j.created_at), fmt) : null);
    if (pKey) {
      if (!trendMap.has(pKey)) {
        trendMap.set(pKey, { period: pKey, jobsCreated: 0, jobsCompleted: 0, onTimeCompleted: 0, lateCompleted: 0, totalHours: 0, partsProduced: 0, scrapQty: 0 });
      }
      trendMap.get(pKey).jobsCreated++;
    }
  }

  for (const j of completedInRangeJobs) {
    const finishDate = getJobFinishDate(j, j.max_entry_end, fmt);
    if (finishDate) {
      const fKey = getPeriodKey(finishDate);
      if (fKey) {
        if (!trendMap.has(fKey)) {
          trendMap.set(fKey, { period: fKey, jobsCreated: 0, jobsCompleted: 0, onTimeCompleted: 0, lateCompleted: 0, totalHours: 0, partsProduced: 0, scrapQty: 0 });
        }
        const b = trendMap.get(fKey);
        b.jobsCompleted++;
        if (j.due_date && finishDate <= j.due_date) b.onTimeCompleted++;
        else if (j.due_date) b.lateCompleted++;
      }
    }
  }

  for (const te of inRangeTimeEntries) {
    const measured = measureTimeEntry(te);
    if (!measured) continue;

    const pKey = getPeriodKey(te.localDate);
    if (pKey) {
      if (!trendMap.has(pKey)) {
        trendMap.set(pKey, { period: pKey, jobsCreated: 0, jobsCompleted: 0, onTimeCompleted: 0, lateCompleted: 0, totalHours: 0, partsProduced: 0, scrapQty: 0 });
      }
      const b = trendMap.get(pKey);
      b.totalHours += measured.hours;
      if (measured.qty > 0) b.partsProduced += measured.qty;
      b.scrapQty += measured.scrapBin + measured.scrapRecycle;
    }
  }

  return Array.from(trendMap.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(b => {
      const totalRated = b.onTimeCompleted + b.lateCompleted;
      return {
        ...b,
        totalHours: roundTo(b.totalHours, 1),
        onTimeRate: totalRated > 0 ? roundTo((b.onTimeCompleted / totalRated) * 100, 1) : null
      };
    });
}

// ── Customer Rankings (Includes any customer with jobs created, completed, or worked in period) ──
function buildCustomerRankings(inRangeJobs, completedInRangeJobs, customerHoursMap, fmt, userRole) {
  const customerMap = new Map();
  const getOrCreateCustomer = (cName) => {
    if (!customerMap.has(cName)) {
      customerMap.set(cName, {
        companyName: cName,
        jobsCount: 0,
        completedCount: 0,
        onTimeCount: 0,
        lateCount: 0,
        repeatCount: 0,
        invoicedTotal: 0
      });
    }
    return customerMap.get(cName);
  };

  for (const j of inRangeJobs) {
    const c = getOrCreateCustomer(j.resolved_company_name || j.company_name || 'Unknown');
    c.jobsCount++;
    if (j.is_repeat_job) c.repeatCount++;
  }

  for (const j of completedInRangeJobs) {
    const c = getOrCreateCustomer(j.resolved_company_name || j.company_name || 'Unknown');
    c.completedCount++;
    const fDate = getJobFinishDate(j, j.max_entry_end, fmt);
    if (j.due_date && fDate) {
      if (fDate <= j.due_date) c.onTimeCount++;
      else c.lateCount++;
    }
    if (can(userRole, 'pricing') && j.status === 'INVOICED') {
      // No invoice-time freeze (docs/notes/time-and-costing.md, "Per-job rule
      // ownership") — the stored grand_total is only refreshed by a pricing-sheet
      // save, so it goes stale the moment logged time changes after invoicing.
      // Recomputing here always reproduces the billed number without writing anything.
      try {
        const computed = computeLiveCosting(j.id, null);
        c.invoicedTotal += computed.row.grand_total || 0;
      } catch (err) {
        logger.error({ err, jobId: j.id }, 'Failed to compute live costing for invoiced total in statistics');
      }
    }
  }

  for (const [custName] of customerHoursMap.entries()) {
    getOrCreateCustomer(custName);
  }

  return Array.from(customerMap.values())
    .map(c => {
      const rated = c.onTimeCount + c.lateCount;
      const hoursInPeriod = roundTo(customerHoursMap.get(c.companyName) || 0, 1);
      return {
        ...c,
        totalHours: hoursInPeriod,
        invoicedTotal: can(userRole, 'pricing') ? roundTo(c.invoicedTotal, 2) : null,
        onTimeRate: rated > 0 ? roundTo((c.onTimeCount / rated) * 100, 1) : null,
        repeatPercent: c.jobsCount > 0 ? roundTo((c.repeatCount / c.jobsCount) * 100, 0) : 0
      };
    })
    .sort((a, b) => (b.totalHours - a.totalHours) || (b.jobsCount - a.jobsCount));
}

module.exports = {
  FINISHED_STATUSES,
  makeDateFormatter,
  calculateDateRange,
  daysDiff,
  getJobFinishDate,
  parseMachineTokens,
  splitIntegerAcrossTokens,
  splitWorkerHoursByJobRules,
  fetchStatsJobs,
  buildMachineMaps,
  fetchInRangeTimeEntries,
  buildJobCostingsMap,
  processJobMetrics,
  processTimeEntries,
  buildWorkerLeaderboard,
  formatMachineUtilization,
  buildPeriodTrends,
  buildCustomerRankings
};
