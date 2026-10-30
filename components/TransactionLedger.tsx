"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Transaction } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TablePagination } from "./TablePagination";
import {
  Search,
  Download,
  Plus,
  FileText,
  Trash2,
  Edit2,
  Receipt,
} from "lucide-react";

interface TransactionLedgerProps {
  portfolioId?: string;
  transactions: Transaction[];
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onExportCsv: () => void;
}

export const TransactionLedger: React.FC<TransactionLedgerProps> = ({
  portfolioId,
  transactions,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onExportCsv,
}) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [sortDesc, setSortDesc] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Server-side pagination state
  const [serverData, setServerData] = useState<{
    transactions: Transaction[];
    total: number;
    totalPages: number;
    totalFees: number | null;
  } | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Reset to page 1 whenever search, filter, or sorting changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterType, sortDesc]);

  // Fetch from server on page / filter / search / sort / portfolio change
  useEffect(() => {
    if (!portfolioId) {
      setServerData(null);
      return;
    }

    let isCancelled = false;
    setIsFetching(true);

    const params = new URLSearchParams({
      id: portfolioId,
      resource: "transactions",
      page: String(currentPage),
      pageSize: String(pageSize),
      sort: sortDesc ? "desc" : "asc",
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (filterType !== "ALL") params.set("type", filterType);

    fetch(`/api/portfolios?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch page from server");
        return res.json();
      })
      .then((data) => {
        if (isCancelled) return;
        if (data && Array.isArray(data.transactions) && data.pagination) {
          setServerData({
            transactions: data.transactions,
            total: data.pagination.total,
            totalPages: data.pagination.totalPages,
            totalFees: typeof data.totalFees === "number" ? data.totalFees : null,
          });
        }
      })
      .catch((err) => {
        console.warn("[TransactionLedger] Server fetch failed, using local cache:", err);
      })
      .finally(() => {
        if (!isCancelled) setIsFetching(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [portfolioId, currentPage, pageSize, debouncedSearch, filterType, sortDesc, transactions]);

  // Client-side fallback computation
  const filtered = useMemo(() => {
    return transactions
      .filter((t) => {
        const matchesSearch =
          t.symbol.toLowerCase().includes(search.toLowerCase()) ||
          (t.notes && t.notes.toLowerCase().includes(search.toLowerCase())) ||
          t.type.toLowerCase().includes(search.toLowerCase());

        const matchesType =
          filterType === "ALL" || t.type === filterType;

        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        return sortDesc
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
      });
  }, [transactions, search, filterType, sortDesc]);

  const localTotalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, serverData ? serverData.totalPages : localTotalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);

  const localPaginatedTransactions = useMemo(() => {
    return filtered.slice(startIndex, endIndex);
  }, [filtered, startIndex, endIndex]);

  const displayTransactions = serverData ? serverData.transactions : localPaginatedTransactions;
  const displayTotal = serverData ? serverData.total : filtered.length;
  const displayTotalPages = serverData ? serverData.totalPages : localTotalPages;

  const totalCommissions = useMemo(() => {
    return transactions.reduce((sum, t) => {
      if (t.type === "FEE" || t.type === "TAX") {
        return sum + Math.abs(t.amount || t.fee || 0);
      }
      return sum + (t.fee || 0);
    }, 0);
  }, [transactions]);

  const displayFees = serverData?.totalFees !== null && serverData?.totalFees !== undefined
    ? serverData.totalFees
    : totalCommissions;

  const typePills = [
    { label: "All Activity", value: "ALL" },
    { label: "Buys", value: "BUY" },
    { label: "Sells", value: "SELL" },
    { label: "Dividends", value: "DIVIDEND" },
    { label: "Deposits", value: "DEPOSIT" },
    { label: "Withdrawals", value: "WITHDRAWAL" },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden space-y-4 p-3 sm:p-5">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" />
            Transaction Ledger ({displayTotal} Records)
            {isFetching && (
              <span className="text-[10px] text-blue-400 font-mono animate-pulse bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                Fetching page...
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400">
            Chronological audit trail of all orders, deposits, dividend payments, and commission charges
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-mono font-medium text-amber-400">
            <Receipt className="h-3.5 w-3.5" />
            <span>Total Fees: {formatCurrency(displayFees)}</span>
          </div>

          <button
            onClick={onExportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onAddTransaction}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Filter Bar & Search Input */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol, notes, or activity..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Type Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {typePills.map((pill) => (
            <button
              key={pill.value}
              onClick={() => setFilterType(pill.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                filterType === pill.value
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Card List (iPhone & small screens) */}
      <div className="block sm:hidden space-y-2">
        {displayTransactions.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No matching transactions found.
          </div>
        ) : (
          displayTransactions.map((tx) => {
            const isBuy = tx.type === "BUY";
            const isSell = tx.type === "SELL";
            const isDiv = tx.type === "DIVIDEND";
            const isDep = tx.type === "DEPOSIT";

            return (
              <div
                key={tx.id}
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 space-y-2 transition active:bg-slate-900/60"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm font-mono">{tx.symbol}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        isBuy
                          ? "bg-blue-500/20 text-blue-400"
                          : isSell
                          ? "bg-emerald-500/20 text-emerald-400"
                          : isDiv
                          ? "bg-purple-500/20 text-purple-400"
                          : isDep
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {tx.type}
                    </span>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-mono font-bold text-sm ${
                        tx.amount > 0 ? "text-emerald-400" : tx.amount < 0 ? "text-rose-400" : "text-slate-300"
                      }`}
                    >
                      {formatCurrency(tx.amount)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-900">
                  <span className="font-mono text-slate-400">{formatDate(tx.date, "yyyy-MM-dd")}</span>
                  <div className="flex items-center gap-2">
                    {tx.shares > 0 && (
                      <span className="font-mono text-slate-300">{tx.shares} shs @ {formatCurrency(tx.price)}</span>
                    )}
                    <div className="flex items-center gap-1 pl-1">
                      <button
                        onClick={() => onEditTransaction(tx)}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                        title="Edit transaction"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteTransaction(tx.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded"
                        title="Delete transaction"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
        <table className="w-full text-left text-xs min-w-[750px]">
          <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 text-[11px]">
            <tr>
              <th
                onClick={() => setSortDesc(!sortDesc)}
                className="px-4 py-3 font-semibold cursor-pointer hover:text-white"
              >
                Date {sortDesc ? "↓" : "↑"}
              </th>
              <th className="px-3 py-3">Symbol</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3 text-right">Shares</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">Cash Flow ($)</th>
              <th className="px-3 py-3 text-right">Commission</th>
              <th className="px-3 py-3">Notes</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {displayTransactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                  No matching transactions found.
                </td>
              </tr>
            ) : (
              displayTransactions.map((tx) => {
                const isBuy = tx.type === "BUY";
                const isSell = tx.type === "SELL";
                const isDiv = tx.type === "DIVIDEND";
                const isDep = tx.type === "DEPOSIT";

                return (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                    {/* Date */}
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {formatDate(tx.date, "yyyy-MM-dd")}
                    </td>

                    {/* Symbol */}
                    <td className="px-3 py-3 font-bold text-white font-mono">
                      {tx.symbol}
                    </td>

                    {/* Type Badge */}
                    <td className="px-3 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                          isBuy
                            ? "bg-blue-500/20 text-blue-400"
                            : isSell
                            ? "bg-emerald-500/20 text-emerald-400"
                            : isDiv
                            ? "bg-purple-500/20 text-purple-400"
                            : isDep
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>

                    {/* Shares */}
                    <td className="px-3 py-3 text-right font-mono text-slate-200">
                      {tx.shares > 0 ? tx.shares.toFixed(4) : "-"}
                    </td>

                    {/* Price */}
                    <td className="px-3 py-3 text-right font-mono text-slate-300">
                      {tx.price > 0 ? formatCurrency(tx.price) : "-"}
                    </td>

                    {/* Amount / Cash flow */}
                    <td
                      className={`px-3 py-3 text-right font-mono font-bold ${
                        tx.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatCurrency(tx.amount, { showPlusSign: true })}
                    </td>

                    {/* Commission Fee */}
                    <td className="px-3 py-3 text-right font-mono text-amber-400/90">
                      {tx.fee && tx.fee > 0 ? formatCurrency(tx.fee) : "-"}
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-3 text-slate-400 truncate max-w-[160px] sm:max-w-xs text-[11px]">
                      {tx.notes || "-"}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onEditTransaction(tx)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                          title="Edit transaction"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(tx.id)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
                          title="Delete transaction"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <TablePagination
        currentPage={safePage}
        totalPages={displayTotalPages}
        totalItems={displayTotal}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        label="transactions"
      />
    </div>
  );
};
