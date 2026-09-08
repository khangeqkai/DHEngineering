import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { exportStatistics } from '../utils/excelExport';
import StatisticsHeader from './statistics/StatisticsHeader';
import StatisticsKpis from './statistics/StatisticsKpis';
import TrendsTab from './statistics/TrendsTab';
import WorkersTab from './statistics/WorkersTab';
import OnTimeTab from './statistics/OnTimeTab';
import MachinesTab from './statistics/MachinesTab';
import CustomersTab from './statistics/CustomersTab';
import EmptyState from './common/EmptyState';
import { BarChart3, Users, CheckCircle2, Cpu, Building2 } from 'lucide-react';
import './Statistics.css';

  const todayYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const monthStartYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

export default function Statistics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState(monthStartYmd);
  const [customEndDate, setCustomEndDate] = useState(todayYmd);
  const [groupBy, setGroupBy] = useState('month');
  const [activeTab, setActiveTab] = useState('overview');
  const [exporting, setExporting] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    fetchStatistics();
  }, [preset, groupBy]);

  const fetchStatistics = async () => {
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = { preset, groupBy };
      if (preset === 'custom') {
        const start = customStartDate || monthStartYmd();
        const end = customEndDate || todayYmd();
        params.startDate = start;
        params.endDate = end;
      }
      const res = await api.getStatistics(params);
      if (currentReqId === reqIdRef.current) {
        setData(res);
      }
    } catch (err) {
      if (currentReqId === reqIdRef.current) {
        setError(err.message || 'Failed to load statistics');
        setData(null);
        toast.error(err.message || 'Failed to load statistics');
      }
    } finally {
      if (currentReqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  };

  const handleApplyCustomRange = (e) => {
    e.preventDefault();
    if (!customStartDate || !customEndDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(customEndDate) ||
        isNaN(Date.parse(customStartDate)) || isNaN(Date.parse(customEndDate))) {
      toast.error('Please enter valid dates (YYYY-MM-DD)');
      return;
    }
    if (customStartDate > customEndDate) {
      toast.error('Start date cannot be after end date');
      return;
    }
    fetchStatistics();
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const ok = await exportStatistics(data);
      if (ok === 'canceled') return;
      if (ok) toast.success('Workshop statistics exported to Excel');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary || {};
  const range = data?.range || {};

  return (
    <div className="statistics-page page-enter">
      <StatisticsHeader
        preset={preset}
        setPreset={setPreset}
        customStartDate={customStartDate}
        setCustomStartDate={setCustomStartDate}
        customEndDate={customEndDate}
        setCustomEndDate={setCustomEndDate}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        rangeLabel={range.label}
        loading={loading}
        exporting={exporting}
        hasData={!!data}
        onRefresh={fetchStatistics}
        onPrint={() => window.print()}
        onExportExcel={handleExportExcel}
        onApplyCustomRange={handleApplyCustomRange}
      />

      {error && !loading && (
        <div className="stats-card">
          <div className="stats-card-body">
            <EmptyState
              icon="alert-triangle"
              title="Unable to load statistics"
              description={error}
              actionLabel="Retry"
              onAction={fetchStatistics}
            />
          </div>
        </div>
      )}

      {!error && (data || loading) && (
        <>
          <StatisticsKpis
            summary={summary}
            activeWorkersCount={(data?.workerLeaderboard || []).length}
            rangeLabel={range.label}
            loading={loading}
          />

          <div className="stats-tabs">
            <button
              className={`stats-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <BarChart3 size={16} />
              <span>Overview</span>
            </button>
            <button
              className={`stats-tab-btn ${activeTab === 'workers' ? 'active' : ''}`}
              onClick={() => setActiveTab('workers')}
            >
              <Users size={16} />
              <span>Workers</span>
            </button>
            <button
              className={`stats-tab-btn ${activeTab === 'ontime' ? 'active' : ''}`}
              onClick={() => setActiveTab('ontime')}
            >
              <CheckCircle2 size={16} />
              <span>Late Jobs ({summary.lateJobsCount || 0})</span>
            </button>
            <button
              className={`stats-tab-btn ${activeTab === 'machines' ? 'active' : ''}`}
              onClick={() => setActiveTab('machines')}
            >
              <Cpu size={16} />
              <span>Machines</span>
            </button>
            <button
              className={`stats-tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              <Building2 size={16} />
              <span>Customers</span>
            </button>
          </div>

          {/* Screen Tab Views (Active tab displayed on screen) */}
          <div className={`stats-tab-panel ${activeTab === 'overview' ? 'tab-active' : 'tab-hidden'}`}>
            <TrendsTab
              periodTrends={data?.periodTrends || []}
              groupBy={groupBy}
              loading={loading}
            />
          </div>

          <div className={`stats-tab-panel ${activeTab === 'workers' ? 'tab-active' : 'tab-hidden'}`}>
            <WorkersTab
              workerLeaderboard={data?.workerLeaderboard || []}
              loading={loading}
            />
          </div>

          <div className={`stats-tab-panel ${activeTab === 'ontime' ? 'tab-active' : 'tab-hidden'}`}>
            <OnTimeTab
              summary={summary}
              delayedJobsList={data?.delayedJobsList || []}
              loading={loading}
            />
          </div>

          <div className={`stats-tab-panel ${activeTab === 'machines' ? 'tab-active' : 'tab-hidden'}`}>
            <MachinesTab
              machineUtilization={data?.machineUtilization || []}
              loading={loading}
            />
          </div>

          <div className={`stats-tab-panel ${activeTab === 'customers' ? 'tab-active' : 'tab-hidden'}`}>
            <CustomersTab
              customerRankings={data?.customerRankings || []}
              qaLevelDistribution={data?.qaLevelDistribution || {}}
              priorityDistribution={data?.priorityDistribution || {}}
              totalJobsCreated={summary.totalJobsCreated || 0}
              loading={loading}
            />
          </div>
        </>
      )}
    </div>
  );
}
