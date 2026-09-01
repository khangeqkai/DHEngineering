import { Users } from 'lucide-react';
import DataTable from '../common/DataTable';

export default function WorkersTab({ workerLeaderboard = [], loading = false }) {
  return (
    <div className="stats-panel">
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <Users size={18} />
            <span>Worker Hours &amp; Shift Leaderboard</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Overtime split according to job captured schedule &amp; holidays
          </span>
        </div>
        <div className="stats-card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'rank',
                label: 'Rank',
                render: (val, row) => {
                  const rank = val || row?.rank || 1;
                  const badgeClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                  return <span className={`worker-rank-badge ${badgeClass}`}>{rank}</span>;
                }
              },
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
                label: 'Hours Worked',
                sortable: true,
                render: (val, row) => (
                  <div>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{val}h</strong>
                    <div className="hours-progress-bar">
                      <div
                        className="hours-progress-segment normal"
                        style={{ width: `${val > 0 ? (row.normalHours / val) * 100 : 100}%` }}
                        title={`Normal: ${row.normalHours}h`}
                      />
                      <div
                        className="hours-progress-segment ot1"
                        style={{ width: `${val > 0 ? (row.ot1Hours / val) * 100 : 0}%` }}
                        title={`OT1: ${row.ot1Hours}h`}
                      />
                      <div
                        className="hours-progress-segment ot2"
                        style={{ width: `${val > 0 ? (row.ot2Hours / val) * 100 : 0}%` }}
                        title={`OT2: ${row.ot2Hours}h`}
                      />
                      <div
                        className="hours-progress-segment holiday"
                        style={{ width: `${val > 0 ? (row.holidayHours / val) * 100 : 0}%` }}
                        title={`Holiday: ${row.holidayHours}h`}
                      />
                    </div>
                  </div>
                )
              },
              {
                key: 'normalHours',
                label: 'Normal Hours',
                sortable: true,
                render: (val) => <span className="tier-tag normal">{val}h</span>
              },
              {
                key: 'totalOtHours',
                label: 'Overtime',
                sortable: true,
                render: (val, row) => (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {val > 0 ? (
                      <>
                        {row.ot1Hours > 0 && <span className="tier-tag ot">OT1: {row.ot1Hours}h</span>}
                        {row.ot2Hours > 0 && <span className="tier-tag ot">OT2: {row.ot2Hours}h</span>}
                        {row.holidayHours > 0 && <span className="tier-tag holiday">Holiday: {row.holidayHours}h</span>}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>0h OT</span>
                    )}
                  </div>
                )
              },
              {
                key: 'jobsCount',
                label: 'Jobs Worked On',
                sortable: true,
                render: (val) => <span>{val} jobs</span>
              },
              {
                key: 'partsProduced',
                label: 'Good Parts Made',
                sortable: true,
                render: (val) => (val || 0).toLocaleString()
              },
              {
                key: 'totalScrapQty',
                label: 'Scrapped (Bin / Recycled)',
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
                sortable: true,
                render: (val) => <span>{val || 0} checks</span>
              }
            ]}
            data={workerLeaderboard}
            loading={loading}
            searchable
            searchKeys={['userName', 'employeeId', 'username']}
            searchPlaceholder="Search worker by name or ID..."
            emptyState={{
              icon: 'users',
              title: 'No worker time logged',
              description: 'Logged time entries in this period will rank workers here.'
            }}
          />
        </div>
      </div>
    </div>
  );
}
