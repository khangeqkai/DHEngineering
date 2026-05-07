import { PAGE_SIZE } from './JobCardList.constants';

export default function JobCardListPagination({ currentPage, totalPages, totalItems, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((page) => {
    if (totalPages <= 7) return true;
    if (page === 1 || page === totalPages) return true;
    if (Math.abs(page - currentPage) <= 1) return true;
    return false;
  });

  return (
    <div className="pagination-bar">
      <span className="pagination-info">
        {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems}
      </span>
      <div className="pagination-buttons">
        <button
          className="btn btn-secondary btn-sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Prev
        </button>
        {pages.map((page, idx, arr) => {
          const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
          return (
            <span key={page} style={{ display: 'contents' }}>
              {showEllipsis && <span className="pagination-ellipsis">&hellip;</span>}
              <button
                className={`btn btn-sm ${page === currentPage ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            </span>
          );
        })}
        <button
          className="btn btn-secondary btn-sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
