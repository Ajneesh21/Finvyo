"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { DailyPortfolioPoint } from "@/lib/types";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { TrendingUp, DollarSign, Percent } from "lucide-react";

interface PerformanceChartProps {
  timeline: DailyPortfolioPoint[];
}

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";
type ChartMode = "value" | "twr" | "simple";

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  timeline,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>("twr");
  const [timeframe, setTimeframe] = useState<Timeframe>("ALL");

  // Visible benchmark toggles
  const [showSp500, setShowSp500] = useState(true);
  const [showNasdaq, setShowNasdaq] = useState(true);
  const [showNifty, setShowNifty] = useState(true);
  const [showDow, setShowDow] = useState(false);
  const [showMsci, setShowMsci] = useState(false);

  // Filter timeline based on timeframe
  const filteredData = useMemo(() => {
    if (!timeline || timeline.length === 0) return [];
    if (timeframe === "ALL") return timeline;

    const now = new Date();
    let cutoffDate = new Date();

    if (timeframe === "1M") cutoffDate.setMonth(now.getMonth() - 1);
    else if (timeframe === "3M") cutoffDate.setMonth(now.getMonth() - 3);
    else if (timeframe === "6M") cutoffDate.setMonth(now.getMonth() - 6);
    else if (timeframe === "1Y") cutoffDate.setFullYear(now.getFullYear() - 1);
    else if (timeframe === "YTD") cutoffDate = new Date(now.getFullYear(), 0, 1);

    const cutoffStr = cutoffDate.toISOString().split("T")[0];
    const slice = timeline.filter((pt) => pt.date >= cutoffStr);
    return slice.length > 0 ? slice : timeline;
  }, [timeline, timeframe]);

  // Smart date formatter for X-axis ticks
  const formatXAxisDate = (dateVal?: any) => {
    if (!dateVal) return "";
    const dateStr = String(dateVal);
    const todayStr = new Date().toISOString().split("T")[0];
    if (dateStr === todayStr) return "Today";

    // Format based on range length
    if (filteredData.length <= 45) {
      try {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
          const mNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const month = mNames[parseInt(parts[1], 10) - 1];
          const day = parseInt(parts[2], 10);
          return `${month} ${day}`;
        }
      } catch {}
      return formatDate(dateStr, "MMM d");
    }

    return formatDate(dateStr, "MMM yy");
  };

  const formatTooltipDate = (dateVal?: any) => {
    if (!dateVal) return "";
    const dateStr = String(dateVal);
    const todayStr = new Date().toISOString().split("T")[0];
    if (dateStr === todayStr) {
      return `Today (${formatDate(dateStr, "MMM d, yyyy")})`;
    }
    return formatDate(dateStr, "EEEE, MMM d, yyyy");
  };

  if (!timeline || timeline.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-500 text-sm">
        No performance timeline data available
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl shadow-black/20 space-y-4">
      {/* Chart Header Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Mode Selector Tabs & Current Metric Badge */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-slate-950/80 p-1 border border-slate-800">
            <button
              onClick={() => setChartMode("twr")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                chartMode === "twr"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>TWR vs Indices (%)</span>
            </button>
            <button
              onClick={() => setChartMode("simple")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                chartMode === "simple"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Percent className="h-3.5 w-3.5" />
              <span>Simple Return (%)</span>
            </button>
            <button
              onClick={() => setChartMode("value")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                chartMode === "value"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span>Portfolio Valuation ($)</span>
            </button>
          </div>

          {filteredData.length > 0 && (
            <div className="hidden items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs font-mono sm:flex">
              <span className="text-slate-500">Current:</span>
              <span
                className={`font-bold ${
                  chartMode === "twr"
                    ? (filteredData[filteredData.length - 1].cumulativeTWR ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                    : chartMode === "simple"
                    ? ((filteredData[filteredData.length - 1].simpleReturn ?? filteredData[filteredData.length - 1].cumulativeTWR) ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                    : "text-blue-400"
                }`}
              >
                {chartMode === "twr"
                  ? formatPercent(filteredData[filteredData.length - 1].cumulativeTWR)
                  : chartMode === "simple"
                  ? formatPercent(filteredData[filteredData.length - 1].simpleReturn ?? filteredData[filteredData.length - 1].cumulativeTWR)
                  : formatCurrency(filteredData[filteredData.length - 1].portfolioValue)}
              </span>
            </div>
          )}
        </div>

        {/* Timeframe Selector Pills */}
        <div className="flex items-center gap-1">
          {(["1M", "3M", "6M", "1Y", "YTD", "ALL"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                timeframe === tf
                  ? "bg-slate-700 text-white border border-slate-600"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Benchmark Toggles */}
      {chartMode !== "value" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs border-t border-slate-800/60">
          <span className="text-slate-400 font-medium mr-1 text-[11px] uppercase tracking-wider">
            Compare Indices:
          </span>

          {/* S&P 500 */}
          <button
            onClick={() => setShowSp500(!showSp500)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition border ${
              showSp500
                ? "border-rose-500/50 bg-rose-500/10 text-rose-400 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500 opacity-60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-[#f43f5e]" />
            <span>S&P 500 (US)</span>
          </button>

          {/* Nasdaq 100 */}
          <button
            onClick={() => setShowNasdaq(!showNasdaq)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition border ${
              showNasdaq
                ? "border-purple-500/50 bg-purple-500/10 text-purple-400 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500 opacity-60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-[#a855f7]" />
            <span>Nasdaq 100</span>
          </button>

          {/* Nifty 50 */}
          <button
            onClick={() => setShowNifty(!showNifty)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition border ${
              showNifty
                ? "border-amber-500/50 bg-amber-500/10 text-amber-400 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500 opacity-60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
            <span>Nifty 50</span>
          </button>

          {/* Dow Jones */}
          <button
            onClick={() => setShowDow(!showDow)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition border ${
              showDow
                ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500 opacity-60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-[#06b6d4]" />
            <span>Dow Jones</span>
          </button>

          {/* MSCI World */}
          <button
            onClick={() => setShowMsci(!showMsci)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition border ${
              showMsci
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-medium"
                : "border-slate-800 bg-slate-900 text-slate-500 opacity-60"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-[#10b981]" />
            <span>MSCI World</span>
          </button>
        </div>
      )}

      {/* Chart Canvas */}
      <div className="h-[340px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === "value" ? (
            <AreaChart
              data={filteredData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#64748b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#64748b" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                tickFormatter={formatXAxisDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                stroke="#64748b"
                tickFormatter={(v) => formatCurrency(v, { compact: true })}
                tick={{ fontSize: 11 }}
                domain={["dataMin - 500", "auto"]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md text-xs">
                        <p className="font-semibold text-slate-300 mb-1.5">
                          {formatTooltipDate(label)}
                        </p>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-blue-400">
                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                              Portfolio Value:
                            </span>
                            <span className="font-mono font-bold text-white">
                              {formatCurrency(payload[0]?.value as number)}
                            </span>
                          </div>
                          {payload[1] && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-slate-400">
                                <span className="h-2 w-2 rounded-full bg-slate-500" />
                                Net Invested:
                              </span>
                              <span className="font-mono font-medium text-slate-300">
                                {formatCurrency(payload[1]?.value as number)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="portfolioValue"
                name="Portfolio Value"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#valGrad)"
              />
              <Area
                type="monotone"
                dataKey="netInvestedCapital"
                name="Net Invested"
                stroke="#64748b"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#invGrad)"
              />
            </AreaChart>
          ) : (
            <LineChart
              data={filteredData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                tickFormatter={formatXAxisDate}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                stroke="#64748b"
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md text-xs space-y-1">
                        <p className="font-semibold text-slate-300 mb-1.5">
                          {formatTooltipDate(label)}
                        </p>
                        {payload.map((entry) => (
                          <div
                            key={entry.name}
                            className="flex items-center justify-between gap-4"
                          >
                            <span
                              className="flex items-center gap-1.5 font-medium"
                              style={{ color: entry.color }}
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              {entry.name}:
                            </span>
                            <span
                              className="font-mono font-bold"
                              style={{ color: entry.color }}
                            >
                              {formatPercent(entry.value as number)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Portfolio Return (Bold Line) */}
              <Line
                type="monotone"
                dataKey={chartMode === "simple" ? "simpleReturn" : "cumulativeTWR"}
                name={chartMode === "simple" ? "Portfolio (Simple Return %)" : "Portfolio (TWR %)"}
                stroke={chartMode === "simple" ? "#10b981" : "#3b82f6"}
                strokeWidth={3}
                dot={false}
                activeDot={{
                  r: 6,
                  fill: chartMode === "simple" ? "#10b981" : "#3b82f6",
                  stroke: "#ffffff",
                  strokeWidth: 2,
                }}
              />

              {/* S&P 500 */}
              {showSp500 && (
                <Line
                  type="monotone"
                  dataKey="sp500TWR"
                  name="S&P 500"
                  stroke="#f43f5e"
                  strokeWidth={1.75}
                  strokeDasharray="5 5"
                  dot={false}
                />
              )}

              {/* Nasdaq 100 */}
              {showNasdaq && (
                <Line
                  type="monotone"
                  dataKey="nasdaqTWR"
                  name="Nasdaq 100"
                  stroke="#a855f7"
                  strokeWidth={1.75}
                  strokeDasharray="5 5"
                  dot={false}
                />
              )}

              {/* Nifty 50 */}
              {showNifty && (
                <Line
                  type="monotone"
                  dataKey="nifty50TWR"
                  name="Nifty 50"
                  stroke="#f59e0b"
                  strokeWidth={1.75}
                  strokeDasharray="5 5"
                  dot={false}
                />
              )}

              {/* Dow Jones */}
              {showDow && (
                <Line
                  type="monotone"
                  dataKey="dowTWR"
                  name="Dow Jones"
                  stroke="#06b6d4"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                />
              )}

              {/* MSCI World */}
              {showMsci && (
                <Line
                  type="monotone"
                  dataKey="msciWorldTWR"
                  name="MSCI World"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
