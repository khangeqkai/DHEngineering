import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Inbox } from 'lucide-react';
import useTableSort from '../../hooks/useTableSort';
import useTableFilter from '../../hooks/useTableFilter';
import useTableResize from '../../hooks/useTableResize';
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
  defaultSortKey = null,
  defaultSortOrder = 'asc',
  rowClassName,
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
        <div className="data-table-search">
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
          <div className="data-table-empty">
            <div className="data-table-empty-icon">
              <Inbox size={40} />
            </div>
            <div className="data-table-empty-text">{emptyMessage}</div>
          </div>
        ) : (
          <table className="table data-table">
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
