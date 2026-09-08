import { CheckCircle2, Clock, TrendingUp, Package } from 'lucide-react';

// One number per card, and the card title says what that number counts.
// Colour is reserved for lateness — everything else stays neutral so the
// amber and red actually mean something when they appear.
export default function StatisticsKpis({ summary = {}, activeWorkersCount = 0, rangeLabel = '', loading = false }) {
  const onTimeRate = summary.onTimeRate;
  const hasOnTimeData = onTimeRate !== null && onTimeRate !== undefined;
  const onTimeStatus = !hasOnTimeData ? 'neutral' : onTimeRate >= 90 ? 'success' : onTimeRate >= 75 ? 'warning' : 'danger';

  const onTime = summary.onTimeJobsCount ?? 0;
  const late = summary.lateJobsCount ?? 0;
  const rated = onTime + late;
  const overdue = summary.overdueActiveJobsCount ?? 0;
  const hours = summary.totalWorkshopHours ?? 0;
  const avgEach = activeWorkersCount > 0 ? Math.round((hours / activeWorkersCount) * 10) / 10 : 0;
  const period = rangeLabel || 'this period';

  const verdict = loading
    ? 'Loading…'
    : rated === 0
      ? `No jobs were finished in ${period}.`
      : `${onTime} of ${rated} jobs finished on time in ${period}.`;

  return (
    <>
      {/* The one-line answer, before any of the detail */}
      <div className="stats-verdict">
        <p className="stats-verdict-line">{verdict}</p>
        {!loading && (
          <p className={`stats-verdict-note ${overdue > 0 ? 'needs-attention' : ''}`}>
            {overdue > 0
              ? `${overdue} ${overdue === 1 ? 'job is' : 'jobs are'} overdue right now.`
              : 'Nothing is overdue right now.'}
          </p>
        )}
      </div>

      <div className="stats-kpi-grid">
        {/* Finished on time */}
        <div className="kpi-card on-time">
          <div className="kpi-header">
            <span className="kpi-title">Finished On Time</span>
            <div className="kpi-icon"><CheckCircle2 size={18} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">
              {loading || !hasOnTimeData ? <span className="stat-dash">—</span> : `${onTimeRate}%`}
            </div>
            {hasOnTimeData && !loading && (
              <span className={`kpi-badge ${onTimeStatus}`}>
                {onTimeRate >= 90 ? 'On track' : onTimeRate >= 75 ? 'Slipping' : 'Behind'}
              </span>
            )}
          </div>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Finished On Time</span>
              <span className="kpi-stat-val">{onTime} jobs</span>
            </div>
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Finished Late</span>
              <span className="kpi-stat-val" style={{ color: late > 0 ? 'var(--accent-caution)' : 'inherit' }}>
                {late} jobs{late > 0 && summary.avgDaysLate > 0 ? `, ${summary.avgDaysLate} days on average` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Hours worked */}
        <div className="kpi-card hours">
          <div className="kpi-header">
            <span className="kpi-title">Hours Worked</span>
            <div className="kpi-icon"><Clock size={18} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{loading ? <span className="stat-dash">—</span> : `${hours}h`}</div>
          </div>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">People Who Logged Time</span>
              <span className="kpi-stat-val">{activeWorkersCount}</span>
            </div>
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Average Each</span>
              <span className="kpi-stat-val">{avgEach}h</span>
            </div>
          </div>
        </div>

        {/* Jobs finished */}
        <div className="kpi-card jobs">
          <div className="kpi-header">
            <span className="kpi-title">Jobs Finished</span>
            <div className="kpi-icon"><TrendingUp size={18} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{loading ? <span className="stat-dash">—</span> : (summary.completedJobsCount ?? 0)}</div>
          </div>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Jobs Started</span>
              <span className="kpi-stat-val">{summary.totalJobsCreated ?? 0}</span>
            </div>
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Average Time To Finish</span>
              <span className="kpi-stat-val">{summary.avgTurnaroundDays ?? 0} days</span>
            </div>
          </div>
        </div>

        {/* Good parts made */}
        <div className="kpi-card scrap">
          <div className="kpi-header">
            <span className="kpi-title">Good Parts Made</span>
            <div className="kpi-icon"><Package size={18} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{loading ? <span className="stat-dash">—</span> : (summary.totalPartsProduced ?? 0).toLocaleString()}</div>
          </div>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Scrapped</span>
              <span className="kpi-stat-val" style={{ color: (summary.totalScrap ?? 0) > 0 ? 'var(--accent-caution)' : 'inherit' }}>
                {summary.totalScrap ?? 0} pieces ({summary.scrapRate ?? 0}%)
              </span>
            </div>
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Binned / Recycled</span>
              <span className="kpi-stat-val">{summary.totalScrapBin ?? 0} / {summary.totalScrapRecycle ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
