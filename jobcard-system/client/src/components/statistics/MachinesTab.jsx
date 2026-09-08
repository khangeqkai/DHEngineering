import { Cpu, Zap, Activity, AlertTriangle } from 'lucide-react';
import DataTable from '../common/DataTable';
import EmptyState from '../common/EmptyState';

const PALETTE = [
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#64748b'  // Slate
];

export default function MachinesTab({ machineUtilization = [], loading = false }) {
  // A machine keeps one colour everywhere on this page. Keying off the row's
  // position would repaint them every time the table is re-sorted.
  const colourOf = new Map(machineUtilization.map((m, i) => [m.machineNumber, PALETTE[i % PALETTE.length]]));
  const totalMachineHours = machineUtilization.reduce((sum, m) => sum + (m.totalHours || 0), 0);
  const maxMachineHours = machineUtilization.reduce((max, m) => Math.max(max, m.totalHours || 0), 1) || 1;
  const activeMachinesCount = machineUtilization.filter(m => m.totalHours > 0).length;
  const topMachine = machineUtilization.length > 0 ? machineUtilization[0] : null;
  const topMachineShare = totalMachineHours > 0 && topMachine
    ? Math.round((topMachine.totalHours / totalMachineHours) * 1000) / 10
    : 0;

  const totalParts = machineUtilization.reduce((sum, m) => sum + (m.partsProduced || 0), 0);
  const totalScrap = machineUtilization.reduce((sum, m) => sum + (m.scrapQty || 0), 0);
  const fleetScrapRate = (totalParts + totalScrap) > 0
    ? Math.round((totalScrap / (totalParts + totalScrap)) * 1000) / 10
    : 0;

  return (
    <div className="stats-panel">
      {/* Fleet Summary KPI Ribbon */}
      <div className="stats-kpi-grid">
        <div className="kpi-card hours">
          <div className="kpi-header">
            <span className="kpi-title">Machine Hours</span>
            <div className="kpi-icon"><Cpu size={16} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{loading ? <span className="stat-dash">—</span> : `${Math.round(totalMachineHours * 10) / 10}h`}</div>
          </div>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Machines Used:</span>
              <span className="kpi-stat-val">{activeMachinesCount} in use</span>
            </div>
          </div>
        </div>

        <div className="kpi-card on-time">
          <div className="kpi-header">
            <span className="kpi-title">Busiest Machine</span>
            <div className="kpi-icon"><Zap size={16} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value" style={{ fontSize: 'var(--text-xl)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {loading ? <span className="stat-dash">—</span> : (topMachine ? topMachine.name : <span className="stat-dash">—</span>)}
            </div>
          </div>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Share Of Machine Hours:</span>
              <span className="kpi-stat-val">{topMachine ? `${topMachine.totalHours}h (${topMachineShare}%)` : '—'}</span>
            </div>
          </div>
        </div>

        <div className="kpi-card scrap">
          <div className="kpi-header">
            <span className="kpi-title">Scrapped Parts</span>
            <div className="kpi-icon"><AlertTriangle size={16} /></div>
          </div>
          <div className="kpi-body">
            <div className="kpi-value">{loading ? <span className="stat-dash">—</span> : `${fleetScrapRate}%`}</div>
            <span className={`kpi-badge ${fleetScrapRate <= 3 ? 'success' : fleetScrapRate <= 7 ? 'warning' : 'danger'}`}>
              {fleetScrapRate <= 3 ? 'Low Waste' : fleetScrapRate <= 7 ? 'Moderate' : 'Elevated'}
            </span>
          </div>
          <div className="kpi-footer">
            <div className="kpi-stat-row">
              <span className="kpi-stat-label">Pieces Scrapped:</span>
              <span className="kpi-stat-val">{totalScrap.toLocaleString()} pcs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Workload Distribution Card */}
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <Activity size={18} />
            <span>How Machine Hours Were Shared</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Each machine’s share of the hours logged in this period
          </span>
        </div>

        <div className="stats-card-body">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-2) 0' }}>
              <div className="skeleton-bar" style={{ width: '50%', height: '14px' }} />
              <div className="skeleton-bar" style={{ width: '100%', height: '14px' }} />
              <div className="skeleton-bar" style={{ width: '85%', height: '40px' }} />
              <div className="skeleton-bar" style={{ width: '70%', height: '40px' }} />
            </div>
          ) : machineUtilization.length === 0 ? (
            <EmptyState
              icon="cpu"
              title="No machine work logged"
              description="Work logged against a machine shows up here."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Proportional Fleet Distribution Multi-Segment Bar */}
              {totalMachineHours > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    <span>All Machines Together</span>
                    <span>{totalMachineHours.toFixed(1)} hours in total</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '14px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    display: 'flex',
                    background: 'var(--background)',
                    border: '1px solid var(--border-color)'
                  }}>
                    {machineUtilization.filter(m => m.totalHours > 0).map((m, idx) => {
                      const sharePct = (m.totalHours / totalMachineHours) * 100;
                      const color = colourOf.get(m.machineNumber);
                      return (
                        <div
                          key={m.machineNumber}
                          style={{
                            width: `${sharePct}%`,
                            background: color,
                            transition: 'width 0.3s ease'
                          }}
                          title={`Machine ${m.machineNumber} (${m.name}): ${m.totalHours}h (${sharePct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Individual Machine Horizontal Progress Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {machineUtilization.map((m, idx) => {
                  const sharePct = totalMachineHours > 0 ? (m.totalHours / totalMachineHours) * 100 : 0;
                  const relativeBarPct = (m.totalHours / maxMachineHours) * 100;
                  const color = colourOf.get(m.machineNumber);
                  const machinePartsTotal = (m.partsProduced || 0) + (m.scrapQty || 0);
                  const machineScrapPct = machinePartsTotal > 0
                    ? Math.round(((m.scrapQty || 0) / machinePartsTotal) * 1000) / 10
                    : 0;

                  return (
                    <div
                      key={m.machineNumber}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '10px 14px',
                        background: 'var(--background)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: color,
                              flexShrink: 0
                            }}
                          />
                          <code style={{
                            fontWeight: 'bold',
                            fontSize: 'var(--text-xs)',
                            background: 'var(--surface)',
                            border: '1px solid var(--border-color)',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            #{m.machineNumber}
                          </code>
                          <strong style={{ fontSize: 'var(--text-sm)' }}>{m.name}</strong>
                          {m.description && (
                            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                              • {m.description}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                            {m.partsProduced?.toLocaleString() || 0} good parts
                            {m.scrapQty > 0 && (
                              <span style={{ color: 'var(--accent-caution)', marginLeft: '6px' }}>
                                ({m.scrapQty} scrapped / {machineScrapPct}%)
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
                            {m.totalHours}h
                          </span>
                          <span className="tier-tag normal" style={{ minWidth: '55px', justifyContent: 'center' }}>
                            {sharePct.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Visual Bar */}
                      <div className="distribution-bar-bg" style={{ height: '8px' }}>
                        <div
                          className="distribution-bar-fill"
                          style={{
                            width: `${Math.max(2, relativeBarPct)}%`,
                            background: color
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Machine Data Table */}
      <div className="stats-card">
        <div className="stats-card-header">
          <div className="stats-card-title">
            <Cpu size={18} />
            <span>Every Machine In Full</span>
          </div>
        </div>
        <div className="stats-card-body" style={{ padding: 0 }}>
          <DataTable
            columns={[
              {
                key: 'machineNumber',
                label: 'Machine #',
                sortable: true,
                render: (val) => (
                  <code style={{
                    fontWeight: 'bold',
                    background: 'var(--background)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    {val}
                  </code>
                )
              },
              {
                key: 'name',
                label: 'Machine Name',
                sortable: true,
                render: (val, row) => (
                  <div>
                    <strong>{val}</strong>
                    {row.description && (
                      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                        {row.description}
                      </div>
                    )}
                  </div>
                )
              },
              {
                key: 'shareOfHours',
                label: 'Share Of Hours',
                sortable: false,
                render: (_val, row) => {
                  const sharePct = totalMachineHours > 0 ? ((row.totalHours || 0) / totalMachineHours) * 100 : 0;
                  const color = colourOf.get(row.machineNumber);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' }}>
                      <div style={{ flex: 1, height: '6px', background: 'var(--background)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ width: `${sharePct}%`, height: '100%', background: color }} />
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', minWidth: '40px' }}>
                        {sharePct.toFixed(1)}%
                      </span>
                    </div>
                  );
                }
              },
              {
                key: 'totalHours',
                label: 'Hours Worked',
                sortable: true,
                render: (val) => (
                  <strong style={{ fontFamily: 'var(--font-mono)', color: val > 0 ? 'var(--primary-accent)' : 'inherit' }}>
                    {val}h
                  </strong>
                )
              },
              {
                key: 'sessionCount',
                label: 'Runs Logged',
                sortable: true,
                render: (val) => <span>{val} runs</span>
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
                render: (val, row) => {
                  const total = (row.partsProduced || 0) + (val || 0);
                  const scrapPct = total > 0 ? Math.round((val / total) * 1000) / 10 : 0;
                  return (
                    <span style={{ color: val > 0 ? 'var(--accent-caution)' : 'inherit' }}>
                      {val || 0} pieces {val > 0 ? `(${scrapPct}%)` : ''}
                    </span>
                  );
                }
              },
              {
                key: 'active',
                label: 'Status',
                sortable: true,
                render: (val) => (
                  <span className={`kpi-badge ${val ? 'success' : 'neutral'}`}>
                    {val ? 'Active' : 'Archived'}
                  </span>
                )
              }
            ]}
            data={machineUtilization}
            loading={loading}
            searchable
            searchKeys={['machineNumber', 'name', 'description']}
            searchPlaceholder="Search machine by number or name..."
            emptyState={{
              icon: 'cpu',
              title: 'No machine work logged',
              description: 'Work logged against a machine shows up here.'
            }}
          />
        </div>
      </div>
    </div>
  );
}
