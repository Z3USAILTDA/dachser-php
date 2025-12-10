import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  maxVisiblePages?: number;
  showFirstLast?: boolean;
  labels?: {
    first?: string;
    previous?: string;
    next?: string;
    last?: string;
  };
}

export function TablePagination({
  currentPage,
  totalPages,
  onPageChange,
  maxVisiblePages = 7,
  showFirstLast = true,
  labels = {
    first: "Primeiro",
    previous: "Anterior",
    next: "Próxima",
    last: "Última",
  },
}: TablePaginationProps) {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages: number[] = [];
    const half = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);

    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="flex flex-wrap gap-1.5 justify-end mt-3 text-xs">
      {currentPage > 1 && (
        <>
          {showFirstLast && (
            <button
              onClick={() => onPageChange(1)}
              className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
            >
              <ChevronsLeft size={12} />
              {labels.first}
            </button>
          )}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
          >
            <ChevronLeft size={12} />
            {labels.previous}
          </button>
        </>
      )}

      {visiblePages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`px-3 py-1.5 rounded-full border transition-colors ${
            page === currentPage
              ? "border-primary/90 bg-primary/20 text-primary font-bold"
              : "border-white/12 bg-white/5 hover:bg-white/10"
          }`}
        >
          {page}
        </button>
      ))}

      {currentPage < totalPages && (
        <>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
          >
            {labels.next}
            <ChevronRight size={12} />
          </button>
          {showFirstLast && (
            <button
              onClick={() => onPageChange(totalPages)}
              className="px-3 py-1.5 rounded-full border border-white/12 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
            >
              {labels.last}
              <ChevronsRight size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
