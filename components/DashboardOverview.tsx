"use client";

import React from "react";
import {
  TrendingUp,
  DollarSign,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Calendar,
  Wallet,
  Activity,
  Award,
  Zap,
} from "lucide-react";
import { PortfolioSummary } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";

interface DashboardOverviewProps {
  summary: PortfolioSummary;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  summary,
}) => {
  const isTotalGainPositive = summary.totalReturnAmount >= 0;
  const isTwrPositive = summary.twrPercent >= 0;
  const isXirrPositive = summary.xirrPercent >= 0;
  const isUnrealizedPositive = summary.unrealizedPnL >= 0;

  // Day's total portfolio change
  const totalDayChange = summary.holdings.reduce(
    (sum, h) => sum + h.dayChange,
    0
  );
  const previousDayValue = summary.holdingsValue - totalDayChange;
  const totalDayChangePercent =
    previousDayValue > 0
      ? (totalDayChange / previousDayValue) * 100
      : summary.holdingsValue > 0
      ? (totalDayChange / summary.holdingsValue) * 100
      : 0;
  const isDayPositive = totalDayChange >= 0;

  // Top benchmark comparison for quick banner
  const sp500 = summary.benchmarks["SP500"];
  const nasdaq = summary.benchmarks["NASDAQ"];
  const nifty = summary.benchmarks["NIFTY50"];

  return (
    <div className="space-y-4">
      {/* Top Quick Benchmark Comparison Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <Activity className="h-4 w-4 text-blue-400" />
          <span className="font-semibold text-slate-200">
            Portfolio Inception:
          </span>{" "}
          <span>
            {formatDate(summary.firstTransactionDate)} ({summary.daysActive} days active)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Your TWR:</span>
            <span
              className={`font-bold font-mono ${
                isTwrPositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPercent(summary.twrPercent)}
            </span>
          </div>

          {sp500 && (
            <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
              <span className="text-slate-400">S&P 500:</span>
              <span className="font-semibold font-mono text-blue-400">
                {formatPercent(sp500.totalReturnPercent)}
              </span>
            </div>
          )}

          {nasdaq && (
            <div className="hidden items-center gap-1.5 border-l border-slate-800 pl-3 sm:flex">
              <span className="text-slate-400">Nasdaq:</span>
              <span className="font-semibold font-mono text-purple-400">
                {formatPercent(nasdaq.totalReturnPercent)}
              </span>
            </div>
          )}

          {nifty && (
            <div className="hidden items-center gap-1.5 border-l border-slate-800 pl-3 md:flex">
              <span className="text-slate-400">Nifty 50:</span>
              <span className="font-semibold font-mono text-amber-400">
                {formatPercent(nifty.totalReturnPercent)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Stock Portfolio Valuation */}
        <div className="group relative rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-900/90 p-5 shadow-lg shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-slate-200">Stock Holdings Value</span>
              <div
                className="group/tooltip relative cursor-help"
                title="Current live market value of your active stock positions. Excludes uninvested cash."
              >
                <Info className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300 transition" />
              </div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-white font-mono">
            {formatCurrency(summary.totalValue)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs pt-1 border-t border-slate-800/50">
            <div className="flex items-center gap-1 text-slate-400">
              <span>Day:</span>
              <span
                className={`flex items-center font-mono font-medium ${
                  isDayPositive ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {isDayPositive ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {formatCurrency(totalDayChange, { showPlusSign: true })} (
                {formatPercent(totalDayChangePercent)})
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-300 border border-slate-700/60" title="Separate uninvested buying power / cash">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Cash: {formatCurrency(summary.cashBalance)}
            </span>
          </div>
        </div>

        {/* Card 2: Time-Weighted Return (TWR) */}
        <div className="group relative rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-950/30 to-slate-900/90 p-5 shadow-lg shadow-blue-500/5 hover:border-blue-500/50 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <div className="flex items-center gap-1">
              <span className="font-medium text-blue-300">Time-Weighted Return (TWR)</span>
              <div
                className="group/tooltip relative cursor-help"
                title="TWR eliminates the distorting effect of cash deposits & withdrawals to measure true investment skill"
              >
                <Info className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div
            className={`mt-2 text-2xl font-extrabold tracking-tight font-mono ${
              isTwrPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatPercent(summary.twrPercent)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Annualized (CAGR):</span>
            <span className="font-mono font-semibold text-slate-200">
              {formatPercent(summary.annualizedTwrPercent)} / yr
            </span>
          </div>
        </div>

        {/* Card 3: Money-Weighted Return (XIRR) */}
        <div className="group relative rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-900/90 p-5 shadow-lg shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <div className="flex items-center gap-1">
              <span className="font-medium">Money-Weighted (XIRR)</span>
              <div
                className="group/tooltip relative cursor-help"
                title="XIRR measures actual dollar performance taking into account the exact timing and size of every deposit"
              >
                <Info className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div
            className={`mt-2 text-2xl font-extrabold tracking-tight font-mono ${
              isXirrPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatPercent(summary.xirrPercent)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Net Invested:</span>
            <span className="font-mono font-semibold text-slate-200">
              {formatCurrency(summary.totalDeposits > 0 ? summary.totalDeposits : summary.netInvestedCapital)}
            </span>
          </div>
        </div>

        {/* Card 4: Total Gains & Dividends */}
        <div className="group relative rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-900/90 p-5 shadow-lg shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-medium">Unrealized & Total Gain</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div
            className={`mt-2 text-2xl font-extrabold tracking-tight font-mono ${
              isUnrealizedPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatCurrency(summary.unrealizedPnL, { showPlusSign: true })}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>
              Dividends:{" "}
              <span className="font-mono font-semibold text-emerald-400">
                +{formatCurrency(summary.totalDividends)}
              </span>
            </span>
            <span title="Total brokerage trading commissions, exchange fees, and taxes deducted">
              Commissions:{" "}
              <span className="font-mono font-semibold text-amber-400">
                -{formatCurrency(summary.totalFees)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
