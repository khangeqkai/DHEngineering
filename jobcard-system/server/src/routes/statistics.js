const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { db, getSettings } = require('../db/database');
const { officeTimeZone } = require('../utils/officeTime');
const {
  makeDateFormatter,
  getLocalDateString,
  calculateDateRange,
  daysDiff,
  getJobFinishDate,
  parseMachineTokens,
  splitIntegerAcrossTokens,
  splitWorkerHoursByJobRules
} = require('./statistics-helpers');

router.use(authenticate);
router.use(requireManagement);

// GET /api/statistics
router.get('/', (req, res) => {
  try {
    const preset = req.query.preset || 'this_month';
    const customStart = req.query.startDate;
    const customEnd = req.query.endDate;
    const groupBy = req.query.groupBy || 'month';

    const settings = getSettings();
    const timezone = officeTimeZone();
    const fmt = makeDateFormatter(timezone);
    const todayStr = getLocalDateString(fmt, new Date());

    const { startDate, endDate, label: rangeLabel } = calculateDateRange(preset, customStart, customEnd, timezone);

    const defaultSchedule = settings.labour_schedule
      ? (typeof settings.labour_schedule === 'string' ? JSON.parse(settings.labour_schedule) : settings.labour_schedule)
      : {};
    const defaultHolidays = settings.labour_public_holidays
      ? (typeof settings.labour_public_holidays === 'string' ? JSON.parse(settings.labour_public_holidays) : settings.labour_public_holidays)
      : [];

    const defaultRules = { schedule: defaultSchedule, holidays: defaultHolidays, timezone };

    // 1. Fetch job costings map for exact billing rule consistency
    const costingsRows = db.prepare('SELECT jobcard_id, labour_schedule, labour_public_holidays, labour_timezone, grand_total FROM job_costings').all();
    const jobCostingsMap = new Map();
    for (const row of costingsRows) {
      let jSchedule = defaultSchedule;
      let jHolidays = defaultHolidays;
      try { if (row.labour_schedule) jSchedule = JSON.parse(row.labour_schedule); } catch {}
      try { if (row.labour_public_holidays) jHolidays = JSON.parse(row.labour_public_holidays); } catch {}
      jobCostingsMap.set(row.jobcard_id, {
        rules: { schedule: jSchedule, holidays: jHolidays, timezone: row.labour_timezone || timezone },
        grandTotal: row.grand_total
      });
    }

    // 2. Fetch all jobcards
    const allJobs = db.prepare(`
      SELECT 
        j.*,
        c.name AS resolved_company_name,
        qa.name AS qa_level_name,
        (SELECT MAX(te.end_time) FROM time_entries te WHERE te.jobcard_id = j.id AND te.end_time IS NOT NULL) AS max_entry_end,
        (SELECT MAX(h.created_at) FROM history h WHERE h.entity_type = 'jobcard' AND h.entity_id = j.id AND (h.changes LIKE '%"to":"DONE"%' OR h.changes LIKE '%"to": "DONE"%')) AS done_history_at
      FROM jobcards j
      LEFT JOIN companies c ON j.company_id = c.id
      LEFT JOIN qa_levels qa ON j.qa_level_id = qa.id
      ORDER BY j.created_at DESC
    `).all();

    // 3. Fetch machines: active machines sorted first so they take priority in lookup
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

    // 4. Time entries query (with 2-day SQL boundary buffer when dates are bounded to avoid loading all history)
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
    if (startDate) {
      const bufferedStart = new Date(startDate);
      bufferedStart.setDate(bufferedStart.getDate() - 2);
      teSql += ' AND te.start_time >= ?';
      teParams.push(bufferedStart.toISOString());
    }
    if (endDate) {
      const bufferedEnd = new Date(endDate);
      bufferedEnd.setDate(bufferedEnd.getDate() + 2);
      teSql += ' AND te.start_time <= ?';
      teParams.push(bufferedEnd.toISOString());
    }
    teSql += ' ORDER BY te.start_time ASC';

    const rawTimeEntries = db.prepare(teSql).all(...teParams);

    // Filter time entries strictly by local date boundary in shop's timezone
    const inRangeTimeEntries = [];
    for (const te of rawTimeEntries) {
      const localDate = getLocalDateString(fmt, new Date(te.start_time));
      if (startDate && localDate < startDate) continue;
      if (endDate && localDate > endDate) continue;
      inRangeTimeEntries.push({ ...te, localDate });
    }

    // ── Process Job Metrics ──
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
      const createdLocalDate = job.created_at ? getLocalDateString(fmt, new Date(job.created_at)) : null;
      const finishDate = getJobFinishDate(job, job.max_entry_end, fmt);
      const isFinished = job.status === 'INVOICED' || job.status === 'DONE';

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

      if (job.archived === 0 && !['DONE', 'INVOICED'].includes(job.status)) {
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
      ? Math.round((onTimeJobsCount / (onTimeJobsCount + lateJobsCount)) * 1000) / 10
      : null;

    // ── Process Time Entries (Workers, Machines, Customer Hours) ──
    const workerEntriesMap = new Map();
    const customerHoursMap = new Map();

    let totalWorkshopHours = 0;
    let totalScrapBin = 0;
    let totalScrapRecycle = 0;
    let totalPartsProduced = 0;
    let totalInspectionChecks = 0;

    for (const te of inRangeTimeEntries) {
      const s = new Date(te.start_time).getTime();
      const e = new Date(te.end_time).getTime();
      if (e <= s) continue;

      const dur = (e - s) / 3600000;
      totalWorkshopHours += dur;

      const qty = parseInt(te.qty, 10) || 0;
      if (qty > 0) totalPartsProduced += qty;

      const scrapBin = te.scrap_bin_qty || 0;
      const scrapRec = te.scrap_recycle_qty || 0;
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

    // Build worker leaderboard
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
        avgSessionHours: w.sessionCount > 0 ? Math.round((split.totalHours / w.sessionCount) * 100) / 100 : 0
      });
    }
    workerLeaderboard.sort((a, b) => b.totalHours - a.totalHours);
    workerLeaderboard = workerLeaderboard.map((w, idx) => ({ ...w, rank: idx + 1 }));

    // Format machine utilization
    const machineUtilization = Array.from(machineStatsMap.values())
      .map(m => ({ ...m, totalHours: Math.round(m.totalHours * 10) / 10 }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // ── Trend Buckets (Strictly in range) ──
    const trendMap = new Map();
    const getPeriodKey = (dStr) => (dStr ? (groupBy === 'year' ? dStr.slice(0, 4) : dStr.slice(0, 7)) : null);

    for (const j of inRangeJobs) {
      const pKey = getPeriodKey(j.created_at ? getLocalDateString(fmt, new Date(j.created_at)) : null);
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
      const s = new Date(te.start_time).getTime();
      const e = new Date(te.end_time).getTime();
      if (e <= s) continue;

      const pKey = getPeriodKey(te.localDate);
      if (pKey) {
        if (!trendMap.has(pKey)) {
          trendMap.set(pKey, { period: pKey, jobsCreated: 0, jobsCompleted: 0, onTimeCompleted: 0, lateCompleted: 0, totalHours: 0, partsProduced: 0, scrapQty: 0 });
        }
        const b = trendMap.get(pKey);
        const dur = (e - s) / 3600000;
        b.totalHours += dur;
        const q = parseInt(te.qty, 10) || 0;
        if (q > 0) b.partsProduced += q;
        b.scrapQty += (te.scrap_bin_qty || 0) + (te.scrap_recycle_qty || 0);
      }
    }

    const periodTrends = Array.from(trendMap.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(b => {
        const totalRated = b.onTimeCompleted + b.lateCompleted;
        return {
          ...b,
          totalHours: Math.round(b.totalHours * 10) / 10,
          onTimeRate: totalRated > 0 ? Math.round((b.onTimeCompleted / totalRated) * 1000) / 10 : null
        };
      });

    // ── Customer Rankings (Includes any customer with jobs created, completed, or worked in period) ──
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
      if (req.user.role === 'admin' && j.status === 'INVOICED') {
        const jCosting = jobCostingsMap.get(j.id);
        if (jCosting?.grandTotal) c.invoicedTotal += jCosting.grandTotal;
      }
    }

    for (const [custName] of customerHoursMap.entries()) {
      getOrCreateCustomer(custName);
    }

    const customerRankings = Array.from(customerMap.values())
      .map(c => {
        const rated = c.onTimeCount + c.lateCount;
        const hoursInPeriod = Math.round((customerHoursMap.get(c.companyName) || 0) * 10) / 10;
        return {
          ...c,
          totalHours: hoursInPeriod,
          invoicedTotal: req.user.role === 'admin' ? Math.round(c.invoicedTotal * 100) / 100 : null,
          onTimeRate: rated > 0 ? Math.round((c.onTimeCount / rated) * 1000) / 10 : null,
          repeatPercent: c.jobsCount > 0 ? Math.round((c.repeatCount / c.jobsCount) * 100) : 0
        };
      })
      .sort((a, b) => (b.totalHours - a.totalHours) || (b.jobsCount - a.jobsCount));

    res.json({
      range: { preset, startDate, endDate, label: rangeLabel, groupBy },
      summary: {
        onTimeRate,
        completedJobsCount,
        onTimeJobsCount,
        lateJobsCount,
        noDueDateJobsCount,
        avgDaysLate: lateJobsCount > 0 ? Math.round((totalDaysLate / lateJobsCount) * 10) / 10 : 0,
        avgTurnaroundDays: turnaroundCount > 0 ? Math.round((totalTurnaroundDays / turnaroundCount) * 10) / 10 : 0,
        totalWorkshopHours: Math.round(totalWorkshopHours * 100) / 100,
        activeJobsCount,
        inProgressJobsCount,
        overdueActiveJobsCount,
        totalJobsCreated,
        totalPartsProduced,
        totalScrapBin,
        totalScrapRecycle,
        totalScrap: totalScrapBin + totalScrapRecycle,
        scrapRate: (totalPartsProduced + totalScrapBin + totalScrapRecycle) > 0
          ? Math.round(((totalScrapBin + totalScrapRecycle) / (totalPartsProduced + totalScrapBin + totalScrapRecycle)) * 1000) / 10
          : 0,
        repeatJobsCount,
        repeatRate: totalJobsCreated > 0 ? Math.round((repeatJobsCount / totalJobsCreated) * 100) : 0,
        totalInspectionChecks
      },
      workerLeaderboard,
      machineUtilization,
      periodTrends,
      customerRankings,
      delayedJobsList,
      qaLevelDistribution,
      priorityDistribution
    });
  } catch (err) {
    logger.error({ err }, 'Failed to compute workshop statistics');
    res.status(500).json({ error: 'Failed to compute statistics' });
  }
});

module.exports = router;
