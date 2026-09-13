"use client";

import React, { useState, useMemo } from "react";
import { Holding } from "@/lib/types";
import { formatCurrency, formatPercent, getSectorColor } from "@/lib/utils";
import {
  Search,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
} from "lucide-react";

interface HoldingsTableProps {
  holdings: Holding[];
  totalValue: number;
}

type SortKey =
  | "symbol"
  | "currentValue"
  | "unrealizedPnL"
  | "unrealizedPnLPercent"
  | "dayChangePercent"
  | "portfolioWeight";

export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  holdings,
}) => {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("currentValue");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filteredHoldings = useMemo(() => {
    return holdings
      .filter((h) => {
        const query = search.toLowerCase();
        return (
          h.symbol.toLowerCase().includes(query) ||
          h.companyName.toLowerCase().includes(query) ||
          h.sector.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];
        if (typeof valA === "string") {
          return sortOrder === "asc"
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        }
        return sortOrder === "asc"
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
  }, [holdings, search, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const totalCostBasis = holdings.reduce((s, h) => s + h.totalCostBasis, 0);
  const totalHoldingsValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalUnrealized = totalHoldingsValue - totalCostBasis;
  const totalUnrealizedPercent =
    totalCostBasis > 0 ? (totalUnrealized / totalCostBasis) * 100 : 0;
  const totalDayGain = holdings.reduce((s, h) => s + h.dayChange, 0);
  const previousDayHoldingsValue = totalHoldingsValue - totalDayGain;
  const totalDayGainPercent =
    previousDayHoldingsValue > 0
      ? (totalDayGain / previousDayHoldingsValue) * 100
      : totalHoldingsValue > 0
      ? (totalDayGain / totalHoldingsValue) * 100
      : 0;

  if (holdings.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-slate-400 text-sm">
        No active stock positions found in this statement.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden space-y-4 p-5">
      {/* Table Header Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-400" />
            Active Stock Holdings ({holdings.length} Assets)
          </h3>
          <p className="text-xs text-slate-400">
            Real-time market prices with live profit/loss and portfolio weight
          </p>
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search symbol or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Table with proper horizontal scroll and min-width to prevent cutting off */}
      <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60 scrollbar-thin">
        <table className="w-full min-w-[850px] text-left text-xs border-collapse">
          <thead className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th
                onClick={() => handleSort("symbol")}
                className="px-4 py-3.5 font-semibold cursor-pointer hover:text-white select-none w-56"
              >
                <div className="flex items-center gap-1.5">
                  <span>Asset / Symbol</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>
              <th className="px-3 py-3.5 text-right font-semibold select-none w-24">
                Shares
              </th>
              <th className="px-3 py-3.5 text-right font-semibold select-none w-28">
                Avg Cost
              </th>
              <th className="px-3 py-3.5 text-right font-semibold select-none w-28">
                Live Price
              </th>
              <th
                onClick={() => handleSort("dayChangePercent")}
                className="px-3 py-3.5 text-right font-semibold cursor-pointer hover:text-white select-none w-28"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>1D Change</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort("currentValue")}
                className="px-3 py-3.5 text-right font-semibold cursor-pointer hover:text-white select-none w-32"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Current Value</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort("unrealizedPnL")}
                className="px-3 py-3.5 text-right font-semibold cursor-pointer hover:text-white select-none w-36"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Unrealized P&L</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort("portfolioWeight")}
                className="px-4 py-3.5 text-right font-semibold cursor-pointer hover:text-white select-none w-28"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Weight %</span>
                  <ArrowUpDown className="h-3 w-3 text-slate-500" />
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {filteredHoldings.map((h) => {
              const isGain = h.unrealizedPnL >= 0;
              const isDayUp = h.dayChangePercent >= 0;
              const sectorColor = getSectorColor(h.sector);

              return (
                <tr key={h.symbol} className="hover:bg-slate-800/40 transition">
                  {/* Symbol & Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-xs flex-shrink-0"
                        style={{
                          backgroundColor: `${sectorColor}20`,
                          color: sectorColor,
                          border: `1px solid ${sectorColor}40`,
                        }}
                      >
                        {h.symbol.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs font-mono">
                            {h.symbol}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
                            style={{
                              backgroundColor: `${sectorColor}15`,
                              color: sectorColor,
                            }}
                          >
                            {h.sector}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                          {h.companyName}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Shares */}
                  <td className="px-3 py-3 text-right font-mono font-medium text-slate-200 whitespace-nowrap">
                    {h.shares.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })}
                  </td>

                  {/* Avg Cost Basis */}
                  <td className="px-3 py-3 text-right font-mono text-slate-300 whitespace-nowrap">
                    {formatCurrency(h.avgCostBasis)}
                  </td>

                  {/* Live Price */}
                  <td className="px-3 py-3 text-right font-mono font-bold text-white whitespace-nowrap">
                    {formatCurrency(h.currentPrice)}
                  </td>

                  {/* 1D Change */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <span
                      className={`inline-flex items-center font-mono font-semibold text-xs ${
                        isDayUp ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isDayUp ? (
                        <ArrowUpRight className="h-3 w-3 mr-0.5" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-0.5" />
                      )}
                      {formatPercent(h.dayChangePercent)}
                    </span>
                  </td>

                  {/* Current Value */}
                  <td className="px-3 py-3 text-right font-mono font-bold text-white whitespace-nowrap">
                    {formatCurrency(h.currentValue)}
                  </td>

                  {/* Unrealized P&L */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <div
                      className={`font-mono font-bold ${
                        isGain ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatCurrency(h.unrealizedPnL, { showPlusSign: true })}
                    </div>
                    <div
                      className={`text-[10px] font-mono ${
                        isGain ? "text-emerald-500" : "text-rose-500"
                      }`}
                    >
                      {formatPercent(h.unrealizedPnLPercent)}
                    </div>
                  </td>

                  {/* Portfolio Weight */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 rounded-full bg-slate-800 h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(100, h.portfolioWeight)}%` }}
                        />
                      </div>
                      <span className="font-mono font-semibold text-slate-200 text-xs">
                        {h.portfolioWeight.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Total Summary Footer Row */}
          <tfoot className="border-t-2 border-slate-800 bg-slate-900/95 font-semibold text-white">
            <tr>
              <td className="px-4 py-3.5 text-slate-200">Total Holdings</td>
              <td className="px-3 py-3.5 text-right font-mono text-slate-400">-</td>
              <td className="px-3 py-3.5 text-right font-mono text-slate-300">
                {formatCurrency(totalCostBasis)}
              </td>
              <td className="px-3 py-3.5 text-right font-mono text-slate-400">-</td>
              <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap">
                <span
                  className={totalDayGain >= 0 ? "text-emerald-400" : "text-rose-400"}
                >
                  {formatCurrency(totalDayGain, { showPlusSign: true })} (
                  {formatPercent(totalDayGainPercent)})
                </span>
              </td>
              <td className="px-3 py-3.5 text-right font-mono font-extrabold text-white whitespace-nowrap">
                {formatCurrency(totalHoldingsValue)}
              </td>
              <td className="px-3 py-3.5 text-right font-mono whitespace-nowrap">
                <span
                  className={totalUnrealized >= 0 ? "text-emerald-400" : "text-rose-400"}
                >
                  {formatCurrency(totalUnrealized, { showPlusSign: true })} (
                  {formatPercent(totalUnrealizedPercent)})
                </span>
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-blue-400 font-bold">
                100.0%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
