import { useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Inbox } from 'lucide-react';
import useTableSort from '../../hooks/useTableSort';
import useTableFilter from '../../hooks/useTableFilter';
import useTableResize from '../../hooks/useTableResize';
import EmptyState from './EmptyState';
import './DataTable.css';

const DENSITY_OPTIONS = [
  {
    key: 'compact',
    label: 'Compact',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'comfortable',
    label: 'Comfortable',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="2" rx="1" fill="currentColor" />
        <rect x="2" y="7" width="12" height="2" rx="1" fill="currentColor" />
        <rect x="2" y="12" width="12" height="2" rx="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'spacious',
    label: 'Spacious',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="1" width="12" height="2.5" rx="1" fill="currentColor" />
        <rect x="2" y="6.75" width="12" height="2.5" rx="1" fill="currentColor" />
        <rect x="2" y="12.5" width="12" height="2.5" rx="1" fill="currentColor" />
      </svg>
    ),
  },
];

function getInitialDensity() {
  try {
    const stored = localStorage.getItem('table-density');
    if (stored && ['compact', 'comfortable', 'spacious'].includes(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return 'comfortable';
}

const SKELETON_ROW_COUNT = 5;
const SKELETON_WIDTHS = ['75%', '60%', '85%', '70%', '90%'];

function SkeletonRows({ columnCount }) {
  return Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
    <tr key={`skeleton-${rowIndex}`} className="skeleton-row">
      {Array.from({ length: columnCount }, (_, colIndex) => (
        <td key={`skeleton-${rowIndex}-${colIndex}`}>
          <div
            className="skeleton-bar"
            style={{ width: SKELETON_WIDTHS[(rowIndex + colIndex) % SKELETON_WIDTHS.length] }}
          />
        </td>
      ))}
    </tr>
  ));
}

export default function DataTable({
  columns,
  data,
  onRowClick,
  loading = false,
  searchable = false,
  searchKeys = [],
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data found',
  emptyState,
  defaultSortKey = null,
  defaultSortOrder = 'asc',
  rowClassName,
}) {
  const [density, setDensity] = useState(getInitialDensity);
  const { searchTerm, setSearchTerm, filteredData } = useTableFilter(
    data,
    searchKeys
  );
  const { sortKey, sortOrder, handleSort, sortedData } = useTableSort(
    filteredData,
    defaultSortKey,
    defaultSortOrder
  );
  const { columnWidths, onMouseDown } = useTableResize(columns);

  const handleDensityChange = useCallback((key) => {
    setDensity(key);
    try {
      localStorage.setItem('table-density', key);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const getSortIcon = (columnKey) => {
    if (sortKey !== columnKey) return <ChevronsUpDown size={14} />;
    return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const getSortClass = (columnKey) => {
    if (sortKey !== columnKey) return '';
    return sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc';
  };

  const densityToggle = (
    <div className="data-table-density-toggle">
      {DENSITY_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`data-table-density-btn${density === opt.key ? ' active' : ''}`}
          title={opt.label}
          onClick={() => handleDensityChange(opt.key)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`data-table-wrapper density-${density}`}>
      {searchable ? (
        <div className="data-table-toolbar">
          <div className="data-table-search-input">
            <span className="data-table-search-icon">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
          {densityToggle}
        </div>
      ) : (
        <div className="data-table-toolbar data-table-toolbar-end">
          {densityToggle}
        </div>
      )}

      <div className="data-table-container">
        {!loading && sortedData.length === 0 ? (
          emptyState ? (
            <EmptyState {...emptyState} />
          ) : (
            <div className="data-table-empty">
              <div className="data-table-empty-icon">
                <Inbox size={40} />
              </div>
              <div className="data-table-empty-text">{emptyMessage}</div>
            </div>
          )
        ) : (
          <table className={`table data-table density-${density}`}>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.sortable ? 'sortable' : ''} ${getSortClass(col.key)}`}
                    style={columnWidths[col.key] ? { width: columnWidths[col.key] } : undefined}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="data-table-header-content">
                      {col.label}
                      {col.sortable && (
                        <span className="data-table-sort-icon">
                          {getSortIcon(col.key)}
                        </span>
                      )}
                    </span>
                    {col.resizable && (
                      <span
                        className="data-table-resize-handle"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onMouseDown(e, col.key);
                        }}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows columnCount={columns.length} />
              ) : (
                sortedData.map((row, rowIndex) => (
                  <tr
                    key={row.id || rowIndex}
                    className={`${onRowClick ? 'clickable' : ''} ${typeof rowClassName === 'function' ? rowClassName(row) : ''}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.key}>
                        {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
