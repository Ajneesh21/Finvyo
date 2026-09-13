"use client";

import React from "react";
import { Globe, Award } from "lucide-react";
import { PortfolioSummary } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface BenchmarkComparisonProps {
  summary: PortfolioSummary;
}

export const BenchmarkComparison: React.FC<BenchmarkComparisonProps> = ({
  summary,
}) => {
  const benchmarksList = Object.entries(summary.benchmarks);

  if (benchmarksList.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center text-slate-400 text-sm">
        Benchmark data is currently loading...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Globe className="h-4 w-4 text-blue-400" />
            Global Indices Benchmark Comparison
          </h3>
          <p className="text-xs text-slate-400">
            Performance & risk metrics measured across your exact holding timeframe (
            {summary.daysActive} days)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700">
          <span>Your TWR:</span>
          <span className="font-bold text-emerald-400">
            {formatPercent(summary.twrPercent)}
          </span>
          <span className="text-slate-500">|</span>
          <span>CAGR:</span>
          <span className="font-bold text-emerald-400">
            {formatPercent(summary.annualizedTwrPercent)}
          </span>
        </div>
      </div>

      {/* Benchmark Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {benchmarksList.map(([key, bm]) => {
          const isAlphaPositive = bm.alpha >= 0;
          const excessReturn = summary.twrPercent - bm.totalReturnPercent;
          const isOutperforming = excessReturn >= 0;

          const dcaDiff = summary.totalValue - bm.hypotheticalDCAValue;
          const isDcaBetter = dcaDiff >= 0;

          return (
            <div
              key={key}
              className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg transition hover:border-slate-700 space-y-4"
            >
              {/* Card Top */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {bm.symbol}
                  </span>
                  <h4 className="text-sm font-bold text-white">{bm.name}</h4>
                </div>
                <div
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold font-mono border ${
                    isOutperforming
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {isOutperforming ? "Outperforming" : "Underperforming"}
                </div>
              </div>

              {/* Returns Comparison */}
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-950/60 p-3 text-xs border border-slate-800/80">
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    Index Total Return
                  </span>
                  <span className="text-base font-bold font-mono text-slate-200">
                    {formatPercent(bm.totalReturnPercent)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {formatPercent(bm.annualizedReturnPercent)} / yr
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">
                    Alpha (Excess Return)
                  </span>
                  <span
                    className={`text-base font-bold font-mono ${
                      isAlphaPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatPercent(bm.alpha, { showPlusSign: true })}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Beta: {bm.beta}
                  </span>
                </div>
              </div>

              {/* Risk & Correlation Stats */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-800/40 p-2">
                  <span className="text-[10px] text-slate-400 block">Beta (\(\beta\))</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {bm.beta}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-800/40 p-2">
                  <span className="text-[10px] text-slate-400 block">Correlation</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {bm.correlation}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-800/40 p-2">
                  <span className="text-[10px] text-slate-400 block">Sharpe</span>
                  <span className="font-mono font-semibold text-slate-200">
                    {bm.sharpeRatio}
                  </span>
                </div>
              </div>

              {/* Simulated DCA Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-[11px] font-medium">
                    If you DCA'd into this index:
                  </span>
                  <span className="font-mono font-semibold text-white">
                    {formatCurrency(bm.hypotheticalDCAValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Difference vs Your Portfolio:</span>
                  <span
                    className={`font-mono font-semibold ${
                      isDcaBetter ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatCurrency(dcaDiff, { showPlusSign: true })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Benchmarks Comparative Summary Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3 text-xs font-semibold text-white">
          Head-to-Head Benchmarks Summary Matrix
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Asset / Index</th>
                <th className="px-4 py-2.5 text-right">Total Return (%)</th>
                <th className="px-4 py-2.5 text-right">CAGR (%)</th>
                <th className="px-4 py-2.5 text-right">Alpha (\(\alpha\))</th>
                <th className="px-4 py-2.5 text-right">Beta (\(\beta\))</th>
                <th className="px-4 py-2.5 text-right">Sharpe Ratio</th>
                <th className="px-4 py-2.5 text-right">Max Drawdown</th>
                <th className="px-4 py-2.5 text-right">DCA Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {/* Portfolio Row */}
              <tr className="bg-blue-500/10 font-medium">
                <td className="px-4 py-3 font-bold text-blue-400 flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5" />
                  Your Portfolio (TWR)
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                  {formatPercent(summary.twrPercent)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                  {formatPercent(summary.annualizedTwrPercent)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">-</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400">1.00</td>
                <td className="px-4 py-3 text-right font-mono text-white">
                  {summary.sharpeRatio}
                </td>
                <td className="px-4 py-3 text-right font-mono text-rose-400">
                  -{formatPercent(summary.maxDrawdown)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-white">
                  {formatCurrency(summary.totalValue)}
                </td>
              </tr>

              {/* Benchmarks Rows */}
              {benchmarksList.map(([key, bm]) => (
                <tr key={key} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-medium text-white">
                    {bm.name}{" "}
                    <span className="font-mono text-[11px] text-slate-400">
                      ({bm.symbol})
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {formatPercent(bm.totalReturnPercent)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {formatPercent(bm.annualizedReturnPercent)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono font-medium ${
                      bm.alpha >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {formatPercent(bm.alpha, { showPlusSign: true })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{bm.beta}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{bm.sharpeRatio}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                    -{formatPercent(bm.maxDrawdown)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                    {formatCurrency(bm.hypotheticalDCAValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
