import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Inbox } from 'lucide-react';
import useTableSort from '../../hooks/useTableSort';
import useTableFilter from '../../hooks/useTableFilter';
import useTableResize from '../../hooks/useTableResize';
import EmptyState from './EmptyState';
import './DataTable.css';

export default function DataTable({
  columns,
  data,
  onRowClick,
  searchable = false,
  searchKeys = [],
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data found',
  emptyState,
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
        {sortedData.length === 0 ? (
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
              {sortedData.map((row, rowIndex) => (
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
