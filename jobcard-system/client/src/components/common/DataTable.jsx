import { useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Inbox } from 'lucide-react';
import useTableSort from '../../hooks/useTableSort';
import useTableFilter from '../../hooks/useTableFilter';
import useTableResize from '../../hooks/useTableResize';
import EmptyState from './EmptyState';
import './DataTable.css';

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
  // Called with the rows currently on screen (search-filtered, sorted) whenever
  // they change, so a caller like "Export Current View" can send exactly what the
  // table shows instead of the whole unfiltered dataset. Pass a plain useState
  // setter — it's referentially stable, so this never loops.
  onVisibleRowsChange,
  // Only used when onRowClick is set: (row) => string, the label read out for the
  // button that opens the row — e.g. "Open job 1234". Optional; without it the
  // button falls back to a generic label.
  getRowAriaLabel,
}) {
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

  useEffect(() => {
    if (onVisibleRowsChange) onVisibleRowsChange(sortedData);
  }, [sortedData, onVisibleRowsChange]);

  // A search that matches nothing is a different situation from there being no
  // rows at all — "no matches for the term you typed" instead of the page's usual
  // "nothing here yet" empty state, which would otherwise wrongly invite the user
  // to add their first row when rows already exist.
  const hasRowsOverall = Array.isArray(data) && data.length > 0;
  const noMatches = searchable && searchTerm.trim() && hasRowsOverall && sortedData.length === 0;

  const getSortIcon = (columnKey) => {
    if (sortKey !== columnKey) return <ChevronsUpDown size={14} />;
    return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  const getSortClass = (columnKey) => {
    if (sortKey !== columnKey) return '';
    return sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc';
  };

  return (
    <div className="data-table-wrapper">
      {searchable && (
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
        </div>
      )}

      <div className="data-table-container">
        {!loading && sortedData.length === 0 ? (
          noMatches ? (
            <EmptyState icon="search" title="No matches" description={`No matches for "${searchTerm.trim()}"`} />
          ) : emptyState ? (
            <EmptyState {...emptyState} />
          ) : (
            <div className="data-table-empty">
              <div className="data-table-empty-icon" aria-hidden="true">
                <Inbox size={40} />
              </div>
              <div className="data-table-empty-text">{emptyMessage}</div>
            </div>
          )
        ) : (
          <table className="table data-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`${col.sortable ? 'sortable' : ''} ${getSortClass(col.key)}`}
                    style={columnWidths[col.key] ? { width: columnWidths[col.key] } : undefined}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    onKeyDown={col.sortable ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSort(col.key);
                      }
                    } : undefined}
                    tabIndex={col.sortable ? 0 : undefined}
                    aria-sort={sortKey === col.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
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
                    {columns.map((col, colIndex) => {
                      const cellContent = col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-');
                      // Keyboard/screen-reader access to a clickable row lives on a real
                      // button in the first cell, not on the <tr> — a row keeps its native
                      // table semantics instead of masquerading as a button. The click still
                      // opens the row (stopPropagation keeps the row's own onClick from
                      // firing a second time on top of it).
                      if (onRowClick && colIndex === 0) {
                        return (
                          <td key={col.key}>
                            <button
                              type="button"
                              className="row-link-btn"
                              onClick={(e) => { e.stopPropagation(); onRowClick(row); }}
                              aria-label={getRowAriaLabel ? getRowAriaLabel(row) : 'Open row'}
                            >
                              {cellContent}
                            </button>
                          </td>
                        );
                      }
                      return <td key={col.key}>{cellContent}</td>;
                    })}
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
