import { RotateCw, Printer, Download } from 'lucide-react';
import PageHeader from '../common/PageHeader';
import Spinner from '../common/Spinner';
import FieldError from '../common/FieldError';

export default function StatisticsHeader({
  preset,
  setPreset,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  customRangeError,
  groupBy,
  setGroupBy,
  rangeLabel,
  loading,
  exporting,
  hasData,
  onRefresh,
  onPrint,
  onExportExcel,
  onApplyCustomRange
}) {
  return (
    <>
      <PageHeader title="Workshop Statistics">
        <div className="stats-actions">
          <button
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh data"
          >
            {loading ? <Spinner size={16} /> : <RotateCw size={16} />}
            <span>Refresh</span>
          </button>
          <button
            className="btn btn-secondary"
            onClick={onPrint}
            title="Print report"
          >
            <Printer size={16} />
            <span>Print Report</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={onExportExcel}
            disabled={exporting || !hasData}
            title="Export full statistics to Excel"
          >
            <Download size={16} />
            <span>{exporting ? 'Exporting...' : 'Export Excel'}</span>
          </button>
        </div>
      </PageHeader>

      <div className="stats-subtitle-bar">
        Performance analytics, worker hours, on-time delivery &amp; shop metrics for <strong>{rangeLabel || 'This Month'}</strong>
      </div>

      <div className="stats-controls-bar">
        <div className="preset-pills">
          <button
            className={`preset-pill ${preset === 'this_month' ? 'active' : ''}`}
            onClick={() => setPreset('this_month')}
          >
            This Month
          </button>
          <button
            className={`preset-pill ${preset === 'last_month' ? 'active' : ''}`}
            onClick={() => setPreset('last_month')}
          >
            Last Month
          </button>
          <button
            className={`preset-pill ${preset === 'last_3_months' ? 'active' : ''}`}
            onClick={() => setPreset('last_3_months')}
          >
            Last 3 Months
          </button>
          <button
            className={`preset-pill ${preset === 'last_6_months' ? 'active' : ''}`}
            onClick={() => setPreset('last_6_months')}
          >
            Last 6 Months
          </button>
          <button
            className={`preset-pill ${preset === 'this_year' ? 'active' : ''}`}
            onClick={() => setPreset('this_year')}
          >
            This Year (YTD)
          </button>
          <button
            className={`preset-pill ${preset === 'last_year' ? 'active' : ''}`}
            onClick={() => setPreset('last_year')}
          >
            Last Year
          </button>
          <button
            className={`preset-pill ${preset === 'all' ? 'active' : ''}`}
            onClick={() => setPreset('all')}
          >
            All Time
          </button>
          <button
            className={`preset-pill ${preset === 'custom' ? 'active' : ''}`}
            onClick={() => setPreset('custom')}
          >
            Custom Range
          </button>
        </div>

        {preset === 'custom' && (
          <div className={customRangeError ? 'field-error' : ''}>
            {/* noValidate: the browser's own "please fill out this field" bubble is
                a pop-up, and it also swallows the submit before our own check can
                mark the box. The check below the form does both jobs. */}
            <form onSubmit={onApplyCustomRange} className="custom-range-inputs" noValidate>
              <input
                type="date"
                id="customRange"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
              <span className="custom-range-separator">to</span>
              <input
                type="date"
                id="customRangeEnd"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-primary">
                Apply
              </button>
            </form>
            <FieldError message={customRangeError} />
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Trend View:</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: 'var(--text-xs)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--surface)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </div>
      </div>
    </>
  );
}
