import { Cpu, Zap, Activity, AlertTriangle } from 'lucide-react';
import { pluralize } from '../../utils/formatters';
import { wasteTone, wasteWord, WASTE_RULE } from './thresholds';
import DataTable from '../common/DataTable';
import EmptyState from '../common/EmptyState';
import { roundTo } from '../../../../server/src/shared/round';

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

export default function MachinesTab({ machineUtilization = [], totalMachineHours = 0, loading = false }) {
  // A machine keeps one colour everywhere on this page. Keying off the row's
  // position would repaint them every time the table is re-sorted.
  const colourOf = new Map(machineUtilization.map((m, i) => [m.machineNumber, PALETTE[i % PALETTE.length]]));
  // The fleet total and each machine's share come worked out from the unrounded
  // hours; the per-machine hours shown are rounded for display and never re-added.
  const maxMachineHours = machineUtilization.reduce((max, m) => Math.max(max, m.totalHours || 0), 1) || 1;
  const usedMachines = machineUtilization.filter(m => m.sessionCount > 0);
  const activeMachinesCount = usedMachines.length;
  // A machine with no runs logged isn't "busiest" — there's nothing to compare.
  // The list arrives busiest first.
  const topMachine = usedMachines[0] || null;
  const topMachineShare = topMachine ? topMachine.sharePercent : 0;

  const totalParts = machineUtilization.reduce((sum, m) => sum + (m.partsProduced || 0), 0);
  const totalScrap = machineUtilization.reduce((sum, m) => sum + (m.scrapQty || 0), 0);
  const fleetScrapRate = (totalParts + totalScrap) > 0
    ? roundTo((totalScrap / (totalParts + totalScrap)) * 100, 1)
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
            <div className="kpi-value">{loading ? <span className="stat-dash">—</span> : `${totalMachineHours}h`}</div>
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
            <div className="kpi-value compact">
              {loading ? <span className="stat-dash">—</span> : (topMachine ? (topMachine.name || topMachine.machineNumber) : <span className="stat-dash">—</span>)}
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
            <span className={`kpi-badge ${wasteTone(fleetScrapRate)}`}>
              {wasteWord(fleetScrapRate)}
            </span>
          </div>
          <p className="kpi-rule">{WASTE_RULE}</p>
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
            <span>How machine hours were shared</span>
          </div>
          <span className="stats-card-note">
            Each machine’s share of the hours logged in this period
          </span>
        </div>

        <div className="stats-card-body">
          {loading ? (
            <div className="stats-skeleton">
              <div className="skeleton-bar w-50" />
              <div className="skeleton-bar w-100" />
              <div className="skeleton-bar block w-85" />
              <div className="skeleton-bar block w-70" />
            </div>
          ) : machineUtilization.length === 0 ? (
            <EmptyState
              icon="cpu"
              title="No machine work logged"
              description="Work logged against a machine shows up here."
            />
          ) : (
            <div className="machine-share">
              {/* Proportional Fleet Distribution Multi-Segment Bar */}
              {activeMachinesCount > 0 && (
                <div className="machine-fleet">
                  <div className="machine-fleet-head">
                    <span>All machines together</span>
                    <span>{pluralize(totalMachineHours, 'hour')} in total</span>
                  </div>
                  <div className="machine-fleet-bar">
                    {usedMachines.map((m) => {
                      const sharePct = m.sharePercent;
                      const color = colourOf.get(m.machineNumber);
                      return (
                        <div
                          key={m.machineNumber}
                          className="machine-fleet-seg"
                          style={{ '--bar-w': `${sharePct}%`, '--machine-colour': color }}
                          title={`Machine ${m.machineNumber} (${m.name}): ${m.totalHours}h (${sharePct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Individual Machine Horizontal Progress Bars */}
              <div className="machine-list">
                {machineUtilization.map((m) => {
                  const sharePct = m.sharePercent || 0;
                  const relativeBarPct = (m.totalHours / maxMachineHours) * 100;
                  const color = colourOf.get(m.machineNumber);
                  const machinePartsTotal = (m.partsProduced || 0) + (m.scrapQty || 0);
                  const machineScrapPct = machinePartsTotal > 0
                    ? roundTo(((m.scrapQty || 0) / machinePartsTotal) * 100, 1)
                    : 0;

                  return (
                    <div
                      key={m.machineNumber}
                      className="machine-row"
                      style={{ '--machine-colour': color }}
                    >
                      <div className="machine-row-head">
                        <div className="machine-row-name">
                          <span className="machine-dot" />
                          <code className="machine-code boxed">
                            #{m.machineNumber}
                          </code>
                          <strong className="machine-name">{m.name}</strong>
                          {m.description && (
                            <span className="machine-desc">
                              • {m.description}
                            </span>
                          )}
                        </div>

                        <div className="machine-row-stats">
                          <span className="machine-parts">
                            {m.partsProduced?.toLocaleString() || 0} good parts
                            {m.scrapQty > 0 && (
                              <span className="machine-scrap is-bad">
                                ({m.scrapQty} scrapped / {machineScrapPct}%)
                              </span>
                            )}
                          </span>
                          <span className="machine-hours">
                            {m.totalHours}h
                          </span>
                          <span className="tier-tag normal machine-share-tag">
                            {sharePct.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Visual Bar */}
                      <div className="distribution-bar-bg">
                        <div
                          className="distribution-bar-fill machine"
                          style={{ '--bar-w': `${Math.max(2, relativeBarPct)}%` }}
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
            <span>Every machine in full</span>
          </div>
        </div>
        <div className="stats-card-body flush">
          <DataTable
            columns={[
              {
                key: 'machineNumber',
                label: 'Machine #',
                sortable: true,
                render: (val) => (
                  <code className="machine-code">
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
                      <div className="stats-cell-sub">
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
                  const sharePct = row.sharePercent || 0;
                  const color = colourOf.get(row.machineNumber);
                  return (
                    <div className="machine-share-cell">
                      <div className="machine-share-track">
                        <div className="machine-share-fill" style={{ '--bar-w': `${sharePct}%`, '--machine-colour': color }} />
                      </div>
                      <span className="machine-share-pct">
                        {sharePct.toFixed(1)}%
                      </span>
                    </div>
                  );
                }
              },
              {
                key: 'totalHours',
                label: 'Hours Worked',
                align: 'right',
                sortable: true,
                render: (val) => (
                  <strong className={`stats-mono${val > 0 ? ' is-accent' : ''}`}>
                    {val}h
                  </strong>
                )
              },
              {
                key: 'sessionCount',
                label: 'Runs Logged',
                align: 'right',
                sortable: true,
                render: (val) => <span>{val} runs</span>
              },
              {
                key: 'partsProduced',
                label: 'Good Parts Made',
                align: 'right',
                sortable: true,
                render: (val) => (val || 0).toLocaleString()
              },
              {
                key: 'scrapQty',
                label: 'Scrapped',
                align: 'right',
                sortable: true,
                render: (val, row) => {
                  const total = (row.partsProduced || 0) + (val || 0);
                  const scrapPct = total > 0 ? roundTo((val / total) * 100, 1) : 0;
                  return (
                    <span className={val > 0 ? 'is-bad' : undefined}>
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
            searchPlaceholder="Search machine by number or name…"
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
