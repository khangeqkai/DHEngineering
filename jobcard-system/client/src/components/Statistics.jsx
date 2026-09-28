import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { exportStatistics } from '../utils/excelExport';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/roles';
import StatisticsHeader from './statistics/StatisticsHeader';
import StatisticsKpis from './statistics/StatisticsKpis';
import TrendsTab from './statistics/TrendsTab';
import WorkersTab from './statistics/WorkersTab';
import OnTimeTab from './statistics/OnTimeTab';
import MachinesTab from './statistics/MachinesTab';
import CustomersTab from './statistics/CustomersTab';
import EmptyState from './common/EmptyState';
import { useFieldErrors, scrollFieldIntoView } from '../hooks/useFieldErrors';
import { BarChart3, Users, CheckCircle2, Cpu, Building2 } from 'lucide-react';
import { todayIsoDate } from '../utils/formatters';
import { isCalendarDate } from '../../../server/src/shared/calendarDate';
import './Statistics.css';

// First of the current month as "YYYY-MM-DD" — built from today's local date
// rather than duplicating the pad/format logic todayIsoDate already does.
const monthStartYmd = () => `${todayIsoDate().slice(0, 7)}-01`;

export default function Statistics() {
  const { user } = useAuth();
  const canSeePricing = can(user, 'pricing');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState('this_month');
  const [customStartDate, setCustomStartDate] = useState(monthStartYmd);
  const [customEndDate, setCustomEndDate] = useState(todayIsoDate);
  const [groupBy, setGroupBy] = useState('month');
  const [activeTab, setActiveTab] = useState('overview');
  const [exporting, setExporting] = useState(false);
  const reqIdRef = useRef(0);
  // One mark covers the pair of date boxes together — its value is both dates as a
  // pair, so editing either one moves the mark off whatever text it was raised
  // against.
  const { setFieldErrors, errorFor } = useFieldErrors(
    (name) => (name === 'customRange' ? [customStartDate, customEndDate] : undefined)
  );

  // Also re-loaded when the signed-in role changes, so figures fetched under
  // access the person no longer has (the invoiced money) don't linger on screen.
  useEffect(() => {
    fetchStatistics();
  }, [preset, groupBy, user?.role]);

  // The one check on a custom range, run before every load of one — Apply, Refresh,
  // Retry and a Trend View change alike — so no button can load a range Apply would
  // refuse. On failure the date boxes are marked and the current figures stay.
  const customRangeIsValid = () => {
    if (!customStartDate || !customEndDate) {
      setFieldErrors({ customRange: 'Please select both start and end dates' });
      // Land on whichever of the two is actually empty, not always the first.
      scrollFieldIntoView(customStartDate ? 'customRangeEnd' : 'customRange');
      return false;
    }
    if (!isCalendarDate(customStartDate) || !isCalendarDate(customEndDate)) {
      setFieldErrors({ customRange: 'Please enter valid dates (YYYY-MM-DD)' });
      scrollFieldIntoView('customRange');
      return false;
    }
    if (customStartDate > customEndDate) {
      setFieldErrors({ customRange: 'Start date cannot be after end date' });
      scrollFieldIntoView('customRange');
      return false;
    }
    return true;
  };

  const fetchStatistics = async () => {
    if (preset === 'custom' && !customRangeIsValid()) return;
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = { preset, groupBy };
      if (preset === 'custom') {
        params.startDate = customStartDate;
        params.endDate = customEndDate;
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
    fetchStatistics();
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExporting(true);
    // A loading toast shows for the length of the export, not just after it finishes.
    const toastId = toast.loading('Exporting…');
    try {
      const ok = await exportStatistics(data, canSeePricing);
      if (ok === 'canceled') {
        toast.dismiss(toastId);
        return;
      }
      if (ok) {
        toast.success('Workshop statistics exported to Excel', { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    } catch (err) {
      toast.error(err.message || 'Export failed', { id: toastId });
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
        customRangeError={errorFor('customRange')}
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
              // The grouping the shown rows were built with, not the dropdown's:
              // a refused load keeps the earlier rows, which must keep their title.
              groupBy={data?.range?.groupBy}
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
              totalMachineHours={summary.totalMachineHours || 0}
              loading={loading}
            />
          </div>

          <div className={`stats-tab-panel ${activeTab === 'customers' ? 'tab-active' : 'tab-hidden'}`}>
            <CustomersTab
              customerRankings={data?.customerRankings || []}
              qualityLevelDistribution={data?.qualityLevelDistribution || {}}
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
