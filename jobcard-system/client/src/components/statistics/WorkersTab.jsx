import { Users } from 'lucide-react';
import { pluralize } from '../../utils/formatters';
import DataTable from '../common/DataTable';

const TIERS = [
  { key: 'normal', label: 'Normal' },
  { key: 'ot1', label: 'Overtime 1' },
  { key: 'ot2', label: 'Overtime 2' },
  { key: 'holiday', label: 'Holiday' }
];

export default function WorkersTab({ workerLeaderboard = [], loading = false }) {
  return (
    <div className="stats-panel">
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <Users size={18} />
            <span>Hours by worker</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Hours are sorted into normal and overtime using the weekly schedule and public holidays.
          </span>
        </div>
        <div className="tier-legend" role="list" aria-label="Hours colours">
          {TIERS.map((t) => (
            <span className="tier-legend-item" role="listitem" key={t.key}>
              <span className={`tier-swatch ${t.key}`} />
              {t.label}
            </span>
          ))}
        </div>
        <div className="stats-card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'userName',
                label: 'Worker Name',
                sortable: true,
                render: (val, row) => (
                  <div>
                    <strong>{val}</strong>
                    {row.employeeId && row.employeeId !== '—' && (
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                        ID: {row.employeeId}
                      </div>
                    )}
                  </div>
                )
              },
              {
                key: 'totalHours',
                label: 'Hours worked',
                align: 'right',
                sortable: true,
                render: (val, row) => (
                  <div>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{val} h</strong>
                    <div className="hours-progress-bar">
                      <div
                        className="hours-progress-segment normal"
                        style={{ width: `${val > 0 ? (row.normalHours / val) * 100 : 100}%` }}
                        title={`Normal: ${row.normalHours} h`}
                      />
                      <div
                        className="hours-progress-segment ot1"
                        style={{ width: `${val > 0 ? (row.ot1Hours / val) * 100 : 0}%` }}
                        title={`Overtime 1: ${row.ot1Hours} h`}
                      />
                      <div
                        className="hours-progress-segment ot2"
                        style={{ width: `${val > 0 ? (row.ot2Hours / val) * 100 : 0}%` }}
                        title={`Overtime 2: ${row.ot2Hours} h`}
                      />
                      <div
                        className="hours-progress-segment holiday"
                        style={{ width: `${val > 0 ? (row.holidayHours / val) * 100 : 0}%` }}
                        title={`Holiday: ${row.holidayHours} h`}
                      />
                    </div>
                  </div>
                )
              },
              {
                key: 'normalHours',
                label: 'Normal Hours',
                align: 'right',
                sortable: true,
                render: (val) => <span className="tier-tag normal">{val} h</span>
              },
              {
                key: 'totalOtHours',
                label: 'Overtime',
                align: 'right',
                sortable: true,
                render: (val, row) => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                    {val > 0 ? (
                      <>
                        {row.ot1Hours > 0 && <span className="tier-tag ot1">Overtime 1: {row.ot1Hours} h</span>}
                        {row.ot2Hours > 0 && <span className="tier-tag ot2">Overtime 2: {row.ot2Hours} h</span>}
                        {row.holidayHours > 0 && <span className="tier-tag holiday">Holiday: {row.holidayHours} h</span>}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>0 h</span>
                    )}
                  </div>
                )
              },
              {
                key: 'jobsCount',
                label: 'Jobs Worked On',
                align: 'right',
                sortable: true,
                render: (val) => <span>{pluralize(val, 'job')}</span>
              },
              {
                key: 'partsProduced',
                label: 'Good Parts Made',
                align: 'right',
                sortable: true,
                render: (val) => (val || 0).toLocaleString()
              },
              {
                key: 'totalScrapQty',
                label: 'Scrapped (Bin / Recycled)',
                align: 'right',
                sortable: true,
                render: (val, row) => (
                  <span style={{ color: val > 0 ? 'var(--accent-caution)' : 'inherit' }}>
                    {val} ({row.scrapBinQty}b / {row.scrapRecycleQty}r)
                  </span>
                )
              },
              {
                key: 'qaChecks',
                label: 'Quality Checks',
                align: 'right',
                sortable: true,
                render: (val) => <span>{val || 0} checks</span>
              }
            ]}
            data={workerLeaderboard}
            loading={loading}
            searchable
            searchKeys={['userName', 'employeeId', 'username']}
            searchPlaceholder="Search worker by name or ID…"
            emptyState={{
              icon: 'users',
              title: 'No worker time logged',
              description: 'Logged time entries in this period will show here, worker by worker.'
            }}
          />
        </div>
      </div>
    </div>
  );
}
