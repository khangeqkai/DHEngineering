import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import DataTable from '../common/DataTable';
import { STATUS_LABELS } from '../JobCardList.constants';
import { STATUS_SORT_ORDER } from '../jobcard/constants';
import { formatDate, pluralize } from '../../utils/formatters';
import { onTimeTone, ON_TIME_RULE, daysLate } from './thresholds';

export default function OnTimeTab({ summary = {}, delayedJobsList = [], loading = false }) {
  const onTimeRate = summary.onTimeRate;
  const hasOnTimeData = onTimeRate !== null && onTimeRate !== undefined;

  const overdue = summary.overdueActiveJobsCount ?? 0;
  const finishedLate = summary.lateJobsCount ?? 0;

  return (
    <div className="stats-panel">
      {/* The two delivery numbers, kept apart: overdue is about jobs still open
          right now, finished late is about jobs already delivered. */}
      <div className="delivery-tiles">
        <div className="delivery-tile">
          <span className="delivery-tile-title">Overdue now</span>
          <span className={`delivery-tile-value ${overdue > 0 ? 'danger' : ''}`}>
            {loading ? <span className="stat-dash">—</span> : overdue}
          </span>
          <span className="delivery-tile-sub">past due, not finished</span>
        </div>
        <div className="delivery-tile">
          <span className="delivery-tile-title">Finished late this period</span>
          <span className="delivery-tile-value">
            {loading ? <span className="stat-dash">—</span> : finishedLate}
          </span>
          <span className="delivery-tile-sub">of {summary.completedJobsCount ?? 0} finished</span>
        </div>
      </div>

      <div className="stats-dual-grid">
        {/* Delivery Scorecard */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <CheckCircle2 size={18} />
              <span>Finished on time</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Finished on or before due date:</span>
                <strong style={{ color: 'var(--accent-ready)' }}>
                  {pluralize(summary.onTimeJobsCount ?? 0, 'job')} {hasOnTimeData ? `(${onTimeRate}%)` : ''}
                </strong>
              </div>
              <div className="distribution-bar-bg">
                <div
                  className="distribution-bar-fill"
                  style={{
                    width: hasOnTimeData ? `${onTimeRate}%` : '100%',
                    background: !hasOnTimeData ? 'var(--text-tertiary)' : `var(--${onTimeTone(onTimeRate)}-color)`
                  }}
                />
              </div>
              <p className="kpi-rule">{ON_TIME_RULE}</p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Finished late:</span>
                <strong style={{ color: summary.lateJobsCount > 0 ? 'var(--accent-caution)' : 'inherit' }}>
                  {pluralize(summary.lateJobsCount ?? 0, 'job')}
                </strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Average days late (jobs finished late):</span>
                <strong>{daysLate(summary.avgDaysLate ?? 0)}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Finished without due date:</span>
                <span>{pluralize(summary.noDueDateJobsCount ?? 0, 'job')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* In Progress Status */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <Clock size={18} />
              <span>Jobs still open</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Total live jobs:</span>
                <strong>{pluralize(summary.activeJobsCount ?? 0, 'job')} open</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Jobs in active progress:</span>
                <strong style={{ color: 'var(--primary-accent)' }}>{pluralize(summary.inProgressJobsCount ?? 0, 'job')}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Average job turnaround:</span>
                <strong>{pluralize(summary.avgTurnaroundDays ?? 0, 'day')} / job</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Jobs finished late */}
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <AlertTriangle size={18} style={{ color: 'var(--warning-color)' }} />
            <span>Jobs that finished late</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Jobs delivered after their due date
          </span>
        </div>
        <div className="stats-card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'jobNumber',
                label: 'Job #',
                sortable: true,
                render: (val) => <strong>{val}</strong>
              },
              {
                key: 'companyName',
                label: 'Customer',
                sortable: true
              },
              {
                key: 'dueDate',
                label: 'Due Date',
                sortable: true,
                render: (val) => formatDate(val)
              },
              {
                key: 'finishDate',
                label: 'Finished',
                sortable: true,
                render: (val) => formatDate(val)
              },
              {
                key: 'daysLate',
                label: 'Days late',
                align: 'right',
                sortable: true,
                render: (val) => (
                  <span className="kpi-badge danger">
                    {daysLate(val)}
                  </span>
                )
              },
              {
                key: 'qualityLevel',
                label: 'QA Level',
                sortable: true
              },
              {
                key: 'status',
                label: 'Status',
                sortable: true,
                sortValue: (row) => STATUS_SORT_ORDER[row.status] ?? 99,
                render: (val) => (
                  <span className="tier-tag normal">{STATUS_LABELS[val] || val}</span>
                )
              }
            ]}
            data={delayedJobsList}
            loading={loading}
            searchable
            searchKeys={['jobNumber', 'companyName', 'qualityLevel']}
            searchPlaceholder="Search jobs finished late…"
            emptyState={{
              icon: 'check-circle',
              title: overdue > 0 ? 'No jobs finished late in this period.' : 'No jobs finished late and none overdue in this period.',
              description: overdue > 0 ? 'Every job finished in this period was on time. Jobs that are overdue now are counted above.' : 'Every job finished in this period was on time.'
            }}
          />
        </div>
      </div>
    </div>
  );
}
