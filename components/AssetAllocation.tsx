"use client";

import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { Holding } from "@/lib/types";
import { formatCurrency, formatPercent, getSectorColor } from "@/lib/utils";
import { PieChart as PieIcon, BarChart3 } from "lucide-react";

interface AssetAllocationProps {
  holdings: Holding[];
  cashBalance: number;
  totalValue: number;
  layout?: "grid" | "vertical";
}

const STOCK_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
];

export const AssetAllocation: React.FC<AssetAllocationProps> = ({
  holdings,
  totalValue,
  layout = "grid",
}) => {
  // Aggregate sectors
  const sectorMap: Record<string, { value: number; count: number }> = {};
  holdings.forEach((h) => {
    const s = h.sector || "Other";
    if (!sectorMap[s]) sectorMap[s] = { value: 0, count: 0 };
    sectorMap[s].value += h.currentValue;
    sectorMap[s].count += 1;
  });

  const sectorData = Object.entries(sectorMap)
    .map(([name, data]) => ({
      name,
      value: Number(data.value.toFixed(2)),
      percent: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      color: getSectorColor(name),
    }))
    .sort((a, b) => b.value - a.value);

  // Top stocks data
  const stockData = holdings.map((h, i) => ({
    name: h.symbol,
    companyName: h.companyName,
    value: Number(h.currentValue.toFixed(2)),
    percent: h.portfolioWeight,
    color: STOCK_COLORS[i % STOCK_COLORS.length],
  }));

  return (
    <div
      className={
        layout === "vertical"
          ? "space-y-4"
          : "grid grid-cols-1 gap-4 lg:grid-cols-2"
      }
    >
      {/* 1. Stock / Asset Breakdown Donut */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-blue-400" />
            Stock & Asset Allocation
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {holdings.length} Assets
          </span>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stockData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
              >
                {stockData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl text-xs space-y-1">
                        <div className="flex items-center gap-2 font-bold text-white">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: data.color }}
                          />
                          {data.name}
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {data.companyName}
                        </p>
                        <div className="flex justify-between gap-4 font-mono">
                          <span className="text-slate-400">Value:</span>
                          <span className="font-semibold text-white">
                            {formatCurrency(data.value)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 font-mono">
                          <span className="text-slate-400">Weight:</span>
                          <span className="font-semibold text-blue-400">
                            {formatPercent(data.percent)}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Pills */}
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-2 border-t border-slate-800/80">
          {stockData.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-1.5 rounded-lg bg-slate-950/60 px-2 py-1 text-xs border border-slate-800"
            >
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="font-bold text-white font-mono">{s.name}</span>
              <span className="font-mono text-slate-400">
                {s.percent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Sector Allocation Breakdown */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-400" />
            Sector Diversification
          </h3>
          <span className="text-xs font-mono text-slate-400">
            {sectorData.length} Sectors
          </span>
        </div>

        {/* Sector Progress Bars */}
        <div className="space-y-3 pt-2">
          {sectorData.map((sec) => (
            <div key={sec.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: sec.color }}
                  />
                  <span className="font-medium text-slate-200 truncate max-w-[150px]">
                    {sec.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono whitespace-nowrap">
                  <span className="text-slate-400">
                    {formatCurrency(sec.value)}
                  </span>
                  <span className="font-bold text-white">
                    {sec.percent.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, sec.percent)}%`,
                    backgroundColor: sec.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
