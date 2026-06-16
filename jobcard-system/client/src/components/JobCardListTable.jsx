import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { SORT_VALUE_GETTERS } from '../hooks/useJobCardSort';

export default function JobCardListTable({
  visibleColumns,
  paginatedCards,
  sortBy,
  sortDir,
  onSort,
  activeTimerJobcardId,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDrop
}) {
  return (
    <table className="table table-compact">
      <thead>
        <tr>
          {visibleColumns.map(col => {
            const sortable = !!SORT_VALUE_GETTERS[col.id];
            const active = sortable && sortBy === col.id;
            return (
              <th
                key={col.id}
                draggable
                onDragStart={(e) => handleDragStart(e, col.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                onClick={sortable ? () => onSort(col.id) : undefined}
                className={`jc-th${sortable ? ' jc-th-sortable' : ''}${active ? ' jc-th-sorted' : ''}${col.align ? ` jc-align-${col.align}` : ''}`}
                title={sortable ? 'Click to sort, drag to reorder' : 'Drag to reorder columns'}
                aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                <span className="jc-th-label">{col.label}</span>
                {sortable && (
                  <span className="jc-sort-icon" aria-hidden="true">
                    {!active && <ChevronsUpDown size={12} />}
                    {active && sortDir === 'asc' && <ChevronUp size={14} />}
                    {active && sortDir === 'desc' && <ChevronDown size={14} />}
                  </span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {paginatedCards.map((card) => {
          const isOverdue = card.dueDate &&
            new Date(card.dueDate) < new Date() &&
            !['DONE', 'INVOICED'].includes(card.status);
          const isPinnedTimer = card.id === activeTimerJobcardId;
          const rowClasses = [
            isOverdue ? 'overdue-row' : '',
            isPinnedTimer ? 'pinned-timer-row' : ''
          ].filter(Boolean).join(' ');

          return (
            <tr key={card.id} className={rowClasses}>
              {visibleColumns.map(col => col.renderCell(card, isOverdue))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
