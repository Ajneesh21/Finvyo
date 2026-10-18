"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PortfolioSummary } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { TablePagination } from "./TablePagination";
import {
  Activity,
  Calculator,
  ShieldAlert,
  Percent,
  Receipt,
  FileCheck,
  CreditCard,
  TrendingDown,
  DollarSign,
  Landmark,
} from "lucide-react";

// Short-term default of 20% applies until March 2027; user can override.
const DEFAULT_ST_RATE = 20;
// Long-term (held > 2 years) rate for foreign equity.
const LT_RATE = 12.5;
const ST_RATE_KEY = "finvyo:shortTermTaxRate";

interface MetricsDetailProps {
  summary: PortfolioSummary;
  portfolioId?: string;
}

export const MetricsDetail: React.FC<MetricsDetailProps> = ({ summary, portfolioId }) => {
  const feePercentOfInvested =
    summary.netInvestedCapital > 0
      ? (summary.totalFees / summary.netInvestedCapital) * 100
      : 0;

  const [stRate, setStRate] = useState<number>(DEFAULT_ST_RATE);

  useEffect(() => {
    const saved = parseFloat(localStorage.getItem(ST_RATE_KEY) || "");
    if (Number.isFinite(saved)) setStRate(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem(ST_RATE_KEY, String(stRate));
  }, [stRate]);

  const taxEstimate = useMemo(() => {
    const empty = () => ({ gainUsd: 0, gainInr: 0, taxUsd: 0, taxInr: 0 });
    const buckets = { short: empty(), long: empty() };
    // Accumulate the INR gain per category, plus the USD-equivalent at each sale-date rate
    for (const t of summary.realizedTrades) {
      const sellFx = t.sellFxRate || 0;
      const buyFx = t.buyFxRate || sellFx;
      if (!sellFx || t.proceeds === undefined) continue;
      const gainInr = t.proceeds * sellFx - t.costBasis * buyFx;
      const b = t.taxType === "LONG_TERM" ? buckets.long : buckets.short;
      b.gainInr += gainInr;
      b.gainUsd += gainInr / sellFx;
    }
    const finalize = (b: ReturnType<typeof empty>, rate: number) => {
      // Losses offset gains within the category; no tax if the net is negative.
      if (b.gainInr > 0) {
        b.taxInr = (b.gainInr * rate) / 100;
        b.taxUsd = (b.gainUsd * rate) / 100;
      }
      return b;
    };
    return {
      short: finalize(buckets.short, stRate),
      long: finalize(buckets.long, LT_RATE),
    };
  }, [summary.realizedTrades, stRate]);

  const currentFxRate =
    summary.usdInrRate ||
    summary.realizedTrades.find((t) => t.sellFxRate)?.sellFxRate ||
    83.5;

  const totalReturnUsd = summary.totalReturnAmount;
  const totalReturnInr = totalReturnUsd * currentFxRate;
  const totalTaxUsd = taxEstimate.short.taxUsd + taxEstimate.long.taxUsd;
  const totalTaxInr = taxEstimate.short.taxInr + taxEstimate.long.taxInr;
  const totalRealizedGainInr = taxEstimate.short.gainInr + taxEstimate.long.gainInr;
  const taxAdjustedReturn = totalReturnUsd - totalTaxUsd;
  const taxAdjustedReturnInr = totalReturnInr - totalTaxInr;
  const taxAdjustedReturnPercent =
    summary.netInvestedCapital > 0
      ? (taxAdjustedReturn / summary.netInvestedCapital) * 100
      : 0;

  // Pagination for TWR Sub-Periods (client-side)
  const [twrPage, setTwrPage] = useState(1);
  const [twrPageSize, setTwrPageSize] = useState(10);
  const displayTwrTotal = summary.twrSubPeriods.length;
  const displayTwrTotalPages = Math.max(1, Math.ceil(displayTwrTotal / twrPageSize));
  const safeTwrPage = Math.min(twrPage, displayTwrTotalPages);
  const twrStartIndex = (safeTwrPage - 1) * twrPageSize;
  const displayTwr = useMemo(() => {
    return summary.twrSubPeriods.slice(twrStartIndex, twrStartIndex + twrPageSize);
  }, [summary.twrSubPeriods, twrStartIndex, twrPageSize]);

  // Pagination & Filtering for Realized Trades (client-side)
  const [tradesPage, setTradesPage] = useState(1);
  const [tradesPageSize, setTradesPageSize] = useState(10);
  const [tradesFilter, setTradesFilter] = useState<"ALL" | "SHORT_TERM" | "LONG_TERM">("ALL");

  const filteredTrades = useMemo(() => {
    if (tradesFilter === "ALL") return summary.realizedTrades;
    return summary.realizedTrades.filter((t) => t.taxType === tradesFilter);
  }, [summary.realizedTrades, tradesFilter]);

  useEffect(() => {
    setTradesPage(1);
  }, [tradesFilter]);

  const displayTradesTotal = filteredTrades.length;
  const displayTradesTotalPages = Math.max(1, Math.ceil(displayTradesTotal / tradesPageSize));
  const safeTradesPage = Math.min(tradesPage, displayTradesTotalPages);
  const tradesStartIndex = (safeTradesPage - 1) * tradesPageSize;
  const displayTrades = useMemo(() => {
    return filteredTrades.slice(tradesStartIndex, tradesStartIndex + tradesPageSize);
  }, [filteredTrades, tradesStartIndex, tradesPageSize]);

  return (
    <div className="space-y-6">
      {/* 1. Commission Charges & Brokerage Expenses Section */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-400" />
              Total Commission Charges & Brokerage Fees
            </h3>
            <p className="text-xs text-slate-400">
              Total transaction commissions, exchange fees, and tax withholdings deducted by the broker
            </p>
          </div>
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-mono font-bold text-amber-400">
            Total Paid: {formatCurrency(summary.totalFees)}
          </div>
        </div>

        {/* 3 Fee KPI Cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Card 1: Total Commissions & Fees */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Total Fees & Commissions</span>
              <CreditCard className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-white">
              {formatCurrency(summary.totalFees)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Commission per order + ADR / regulatory fees
            </p>
          </div>

          {/* Card 2: Fee Impact / Performance Drag */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Fee Drag on Portfolio</span>
              <TrendingDown className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-rose-400">
              {formatPercent(-feePercentOfInvested)}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Percentage of total invested capital
            </p>
          </div>

          {/* Card 3: Net Profit After Fees */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Net Realized Capital Gain</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <div
              className={`mt-2 text-xl font-bold font-mono ${
                summary.realizedPnL >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatCurrency(summary.realizedPnL, { showPlusSign: true })}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Net of all trade commissions & cost basis
            </p>
          </div>
        </div>
      </div>

      {/* 2. TWR Sub-Periods Audit Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calculator className="h-4 w-4 text-blue-400" />
              Time-Weighted Return (TWR) Sub-Periods Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates compounding performance from your first stock purchase date
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-xs font-mono text-blue-300">
              Formula: R_TWR = ∏(1 + Rᵢ) − 1
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 text-[11px]">
              <tr>
                <th className="px-3 py-2.5">Sub-Period</th>
                <th className="px-3 py-2.5">Start Date</th>
                <th className="px-3 py-2.5">End Date</th>
                <th className="px-3 py-2.5 text-right">Start Cost Basis</th>
                <th className="px-3 py-2.5 text-right">Cash Flow</th>
                <th className="px-3 py-2.5 text-right">End Stock Valuation</th>
                <th className="px-3 py-2.5 text-right">Period Return (%)</th>
                <th className="px-3 py-2.5 text-right">Cumulative TWR</th>
              </tr>
            </thead>
            <tbody className="divide-y border-slate-800/60 text-slate-200">
              {displayTwr.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500 text-xs">
                    No sub-period events generated yet.
                  </td>
                </tr>
              ) : (
                displayTwr.map((sp, idx) => {
                  const isPeriodPositive = sp.periodReturn >= 0;
                  const isCumPositive = sp.cumulativeTWR >= 0;

                  return (
                    <tr key={twrStartIndex + idx} className="hover:bg-slate-800/40 transition">
                      <td className="px-3 py-2.5 font-mono text-slate-400">
                        #{twrStartIndex + idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">
                        {formatDate(sp.startDate, "yyyy-MM-dd")}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300">
                        {formatDate(sp.endDate, "yyyy-MM-dd")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                        {formatCurrency(sp.startValue)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono ${
                          sp.cashFlow > 0
                            ? "text-blue-400 font-medium"
                            : sp.cashFlow < 0
                            ? "text-amber-400 font-medium"
                            : "text-slate-500"
                        }`}
                      >
                        {sp.cashFlow !== 0
                          ? formatCurrency(sp.cashFlow, { showPlusSign: true })
                          : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                        {formatCurrency(sp.endValue)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-bold ${
                          isPeriodPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatPercent(sp.periodReturn * 100)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-bold ${
                          isCumPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatPercent(sp.cumulativeTWR * 100)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* TWR Sub-Periods Pagination */}
        <TablePagination
          currentPage={safeTwrPage}
          totalPages={displayTwrTotalPages}
          totalItems={displayTwrTotal}
          pageSize={twrPageSize}
          onPageChange={setTwrPage}
          onPageSizeChange={setTwrPageSize}
          pageSizeOptions={[10, 25, 50]}
          label="sub-periods"
        />
      </div>

      {/* 3. Realized Trades & Capital Gains Tax Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-emerald-400" />
              Realized Trades & Capital Gains Tax Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Indian foreign equity classification: &gt;24 months (&gt;730 days) qualifies as Long-Term. Short-term capital gains are taxed at your individual income tax slab rate (US dividends are subject to 25% flat withholding tax at source).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-slate-950/80 p-0.5 border border-slate-800 text-[11px]">
              {(
                [
                  { label: "All", value: "ALL" },
                  { label: "Short Term", value: "SHORT_TERM" },
                  { label: "Long Term", value: "LONG_TERM" },
                ] as const
              ).map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTradesFilter(f.value)}
                  className={`rounded px-2 py-0.5 font-medium transition ${
                    tradesFilter === f.value
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-mono font-bold text-emerald-400">
              Total Realized Gain: {formatCurrency(summary.realizedPnL, { showPlusSign: true })}{" "}
              ({formatCurrency(totalRealizedGainInr, { currency: "INR", showPlusSign: true })})
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 text-[11px]">
              <tr>
                <th className="px-3 py-2.5">Sell Date</th>
                <th className="px-3 py-2.5">Symbol</th>
                <th className="px-3 py-2.5 text-right">Shares Sold</th>
                <th className="px-3 py-2.5 text-right">Sell Price</th>
                <th className="px-3 py-2.5 text-right">Cost Basis</th>
                <th className="px-3 py-2.5 text-right">Realized Gain/Loss</th>
                <th className="px-3 py-2.5 text-right">Holding Days</th>
                <th className="px-3 py-2.5 text-center">Tax Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {displayTrades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500 text-xs">
                    {summary.realizedTrades.length === 0
                      ? "No sell transactions executed in this portfolio yet."
                      : "No trades matching the selected tax category."}
                  </td>
                </tr>
              ) : (
                displayTrades.map((trade) => {
                  const isGain = trade.realizedGain >= 0;

                  return (
                    <tr key={trade.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-3 py-2.5 font-mono text-slate-300">
                        {formatDate(trade.sellDate, "yyyy-MM-dd")}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-white font-mono">
                        {trade.symbol}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {trade.shares.toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                        {formatCurrency(trade.sellPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                        {formatCurrency(trade.costBasis)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-mono font-bold ${
                          isGain ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatCurrency(trade.realizedGain, { showPlusSign: true })} (
                        {formatPercent(trade.realizedGainPercent)})
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                        {trade.holdingPeriodDays} days
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                            trade.taxType === "LONG_TERM"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {trade.taxType === "LONG_TERM" ? "Long Term" : "Short Term"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Realized Trades Pagination */}
        <TablePagination
          currentPage={safeTradesPage}
          totalPages={displayTradesTotalPages}
          totalItems={displayTradesTotal}
          pageSize={tradesPageSize}
          onPageChange={setTradesPage}
          onPageSizeChange={setTradesPageSize}
          pageSizeOptions={[10, 25, 50]}
          label="realized trades"
        />
      </div>

      {/* 3b. Estimated Tax Paid (USD & INR) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Landmark className="h-4 w-4 text-rose-400" />
              Estimated Capital Gains Tax Paid
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl">
              Gains are converted to ₹ using the USD/INR rate on each buy date (cost) and sell date
              (proceeds). Losses offset gains within the same category. Long-term applies only to
              holdings over 2 years. Estimates only, not tax advice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-1 text-xs font-mono font-bold text-rose-400">
              Total Tax Paid: {formatCurrency(totalTaxUsd)} ({formatCurrency(totalTaxInr, { currency: "INR" })})
            </span>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              Short-term rate (%)
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={stRate}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setStRate(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
                }}
                className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-white"
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/60">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 text-[11px]">
              <tr>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5 text-right">Rate</th>
                <th className="px-3 py-2.5 text-right">Net Gain ($)</th>
                <th className="px-3 py-2.5 text-right">Net Gain (₹)</th>
                <th className="px-3 py-2.5 text-right">Tax Paid ($)</th>
                <th className="px-3 py-2.5 text-right">Tax Paid (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono">
              {[
                { label: "Short Term (≤ 2 yrs)", rate: stRate, s: taxEstimate.short },
                { label: "Long Term (> 2 yrs)", rate: LT_RATE, s: taxEstimate.long },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="px-3 py-2.5 font-sans">{row.label}</td>
                  <td className="px-3 py-2.5 text-right">{row.rate}%</td>
                  <td className="px-3 py-2.5 text-right">
                    {formatCurrency(row.s.gainUsd, { showPlusSign: true })}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {formatCurrency(row.s.gainInr, { currency: "INR", showPlusSign: true })}
                  </td>
                  <td className="px-3 py-2.5 text-right text-rose-300">
                    {formatCurrency(row.s.taxUsd)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-rose-300">
                    {formatCurrency(row.s.taxInr, { currency: "INR" })}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-900/60 font-bold">
                <td className="px-3 py-2.5 font-sans text-white">Total</td>
                <td />
                <td className="px-3 py-2.5 text-right">
                  {formatCurrency(taxEstimate.short.gainUsd + taxEstimate.long.gainUsd, {
                    showPlusSign: true,
                  })}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {formatCurrency(taxEstimate.short.gainInr + taxEstimate.long.gainInr, {
                    currency: "INR",
                    showPlusSign: true,
                  })}
                </td>
                <td className="px-3 py-2.5 text-right text-rose-400">
                  {formatCurrency(taxEstimate.short.taxUsd + taxEstimate.long.taxUsd)}
                </td>
                <td className="px-3 py-2.5 text-right text-rose-400">
                  {formatCurrency(taxEstimate.short.taxInr + taxEstimate.long.taxInr, {
                    currency: "INR",
                  })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Card 1: Total Return */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Total Return</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <div
              className={`mt-2 text-xl font-bold font-mono ${
                totalReturnUsd >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatCurrency(totalReturnUsd, { showPlusSign: true })}
            </div>
            <div className="mt-0.5 text-xs font-mono font-medium text-slate-300">
              {formatCurrency(totalReturnInr, { currency: "INR", showPlusSign: true })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              {formatPercent(summary.totalReturnPercent)} on invested capital
            </p>
          </div>

          {/* Card 2: Total Tax Paid */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Total Tax Paid</span>
              <Receipt className="h-4 w-4 text-rose-400" />
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-rose-400">
              -{formatCurrency(totalTaxUsd)}
            </div>
            <div className="mt-0.5 text-xs font-mono font-medium text-rose-300/90">
              -{formatCurrency(totalTaxInr, { currency: "INR" })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Short-term ({stRate}%): {formatCurrency(taxEstimate.short.taxUsd)} • Long-term ({LT_RATE}%): {formatCurrency(taxEstimate.long.taxUsd)}
            </p>
          </div>

          {/* Card 3: Tax-Adjusted Return */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-emerald-300">Tax-Adjusted Return</span>
              <Landmark className="h-4 w-4 text-emerald-400" />
            </div>
            <div
              className={`mt-2 text-xl font-bold font-mono ${
                taxAdjustedReturn >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatCurrency(taxAdjustedReturn, { showPlusSign: true })}
            </div>
            <div
              className={`mt-0.5 text-xs font-mono font-medium ${
                taxAdjustedReturnInr >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
              }`}
            >
              {formatCurrency(taxAdjustedReturnInr, { currency: "INR", showPlusSign: true })}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {formatPercent(taxAdjustedReturnPercent)} on invested capital
            </p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          Tax-adjusted return = total return (realized + unrealized + dividends) minus estimated
          capital gains tax. Unrealized gains are not taxed until sold.
        </p>
        <p className="text-[11px] text-slate-500">
          Short-term default is 20% (valid until March 2027) and can be changed above. Long-term is
          fixed at {LT_RATE}%. Tax in $ is the ₹ tax converted at each sale-date rate.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Sharpe Ratio */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Sharpe Ratio</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-white">
            {summary.sharpeRatio.toFixed(2)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Excess return per unit of portfolio volatility (Risk-free: 4.5%)
          </p>
        </div>

        {/* Max Drawdown */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Maximum Drawdown</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-400">
            -{summary.maxDrawdown.toFixed(2)}%
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Peak-to-trough decline over holding period
          </p>
        </div>

        {/* Annualized Volatility */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Annualized Volatility</span>
            <Percent className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-purple-400">
            {summary.volatility.toFixed(2)}%
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Standard deviation of daily portfolio returns (annualized)
          </p>
        </div>
      </div>
    </div>
  );
};
