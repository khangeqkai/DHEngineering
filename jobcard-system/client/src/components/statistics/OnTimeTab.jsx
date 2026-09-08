import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import DataTable from '../common/DataTable';
import { STATUS_LABELS } from '../JobCardList.constants';

export default function OnTimeTab({ summary = {}, delayedJobsList = [], loading = false }) {
  const onTimeRate = summary.onTimeRate;
  const hasOnTimeData = onTimeRate !== null && onTimeRate !== undefined;

  return (
    <div className="stats-panel">
      <div className="stats-dual-grid">
        {/* Delivery Scorecard */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <CheckCircle2 size={18} />
              <span>Finished On Time</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Finished on or before due date:</span>
                <strong style={{ color: 'var(--accent-ready)' }}>
                  {summary.onTimeJobsCount ?? 0} jobs {hasOnTimeData ? `(${onTimeRate}%)` : ''}
                </strong>
              </div>
              <div className="distribution-bar-bg">
                <div
                  className="distribution-bar-fill"
                  style={{
                    width: hasOnTimeData ? `${onTimeRate}%` : '100%',
                    background: !hasOnTimeData ? 'var(--text-tertiary)' : onTimeRate >= 90 ? 'var(--accent-ready)' : onTimeRate >= 75 ? 'var(--warning-color)' : 'var(--danger-color)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Late finished jobs:</span>
                <strong style={{ color: summary.lateJobsCount > 0 ? 'var(--accent-caution)' : 'inherit' }}>
                  {summary.lateJobsCount ?? 0} jobs
                </strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Average delay on late jobs:</span>
                <strong>{summary.avgDaysLate ?? 0} days late</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Finished without due date:</span>
                <span>{summary.noDueDateJobsCount ?? 0} jobs</span>
              </div>
            </div>
          </div>
        </div>

        {/* In Progress Status */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <Clock size={18} />
              <span>Jobs Still Open</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Total live jobs:</span>
                <strong>{summary.activeJobsCount ?? 0} jobs open</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Jobs in active progress:</span>
                <strong style={{ color: 'var(--primary-accent)' }}>{summary.inProgressJobsCount ?? 0} jobs</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Currently overdue (past due date):</span>
                <strong style={{ color: summary.overdueActiveJobsCount > 0 ? 'var(--accent-caution)' : 'var(--accent-ready)' }}>
                  {summary.overdueActiveJobsCount ?? 0} jobs
                </strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)' }}>Average job turnaround:</span>
                <strong>{summary.avgTurnaroundDays ?? 0} days / job</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delayed Jobs List */}
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <AlertTriangle size={18} style={{ color: 'var(--warning-color)' }} />
            <span>Jobs That Finished Late</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Jobs completed past deadline to help identify workshop bottlenecks
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
                sortable: true
              },
              {
                key: 'finishDate',
                label: 'Finished',
                sortable: true
              },
              {
                key: 'daysLate',
                label: 'Delay',
                sortable: true,
                render: (val) => (
                  <span className="kpi-badge danger">
                    {val} days late
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
                render: (val) => (
                  <span className="tier-tag normal">{STATUS_LABELS[val] || val}</span>
                )
              }
            ]}
            data={delayedJobsList}
            loading={loading}
            searchable
            searchKeys={['jobNumber', 'companyName', 'qualityLevel']}
            searchPlaceholder="Search delayed jobs..."
            emptyState={{
              icon: 'check-circle',
              title: 'No delayed jobs!',
              description: 'All completed jobs in this period met their delivery deadline.'
            }}
          />
        </div>
      </div>
    </div>
  );
}
