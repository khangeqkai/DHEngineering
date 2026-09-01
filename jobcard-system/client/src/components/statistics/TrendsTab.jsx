import { BarChart3 } from 'lucide-react';
import DataTable from '../common/DataTable';
import EmptyState from '../common/EmptyState';

// Hours and job counts are different things measured in different units, so they
// get one labelled row each rather than two bars sharing a picture. Every bar
// prints its own number, and the longest bar in each measure is stated, so a bar
// is only ever compared against bars of the same kind.
function MeasureRows({ title, scaleNote, rows, tone }) {
  return (
    <div className="trend-measure">
      <div className="trend-measure-head">
        <span className="trend-measure-title">{title}</span>
        <span className="trend-measure-scale">{scaleNote}</span>
      </div>
      {rows.map((r) => (
        <div className="trend-row" key={r.key}>
          <span className="trend-row-label">{r.key}</span>
          <div className="trend-row-track">
            <div className={`trend-row-fill ${tone}`} style={{ width: `${r.percent}%` }} />
          </div>
          <span className="trend-row-value">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendsTab({ periodTrends = [], groupBy = 'month', loading = false }) {
  const maxHours = periodTrends.reduce((max, t) => Math.max(max, t.totalHours || 0), 0);
  const maxFinished = periodTrends.reduce((max, t) => Math.max(max, t.jobsCompleted || 0), 0);

  const pct = (value, max) => (max > 0 ? (value / max) * 100 : 0);

  const hourRows = periodTrends.map((t) => ({
    key: t.period,
    percent: pct(t.totalHours || 0, maxHours),
    display: `${t.totalHours || 0}h`
  }));

  const finishedRows = periodTrends.map((t) => ({
    key: t.period,
    percent: pct(t.jobsCompleted || 0, maxFinished),
    display: `${t.jobsCompleted || 0}`
  }));

  return (
    <div className="stats-panel">
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <BarChart3 size={18} />
            <span>{groupBy === 'month' ? 'Month By Month' : 'Year By Year'}</span>
          </div>
        </div>

        <div className="stats-card-body">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-2) 0' }}>
              <div className="skeleton-bar" style={{ width: '60%', height: '14px' }} />
              <div className="skeleton-bar" style={{ width: '80%', height: '18px' }} />
              <div className="skeleton-bar" style={{ width: '45%', height: '18px' }} />
              <div className="skeleton-bar" style={{ width: '70%', height: '18px' }} />
            </div>
          ) : periodTrends.length === 0 ? (
            <EmptyState
              icon="bar-chart"
              title="Nothing logged in this period"
              description="Finish jobs and log work to see how each month compares."
            />
          ) : (
            <div className="trend-measures">
              <MeasureRows
                title="Hours Worked"
                scaleNote={maxHours > 0 ? `Longest bar = ${maxHours}h` : 'No hours logged'}
                rows={hourRows}
                tone="hours"
              />
              <MeasureRows
                title="Jobs Finished"
                scaleNote={maxFinished > 0 ? `Longest bar = ${maxFinished} jobs` : 'No jobs finished'}
                rows={finishedRows}
                tone="finished"
              />
            </div>
          )}
        </div>
      </div>

      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <BarChart3 size={18} />
            <span>Every {groupBy === 'month' ? 'Month' : 'Year'} In Full</span>
          </div>
        </div>
        <div className="stats-card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'period',
                label: groupBy === 'month' ? 'Month' : 'Year',
                sortable: true,
                render: (val) => <strong>{val}</strong>
              },
              {
                key: 'jobsCreated',
                label: 'Jobs Started',
                sortable: true,
                render: (val) => <span>{val}</span>
              },
              {
                key: 'jobsCompleted',
                label: 'Jobs Finished',
                sortable: true,
                render: (val) => <span>{val}</span>
              },
              {
                key: 'onTimeRate',
                label: 'Finished On Time',
                sortable: true,
                render: (val) => val !== null ? (
                  <span className={`kpi-badge ${val >= 90 ? 'success' : val >= 75 ? 'warning' : 'danger'}`}>
                    {val}%
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                )
              },
              {
                key: 'totalHours',
                label: 'Hours Worked',
                sortable: true,
                render: (val) => <span style={{ fontFamily: 'var(--font-mono)' }}>{val}h</span>
              },
              {
                key: 'partsProduced',
                label: 'Good Parts Made',
                sortable: true,
                render: (val) => (val || 0).toLocaleString()
              },
              {
                key: 'scrapQty',
                label: 'Scrapped',
                sortable: true,
                render: (val) => (
                  <span style={{ color: val > 0 ? 'var(--accent-caution)' : 'inherit' }}>
                    {val || 0} pieces
                  </span>
                )
              }
            ]}
            data={periodTrends}
            loading={loading}
            searchable={false}
          />
        </div>
      </div>
    </div>
  );
}
