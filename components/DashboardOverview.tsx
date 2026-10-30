"use client";

import React from "react";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Wallet,
  Activity,
  Award,
  Zap,
  Percent,
} from "lucide-react";
import { PortfolioSummary } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";

interface DashboardOverviewProps {
  summary: PortfolioSummary;
}

const DashboardOverviewInner: React.FC<DashboardOverviewProps> = ({
  summary,
}) => {
  const isTwrPositive = summary.twrPercent >= 0;
  const isXirrPositive = summary.xirrPercent >= 0;
  const isUnrealizedPositive = summary.unrealizedPnL >= 0;

  const simpleReturn =
    summary.simpleReturnPercent !== undefined
      ? summary.simpleReturnPercent
      : summary.totalReturnPercent;
  const isSimplePositive = simpleReturn >= 0;

  const netInvested =
    summary.totalDeposits > 0
      ? summary.totalDeposits
      : summary.netInvestedCapital;

  // Day's total portfolio change
  const { totalDayChange, totalDayChangePercent } = React.useMemo(() => {
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
    return { totalDayChange, totalDayChangePercent };
  }, [summary.holdings, summary.holdingsValue]);
  const isDayPositive = totalDayChange >= 0;

  // Top benchmark comparison for quick banner
  const sp500 = summary.benchmarks["SP500"];
  const nasdaq = summary.benchmarks["NASDAQ"];
  const nifty = summary.benchmarks["NIFTY50"];

  return (
    <div className="space-y-4">
      {/* Top Quick Benchmark Comparison Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 sm:px-4 sm:py-2.5 text-[11px] sm:text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2 text-slate-400">
          <Activity className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span className="font-semibold text-slate-200">
            Inception:
          </span>{" "}
          <span>
            {formatDate(summary.firstTransactionDate)} ({summary.daysActive}d)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
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

          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2.5 sm:pl-3">
            <span className="text-slate-400">Simple Return:</span>
            <span
              className={`font-bold font-mono ${
                isSimplePositive ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPercent(simpleReturn)}
            </span>
          </div>

          {sp500 && (
            <div
              className="flex items-center gap-1.5 border-l border-slate-800 pl-2.5 sm:pl-3"
              title={`S&P 500: Today ${formatPercent(sp500.dayChangePercent ?? 0)} | Holding period total return ${formatPercent(sp500.totalReturnPercent)}`}
            >
              <span className="text-slate-400">S&P 500:</span>
              <span
                className={`font-semibold font-mono ${
                  (sp500.dayChangePercent ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPercent(sp500.dayChangePercent ?? sp500.totalReturnPercent, { showPlusSign: true })}
              </span>
            </div>
          )}

          {nasdaq && (
            <div
              className="hidden items-center gap-1.5 border-l border-slate-800 pl-3 sm:flex"
              title={`Nasdaq 100: Today ${formatPercent(nasdaq.dayChangePercent ?? 0)} | Holding period total return ${formatPercent(nasdaq.totalReturnPercent)}`}
            >
              <span className="text-slate-400">Nasdaq:</span>
              <span
                className={`font-semibold font-mono ${
                  (nasdaq.dayChangePercent ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPercent(nasdaq.dayChangePercent ?? nasdaq.totalReturnPercent, { showPlusSign: true })}
              </span>
            </div>
          )}

          {nifty && (
            <div
              className="hidden items-center gap-1.5 border-l border-slate-800 pl-3 md:flex"
              title={`Nifty 50: Today ${formatPercent(nifty.dayChangePercent ?? 0)} | Holding period total return ${formatPercent(nifty.totalReturnPercent)}`}
            >
              <span className="text-slate-400">Nifty 50:</span>
              <span
                className={`font-semibold font-mono ${
                  (nifty.dayChangePercent ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {formatPercent(nifty.dayChangePercent ?? nifty.totalReturnPercent, { showPlusSign: true })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono hidden xl:inline">
                today ({formatPercent(nifty.totalReturnPercent)} total)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main KPI Grid: 2-column compact on mobile with Hero card, 5-col on desktop */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {/* Card 1: Stock Portfolio Valuation (Hero card spans 2 cols on mobile) */}
        <div className="col-span-2 sm:col-span-1 group relative rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-900/90 p-3.5 sm:p-5 shadow-lg shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-200">Stock Holdings Value</span>
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
          <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-white font-mono">
            {formatCurrency(summary.totalValue)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/50">
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

        {/* Card 2: Simple Return (ROI) */}
        <div className="col-span-1 group relative rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/20 to-slate-900/90 p-2.5 sm:p-5 shadow-lg shadow-emerald-500/5 hover:border-emerald-500/50 transition">
          <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs">
            <span className="font-semibold text-emerald-300 truncate">Simple Return</span>
            <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 flex-shrink-0">
              <Percent className="h-3.5 w-3.5" />
            </div>
          </div>
          <div
            className={`mt-1.5 text-lg sm:text-2xl font-extrabold tracking-tight font-mono ${
              isSimplePositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatPercent(simpleReturn)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 truncate">
            <span>Gain:</span>
            <span
              className={`font-mono font-semibold ${
                summary.totalReturnAmount >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatCurrency(summary.totalReturnAmount, { showPlusSign: true, compact: true })}
            </span>
          </div>
        </div>

        {/* Card 3: Time-Weighted Return (TWR) */}
        <div className="col-span-1 group relative rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-950/30 to-slate-900/90 p-2.5 sm:p-5 shadow-lg shadow-blue-500/5 hover:border-blue-500/50 transition">
          <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs">
            <span className="font-semibold text-blue-300 truncate">TWR Return</span>
            <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 flex-shrink-0">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          <div
            className={`mt-1.5 text-lg sm:text-2xl font-extrabold tracking-tight font-mono ${
              isTwrPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatPercent(summary.twrPercent)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 truncate">
            <span>CAGR:</span>
            <span className="font-mono font-semibold text-slate-200">
              {formatPercent(summary.annualizedTwrPercent)}
            </span>
          </div>
        </div>

        {/* Card 4: Money-Weighted Return (XIRR) */}
        <div className="col-span-1 group relative rounded-2xl border border-purple-500/30 bg-gradient-to-b from-slate-900 to-slate-900/90 p-2.5 sm:p-5 shadow-lg shadow-black/20 hover:border-purple-500/50 transition">
          <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs">
            <span className="font-semibold text-purple-300 truncate">XIRR Return</span>
            <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 flex-shrink-0">
              <Zap className="h-3.5 w-3.5" />
            </div>
          </div>
          <div
            className={`mt-1.5 text-lg sm:text-2xl font-extrabold tracking-tight font-mono ${
              isXirrPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatPercent(summary.xirrPercent)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 truncate">
            <span>Invested:</span>
            <span className="font-mono font-semibold text-slate-200">
              {formatCurrency(netInvested, { compact: true })}
            </span>
          </div>
        </div>

        {/* Card 5: Unrealized Gains & Dividends */}
        <div className="col-span-1 group relative rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-900/90 p-2.5 sm:p-5 shadow-lg shadow-black/20 hover:border-slate-700 transition">
          <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs">
            <span className="font-semibold truncate">Capital Gain</span>
            <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 flex-shrink-0">
              <Award className="h-3.5 w-3.5" />
            </div>
          </div>
          <div
            className={`mt-1.5 text-lg sm:text-2xl font-extrabold tracking-tight font-mono ${
              isUnrealizedPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {formatCurrency(summary.unrealizedPnL, { showPlusSign: true, compact: true })}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 truncate">
            <span>Div:</span>
            <span className="font-mono font-semibold text-emerald-400">
              +{formatCurrency(summary.totalDividends, { compact: true })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const DashboardOverview = React.memo(DashboardOverviewInner);
