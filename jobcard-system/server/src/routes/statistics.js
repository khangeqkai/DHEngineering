const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { officeTimeZone, officeDateString } = require('../utils/officeTime');
const { readOvertimeSettings } = require('../utils/overtimeSettings');
const { roundTo } = require('../shared/round');
const {
  makeDateFormatter,
  calculateDateRange,
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

    const timezone = officeTimeZone();
    const fmt = makeDateFormatter(timezone);
    const todayStr = officeDateString(new Date(), fmt);

    const { startDate, endDate, label: rangeLabel } = calculateDateRange(preset, customStart, customEnd, timezone);
    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({ error: 'Start date cannot be after end date' });
    }

    // The company's own overtime rules, read the one way every other reader does —
    // a malformed stored schedule/holidays blob now falls back to filled-in defaults
    // here too, instead of turning this whole page into a 500.
    const ot = readOvertimeSettings();
    const defaultSchedule = ot.schedule;
    const defaultHolidays = ot.holidays;

    const defaultRules = { schedule: defaultSchedule, holidays: defaultHolidays, timezone };

    // Shared 2-day boundary buffer (same margin the time-entries query below already
    // used) so a UTC timestamp comparison in SQL can never exclude a row whose LOCAL
    // calendar date (in the shop's timezone) is genuinely inside [startDate, endDate].
    // Only startDate/endDate === null (the "all" preset) skips bounding entirely.
    const bufferedStartIso = startDate
      ? (() => { const d = new Date(startDate); d.setDate(d.getDate() - 2); return d.toISOString(); })()
      : null;
    const bufferedEndIso = endDate
      ? (() => { const d = new Date(endDate); d.setDate(d.getDate() + 2); return d.toISOString(); })()
      : null;

    const allJobs = fetchStatsJobs(startDate, endDate, bufferedStartIso, bufferedEndIso);
    const { activeMachinesMap, machineStatsMap } = buildMachineMaps();
    const inRangeTimeEntries = fetchInRangeTimeEntries(bufferedStartIso, bufferedEndIso, startDate, endDate, fmt);
    const jobCostingsMap = buildJobCostingsMap(inRangeTimeEntries, ot);

    const {
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
    } = processJobMetrics(allJobs, fmt, todayStr, startDate, endDate);

    const {
      workerEntriesMap,
      customerHoursMap,
      totalWorkshopHours,
      totalScrapBin,
      totalScrapRecycle,
      totalPartsProduced,
      totalInspectionChecks
    } = processTimeEntries(inRangeTimeEntries, jobCostingsMap, defaultRules, activeMachinesMap, machineStatsMap);

    const workerLeaderboard = buildWorkerLeaderboard(workerEntriesMap, defaultRules);
    const { machineUtilization, totalMachineHours } = formatMachineUtilization(machineStatsMap);
    const periodTrends = buildPeriodTrends(inRangeJobs, completedInRangeJobs, inRangeTimeEntries, fmt, groupBy, startDate, endDate, preset);
    const customerRankings = buildCustomerRankings(inRangeJobs, completedInRangeJobs, customerHoursMap, fmt, req.user.role);

    res.json({
      range: { preset, startDate, endDate, label: rangeLabel, groupBy },
      summary: {
        onTimeRate,
        completedJobsCount,
        onTimeJobsCount,
        lateJobsCount,
        noDueDateJobsCount,
        avgDaysLate: lateJobsCount > 0 ? roundTo(totalDaysLate / lateJobsCount, 1) : 0,
        avgTurnaroundDays: turnaroundCount > 0 ? roundTo(totalTurnaroundDays / turnaroundCount, 1) : 0,
        totalWorkshopHours: roundTo(totalWorkshopHours, 2),
        totalMachineHours,
        activeJobsCount,
        inProgressJobsCount,
        overdueActiveJobsCount,
        totalJobsCreated,
        totalPartsProduced,
        totalScrapBin,
        totalScrapRecycle,
        totalScrap: totalScrapBin + totalScrapRecycle,
        scrapRate: (totalPartsProduced + totalScrapBin + totalScrapRecycle) > 0
          ? roundTo(((totalScrapBin + totalScrapRecycle) / (totalPartsProduced + totalScrapBin + totalScrapRecycle)) * 100, 1)
          : 0,
        repeatJobsCount,
        repeatRate: totalJobsCreated > 0 ? roundTo((repeatJobsCount / totalJobsCreated) * 100, 0) : 0,
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
