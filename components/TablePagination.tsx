"use client";

import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  label?: string;
}

const TablePaginationInner: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  label = "items",
}) => {
  if (totalItems === 0) return null;

  const validTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, currentPage), validTotalPages);
  const startItem = (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Showing{" "}
          <span className="font-mono font-semibold text-slate-200">
            {startItem}
          </span>
          –
          <span className="font-mono font-semibold text-slate-200">
            {endItem}
          </span>{" "}
          of{" "}
          <span className="font-mono font-semibold text-slate-200">
            {totalItems}
          </span>{" "}
          {label}
        </span>

        <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800">
          <span className="text-[11px] text-slate-500">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-xs font-mono text-slate-300 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          title="First page"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          title="Previous page"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="px-2 font-mono text-[11px] text-slate-300">
          Page {safePage} of {validTotalPages}
        </span>

        <button
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= validTotalPages}
          title="Next page"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(validTotalPages)}
          disabled={safePage >= validTotalPages}
          title="Last page"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export const TablePagination = React.memo(TablePaginationInner);
