import { CheckCircle2, Clock, TrendingUp, Package } from 'lucide-react';
import { pluralize } from '../../utils/formatters';
import { onTimeTone, onTimeWord, ON_TIME_RULE } from './thresholds';

// One number per card, and the card title says what that number counts.
// Colour is reserved for lateness — everything else stays neutral so the
// amber and red actually mean something when they appear.
export default function StatisticsKpis({ summary = {}, activeWorkersCount = 0, rangeLabel = '', loading = false }) {
  const onTimeRate = summary.onTimeRate;
  const hasOnTimeData = onTimeRate !== null && onTimeRate !== undefined;
  const onTimeStatus = !hasOnTimeData ? 'neutral' : onTimeTone(onTimeRate);

  const onTime = summary.onTimeJobsCount ?? 0;
  const late = summary.lateJobsCount ?? 0;
  const rated = onTime + late;
  const overdue = summary.overdueActiveJobsCount ?? 0;
  const hours = summary.totalWorkshopHours ?? 0;
  const avgPerWorker = activeWorkersCount > 0 ? Math.round((hours / activeWorkersCount) * 10) / 10 : 0;
  const period = rangeLabel || 'this period';

  // Whether anything was finished is the Jobs Finished count; on-time/late only
  // covers the finished jobs that had a due date to judge against.
  const finished = summary.completedJobsCount ?? 0;
  const noDueDate = finished - rated;
  const verdict = loading
    ? 'Loading…'
    : finished === 0
      ? `No jobs were finished in ${period}.`
      : rated === 0
        ? `${finished} ${finished === 1 ? 'job was' : 'jobs were'} finished in ${period}; none had a due date to judge against.`
        : `${onTime} of ${pluralize(rated, 'job')} ${rated === 1 ? 'was' : 'were'} finished on time in ${period}${late > 0 ? `; ${late} finished late` : ''}.${noDueDate > 0 ? ` ${noDueDate} more had no due date.` : ''}`;

  return (
    <>
      {/* The one-line answer, before any of the detail */}
      <div className="stats-verdict">
        <p className="stats-verdict-line">{verdict}</p>
        {!loading && (
          <p className={`stats-verdict-note ${overdue > 0 ? 'needs-attention' : ''}`}>
            {overdue > 0
              ? `${overdue} ${overdue === 1 ? 'job is' : 'jobs are'} overdue now (past due, not finished).`
              : 'No jobs are overdue now.'}
          </p>
        )}
      </div>

      <div className="stats-kpi-grid">
        {/* Finished on time */}
        <div className="kpi-card on-time">
          <div className="kpi-header">
            <span className="kpi-title">Finished on time</span>
            <div className="kpi-icon"><CheckCircle2 size={18} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">
              {loading || !hasOnTimeData ? <span className="stat-dash">—</span> : `${onTimeRate}%`}
            </div>
            {hasOnTimeData && !loading && (
              <span className={`kpi-badge ${onTimeStatus}`}>
                {onTimeWord(onTimeRate)}
              </span>
            )}
          </div>
          <p className="kpi-rule">{ON_TIME_RULE}</p>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Finished late</span>
              <span className={`kpi-stat-val ${late > 0 ? 'is-bad' : ''}`}>
                {pluralize(late, 'job')}{late > 0 && summary.avgDaysLate > 0 ? `, ${pluralize(summary.avgDaysLate, 'day')} late on average` : ''}
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
              <span className="kpi-stat-label">Average per worker</span>
              <span className="kpi-stat-val">{avgPerWorker}h</span>
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
              <span className="kpi-stat-val">{pluralize(summary.avgTurnaroundDays ?? 0, 'day')}</span>
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
              <span className={`kpi-stat-val ${(summary.totalScrap ?? 0) > 0 ? 'is-bad' : ''}`}>
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
