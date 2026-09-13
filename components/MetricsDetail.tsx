"use client";

import React from "react";
import { PortfolioSummary } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
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
} from "lucide-react";

interface MetricsDetailProps {
  summary: PortfolioSummary;
}

export const MetricsDetail: React.FC<MetricsDetailProps> = ({ summary }) => {
  const feePercentOfInvested =
    summary.netInvestedCapital > 0
      ? (summary.totalFees / summary.netInvestedCapital) * 100
      : 0;

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
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1 text-xs font-mono text-blue-300">
            Formula: \(R_{"{TWR}"} = \prod (1 + R_i) - 1\)
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
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {summary.twrSubPeriods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500 text-xs">
                    No sub-period events generated yet.
                  </td>
                </tr>
              ) : (
                summary.twrSubPeriods.map((sp, idx) => {
                  const isPeriodPositive = sp.periodReturn >= 0;
                  const isCumPositive = sp.cumulativeTWR >= 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition">
                      <td className="px-3 py-2.5 font-mono text-slate-400">
                        #{idx + 1}
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
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-mono font-bold text-emerald-400">
              Total Realized Gain: {formatCurrency(summary.realizedPnL, { showPlusSign: true })}
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
              {summary.realizedTrades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500 text-xs">
                    No sell transactions executed in this portfolio yet.
                  </td>
                </tr>
              ) : (
                summary.realizedTrades.map((trade) => {
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
      </div>

      {/* 4. Portfolio Volatility & Risk Metrics */}
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
