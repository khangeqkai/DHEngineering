import { Award, Filter, Building2 } from 'lucide-react';
import DataTable from '../common/DataTable';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/roles';
import { PRIORITY_LABELS } from '../JobCardList.constants';
import { formatMoney, pluralize } from '../../utils/formatters';
import { roundTo } from '../../../../server/src/shared/round';

// Bar colour class per priority (see Statistics.css) — anything not listed
// reads as the muted default.
const PRIORITY_BAR_CLASS = {
  SAME_DAY: 'prio-same-day',
  HIGH: 'prio-high',
  MEDIUM: 'prio-medium'
};

export default function CustomersTab({
  customerRankings = [],
  qualityLevelDistribution = {},
  priorityDistribution = {},
  totalJobsCreated = 0,
  loading = false
}) {
  const { user } = useAuth();
  const canSeePricing = can(user, 'pricing');

  return (
    <div className="stats-panel">
      <div className="stats-dual-grid">
        {/* QA Level Breakdown */}
        <div className="stats-card">
          <div className="stats-card-header">
            <div className="stats-card-title">
              <Award size={18} />
              <span>Jobs by quality level</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div className="distribution-list">
              {loading && Object.keys(qualityLevelDistribution).length === 0 ? (
                <div className="stats-skeleton tight">
                  <div className="skeleton-bar w-80" />
                  <div className="skeleton-bar w-60" />
                  <div className="skeleton-bar w-70" />
                </div>
              ) : (
                Object.entries(qualityLevelDistribution).map(([level, count]) => {
                  const pct = totalJobsCreated > 0
                    ? roundTo((count / totalJobsCreated) * 100, 0)
                    : 0;
                  return (
                    <div key={level} className="distribution-item">
                      <div className="distribution-header">
                        <span>{level}</span>
                        <span>{pluralize(count, 'job')} ({pct}%)</span>
                      </div>
                      <div className="distribution-bar-bg">
                        <div className="distribution-bar-fill" style={{ '--bar-w': `${pct}%` }} />
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
              <span>Jobs by priority</span>
            </div>
          </div>
          <div className="stats-card-body">
            <div className="distribution-list">
              {loading && Object.keys(priorityDistribution).length === 0 ? (
                <div className="stats-skeleton tight">
                  <div className="skeleton-bar w-75" />
                  <div className="skeleton-bar w-85" />
                  <div className="skeleton-bar w-50" />
                </div>
              ) : (
                Object.entries(priorityDistribution).map(([prio, count]) => {
                  const pct = totalJobsCreated > 0
                    ? roundTo((count / totalJobsCreated) * 100, 0)
                    : 0;
                  return (
                    <div key={prio} className="distribution-item">
                      <div className="distribution-header">
                        <span>{PRIORITY_LABELS[prio] || prio}</span>
                        <span>{pluralize(count, 'job')} ({pct}%)</span>
                      </div>
                      <div className="distribution-bar-bg">
                        <div
                          className={`distribution-bar-fill ${PRIORITY_BAR_CLASS[prio] || 'muted'}`}
                          style={{ '--bar-w': `${pct}%` }}
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
            <span>Customers by work done</span>
          </div>
        </div>
        <div className="stats-card-body flush">
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
                align: 'right',
                sortable: true,
                render: (val) => <span>{pluralize(val, 'job')}</span>
              },
              {
                key: 'completedCount',
                label: 'Completed',
                align: 'right',
                sortable: true,
                render: (val) => <span>{val} finished</span>
              },
              {
                key: 'onTimeRate',
                label: 'Finished On Time',
                align: 'right',
                sortable: true,
                render: (val) => val !== null ? (
                  <span className={`kpi-badge ${val >= 90 ? 'success' : val >= 75 ? 'warning' : 'danger'}`}>
                    {val}%
                  </span>
                ) : (
                  <span className="stat-dash">—</span>
                )
              },
              {
                key: 'repeatPercent',
                label: 'Repeat Work',
                align: 'right',
                sortable: true,
                render: (val, row) => (
                  <span>{val}% ({row.repeatCount} repeat)</span>
                )
              },
              {
                key: 'totalHours',
                label: 'Hours Worked',
                align: 'right',
                sortable: true,
                render: (val) => <span className="stats-mono">{val}h</span>
              },
              ...(canSeePricing ? [{
                key: 'invoicedTotal',
                label: 'Invoiced Total',
                align: 'right',
                sortable: true,
                render: (val) => (
                  <span>{formatMoney(val)}</span>
                )
              }] : [])
            ]}
            data={customerRankings}
            loading={loading}
            searchable
            searchKeys={['companyName']}
            searchPlaceholder="Search customer…"
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
