import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showPageNumbers?: boolean;
}

/**
 * Generates the list of page numbers to display, inserting ellipsis markers
 * when the range is too large to show every page.
 *
 * Always shows first page, last page, and a window of pages around the
 * current page.
 */
function getPageNumbers(current: number, total: number): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];

  // Always include first page
  pages.push(1);

  if (current > 3) {
    pages.push('ellipsis-start');
  }

  // Window around current page
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('ellipsis-end');
  }

  // Always include last page
  pages.push(total);

  return pages;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showPageNumbers = true,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  const handlePrevious = () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  };

  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      {/* Previous button */}
      <button
        onClick={handlePrevious}
        onKeyDown={(e) => handleKeyDown(e, handlePrevious)}
        disabled={currentPage <= 1}
        aria-label="Go to previous page"
        className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg
          border border-surface-200 dark:border-surface-700
          text-surface-700 dark:text-surface-200
          hover:bg-surface-50 dark:hover:bg-surface-700
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-900
          transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Previous</span>
      </button>

      {/* Page numbers */}
      {showPageNumbers && (
        <div className="flex items-center gap-1" role="list">
          {pages.map((page, index) => {
            if (page === 'ellipsis-start' || page === 'ellipsis-end') {
              return (
                <span
                  key={page}
                  className="px-2 py-2 text-sm text-surface-400 dark:text-surface-500 select-none"
                  aria-hidden="true"
                  role="listitem"
                >
                  ...
                </span>
              );
            }

            const isActive = page === currentPage;

            return (
              <button
                key={`page-${page}-${index}`}
                onClick={() => onPageChange(page)}
                onKeyDown={(e) => handleKeyDown(e, () => onPageChange(page))}
                aria-label={`Go to page ${page}`}
                aria-current={isActive ? 'page' : undefined}
                role="listitem"
                className={`min-w-[2.25rem] h-9 px-2 text-sm font-medium rounded-lg
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-900
                  transition-colors
                  ${isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 border border-surface-200 dark:border-surface-700'
                  }`}
              >
                {page}
              </button>
            );
          })}
        </div>
      )}

      {/* Page info for non-numbered mode */}
      {!showPageNumbers && (
        <span className="text-sm text-surface-500 dark:text-surface-400 px-3">
          Page {currentPage} of {totalPages}
        </span>
      )}

      {/* Next button */}
      <button
        onClick={handleNext}
        onKeyDown={(e) => handleKeyDown(e, handleNext)}
        disabled={currentPage >= totalPages}
        aria-label="Go to next page"
        className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg
          border border-surface-200 dark:border-surface-700
          text-surface-700 dark:text-surface-200
          hover:bg-surface-50 dark:hover:bg-surface-700
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-surface-900
          transition-colors"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
