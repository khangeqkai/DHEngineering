import { Award, Filter, Building2 } from 'lucide-react';
import DataTable from '../common/DataTable';
import { useAuth } from '../../context/AuthContext';
import { PRIORITY_LABELS } from '../JobCardList.constants';

// Bar colour per priority — anything not listed reads as the muted default.
const PRIORITY_BAR_COLORS = {
  SAME_DAY: 'var(--same-day-bg)',
  HIGH: 'var(--warning-color)',
  MEDIUM: 'var(--primary-accent)'
};

export default function CustomersTab({
  customerRankings = [],
  qaLevelDistribution = {},
  priorityDistribution = {},
  totalJobsCreated = 0,
  loading = false
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="stats-panel">
      <div className="stats-dual-grid">
        {/* QA Level Breakdown */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <Award size={18} />
              <span>Jobs By Quality Level</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div className="distribution-list">
              {loading && Object.keys(qaLevelDistribution).length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton-bar" style={{ width: '80%', height: '14px' }} />
                  <div className="skeleton-bar" style={{ width: '60%', height: '14px' }} />
                  <div className="skeleton-bar" style={{ width: '70%', height: '14px' }} />
                </div>
              ) : (
                Object.entries(qaLevelDistribution).map(([level, count]) => {
                  const pct = totalJobsCreated > 0
                    ? Math.round((count / totalJobsCreated) * 100)
                    : 0;
                  return (
                    <div key={level} className="distribution-item">
                      <div className="distribution-header">
                        <span>{level}</span>
                        <span>{count} jobs ({pct}%)</span>
                      </div>
                      <div className="distribution-bar-bg">
                        <div className="distribution-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Priority Breakdown */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <Filter size={18} />
              <span>Jobs By Priority</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div className="distribution-list">
              {loading && Object.keys(priorityDistribution).length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton-bar" style={{ width: '75%', height: '14px' }} />
                  <div className="skeleton-bar" style={{ width: '85%', height: '14px' }} />
                  <div className="skeleton-bar" style={{ width: '50%', height: '14px' }} />
                </div>
              ) : (
                Object.entries(priorityDistribution).map(([prio, count]) => {
                  const pct = totalJobsCreated > 0
                    ? Math.round((count / totalJobsCreated) * 100)
                    : 0;
                  return (
                    <div key={prio} className="distribution-item">
                      <div className="distribution-header">
                        <span>{PRIORITY_LABELS[prio] || prio}</span>
                        <span>{count} jobs ({pct}%)</span>
                      </div>
                      <div className="distribution-bar-bg">
                        <div
                          className="distribution-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: PRIORITY_BAR_COLORS[prio] || 'var(--text-tertiary)'
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top Customers Table */}
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <Building2 size={18} />
            <span>Customers By Work Done</span>
          </div>
        </div>
        <div className="stats-card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'companyName',
                label: 'Customer',
                sortable: true,
                render: (val) => <strong>{val}</strong>
              },
              {
                key: 'jobsCount',
                label: 'Jobs Started',
                sortable: true,
                render: (val) => <span>{val} jobs</span>
              },
              {
                key: 'completedCount',
                label: 'Completed',
                sortable: true,
                render: (val) => <span>{val} finished</span>
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
                key: 'repeatPercent',
                label: 'Repeat Work',
                sortable: true,
                render: (val, row) => (
                  <span>{val}% ({row.repeatCount} repeat)</span>
                )
              },
              {
                key: 'totalHours',
                label: 'Hours Worked',
                sortable: true,
                render: (val) => <span style={{ fontFamily: 'var(--font-mono)' }}>{val}h</span>
              },
              ...(isAdmin ? [{
                key: 'invoicedTotal',
                label: 'Invoiced Total',
                sortable: true,
                render: (val) => (
                  <span>${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )
              }] : [])
            ]}
            data={customerRankings}
            loading={loading}
            searchable
            searchKeys={['companyName']}
            searchPlaceholder="Search customer..."
            emptyState={{
              icon: 'building',
              title: 'No customer data for this period',
              description: 'Customer job activity created in this period will rank here.'
            }}
          />
        </div>
      </div>
    </div>
  );
}
