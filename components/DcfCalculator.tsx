"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calculator,
  TrendingUp,
  Search,
  RefreshCw,
  Sliders,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Sparkles,
  HelpCircle,
  BarChart3,
  Grid,
  CheckCircle2,
  ShieldAlert,
  Target,
  Clock,
  Layers,
} from "lucide-react";
import { FinancialData } from "@/lib/dcf-types";
import {
  calculateMultiHorizonEpsValuation,
  MultiHorizonEpsValuation,
} from "@/lib/dcf-engine";
import { formatPercent } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";

interface DcfCalculatorProps {
  defaultTicker?: string;
  portfolioHoldings?: { symbol: string; companyName: string }[];
}

const POPULAR_TICKERS = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "META", name: "Meta" },
];

export const DcfCalculator: React.FC<DcfCalculatorProps> = ({
  defaultTicker = "AAPL",
  portfolioHoldings = [],
}) => {
  const [ticker, setTicker] = useState<string>(defaultTicker);
  const [inputTicker, setInputTicker] = useState<string>(defaultTicker);
  const [selectedHorizon, setSelectedHorizon] = useState<3 | 5 | 10>(5);

  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Draft form inputs
  const [draftBuyPrice, setDraftBuyPrice] = useState<string>("");
  const [draftScenarios, setDraftScenarios] = useState<{
    BEAR: { epsGrowth: string; exitPE: string };
    BASE: { epsGrowth: string; exitPE: string };
    BULL: { epsGrowth: string; exitPE: string };
  }>({
    BEAR: { epsGrowth: "6", exitPE: "16" },
    BASE: { epsGrowth: "12", exitPE: "22" },
    BULL: { epsGrowth: "18", exitPE: "28" },
  });

  // Applied values used for calculation
  const [appliedBuyPrice, setAppliedBuyPrice] = useState<number | null>(null);
  const [appliedScenarios, setAppliedScenarios] = useState<{
    BEAR: { epsGrowth: number; exitPE: number };
    BASE: { epsGrowth: number; exitPE: number };
    BULL: { epsGrowth: number; exitPE: number };
  }>({
    BEAR: { epsGrowth: 6, exitPE: 16 },
    BASE: { epsGrowth: 12, exitPE: 22 },
    BULL: { epsGrowth: 18, exitPE: 28 },
  });

  const [isSavedNotice, setIsSavedNotice] = useState<boolean>(false);

  // Load saved inputs from localStorage for a given ticker
  const loadSavedInputs = (sym: string, livePrice: number, histGrowth: number, trailingPE: number) => {
    try {
      const saved = localStorage.getItem(`dcf_calc_${sym}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.buyPrice && parsed.scenarios) {
          setDraftBuyPrice(String(parsed.buyPrice));
          setDraftScenarios({
            BEAR: {
              epsGrowth: String(parsed.scenarios.BEAR?.epsGrowth ?? 6),
              exitPE: String(parsed.scenarios.BEAR?.exitPE ?? 16),
            },
            BASE: {
              epsGrowth: String(parsed.scenarios.BASE?.epsGrowth ?? 12),
              exitPE: String(parsed.scenarios.BASE?.exitPE ?? 22),
            },
            BULL: {
              epsGrowth: String(parsed.scenarios.BULL?.epsGrowth ?? 18),
              exitPE: String(parsed.scenarios.BULL?.exitPE ?? 28),
            },
          });
          setAppliedBuyPrice(Number(parsed.buyPrice));
          setAppliedScenarios({
            BEAR: {
              epsGrowth: Number(parsed.scenarios.BEAR?.epsGrowth ?? 6),
              exitPE: Number(parsed.scenarios.BEAR?.exitPE ?? 16),
            },
            BASE: {
              epsGrowth: Number(parsed.scenarios.BASE?.epsGrowth ?? 12),
              exitPE: Number(parsed.scenarios.BASE?.exitPE ?? 22),
            },
            BULL: {
              epsGrowth: Number(parsed.scenarios.BULL?.epsGrowth ?? 18),
              exitPE: Number(parsed.scenarios.BULL?.exitPE ?? 28),
            },
          });
          return;
        }
      }
    } catch {
      // ignore localStorage parse error
    }

    // Default intelligent starting values derived from live company metrics
    const baseG = histGrowth > 0 ? Math.min(30, Math.max(6, Math.round(histGrowth))) : 12;
    const baseP = trailingPE > 0 ? Math.min(40, Math.max(12, Math.round(trailingPE))) : 22;

    const bearG = Math.max(3, Math.round(baseG * 0.6));
    const bearP = Math.max(10, Math.round(baseP * 0.75));

    const bullG = Math.min(45, Math.round(baseG * 1.4));
    const bullP = Math.round(baseP * 1.25);

    const initialDraft = {
      BEAR: { epsGrowth: String(bearG), exitPE: String(bearP) },
      BASE: { epsGrowth: String(baseG), exitPE: String(baseP) },
      BULL: { epsGrowth: String(bullG), exitPE: String(bullP) },
    };

    setDraftBuyPrice(String(livePrice));
    setDraftScenarios(initialDraft);
    setAppliedBuyPrice(livePrice);
    setAppliedScenarios({
      BEAR: { epsGrowth: bearG, exitPE: bearP },
      BASE: { epsGrowth: baseG, exitPE: baseP },
      BULL: { epsGrowth: bullG, exitPE: bullP },
    });
  };

  // Fetch financial data from backend API
  const fetchFundamentals = useCallback(async (sym: string) => {
    const cleanSym = sym.trim().toUpperCase();
    if (!cleanSym) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/dcf?ticker=${encodeURIComponent(cleanSym)}`);
      const data = await res.json();

      if (!res.ok || !data.financialData) {
        throw new Error(data.error || `Could not fetch metrics for ${cleanSym}`);
      }

      setFinancialData(data.financialData);
      setTicker(cleanSym);
      setInputTicker(cleanSym);

      loadSavedInputs(
        cleanSym,
        data.financialData.currentPrice,
        data.financialData.historicalEpsGrowth || 12,
        data.financialData.trailingPE || 22
      );
    } catch (err: unknown) {
      console.error("Failed to load DCF data:", err);
      setError(err instanceof Error ? err.message : "Failed to load financial data. Please check ticker.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFundamentals(ticker);
  }, [fetchFundamentals]);

  const handleSearch = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (inputTicker.trim()) {
      fetchFundamentals(inputTicker.trim().toUpperCase());
    }
  };

  // Calculate & Save handler
  const handleCalculateAndSave = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();

    const buyP = parseFloat(draftBuyPrice) || financialData?.currentPrice || 100;
    const newApplied = {
      BEAR: {
        epsGrowth: parseFloat(draftScenarios.BEAR.epsGrowth) || 5,
        exitPE: parseFloat(draftScenarios.BEAR.exitPE) || 15,
      },
      BASE: {
        epsGrowth: parseFloat(draftScenarios.BASE.epsGrowth) || 12,
        exitPE: parseFloat(draftScenarios.BASE.exitPE) || 22,
      },
      BULL: {
        epsGrowth: parseFloat(draftScenarios.BULL.epsGrowth) || 20,
        exitPE: parseFloat(draftScenarios.BULL.exitPE) || 30,
      },
    };

    setAppliedBuyPrice(buyP);
    setAppliedScenarios(newApplied);

    // Save to localStorage
    try {
      localStorage.setItem(
        `dcf_calc_${ticker}`,
        JSON.stringify({
          buyPrice: buyP,
          scenarios: newApplied,
          updatedAt: new Date().toISOString(),
        })
      );
      setIsSavedNotice(true);
      setTimeout(() => setIsSavedNotice(false), 2500);
    } catch {
      // ignore
    }
  };

  // Reset to live market defaults
  const handleResetToMarketDefaults = () => {
    if (financialData) {
      try {
        localStorage.removeItem(`dcf_calc_${ticker}`);
      } catch {
        // ignore
      }
      loadSavedInputs(
        ticker,
        financialData.currentPrice,
        financialData.historicalEpsGrowth || 12,
        financialData.trailingPE || 22
      );
    }
  };

  // Compute Multi-Horizon Valuation (live responsive to input changes & saved on Calculate)
  const valuation: MultiHorizonEpsValuation | null = useMemo(() => {
    if (!financialData) return null;

    const parsedBuyPrice = parseFloat(draftBuyPrice);
    const buyPrice =
      !isNaN(parsedBuyPrice) && parsedBuyPrice > 0
        ? parsedBuyPrice
        : appliedBuyPrice !== null && appliedBuyPrice > 0
        ? appliedBuyPrice
        : financialData.currentPrice || 100;

    const bearG = parseFloat(draftScenarios.BEAR.epsGrowth);
    const bearP = parseFloat(draftScenarios.BEAR.exitPE);
    const baseG = parseFloat(draftScenarios.BASE.epsGrowth);
    const baseP = parseFloat(draftScenarios.BASE.exitPE);
    const bullG = parseFloat(draftScenarios.BULL.epsGrowth);
    const bullP = parseFloat(draftScenarios.BULL.exitPE);

    const scenarios = {
      BEAR: {
        epsGrowth: !isNaN(bearG) ? bearG : appliedScenarios.BEAR.epsGrowth,
        exitPE: !isNaN(bearP) && bearP > 0 ? bearP : appliedScenarios.BEAR.exitPE,
      },
      BASE: {
        epsGrowth: !isNaN(baseG) ? baseG : appliedScenarios.BASE.epsGrowth,
        exitPE: !isNaN(baseP) && baseP > 0 ? baseP : appliedScenarios.BASE.exitPE,
      },
      BULL: {
        epsGrowth: !isNaN(bullG) ? bullG : appliedScenarios.BULL.epsGrowth,
        exitPE: !isNaN(bullP) && bullP > 0 ? bullP : appliedScenarios.BULL.exitPE,
      },
    };

    return calculateMultiHorizonEpsValuation(financialData, {
      purchasePrice: buyPrice,
      startingEps: financialData.trailingEps,
      scenarios,
    });
  }, [financialData, draftBuyPrice, draftScenarios, appliedBuyPrice, appliedScenarios]);

  // Trajectory Chart Data: Year 0 -> Year 3 -> Year 5 -> Year 10
  const trajectoryChartData = useMemo(() => {
    if (!valuation) return [];

    const buyPrice = valuation.purchasePrice;
    const curYear = new Date().getFullYear();

    return [
      {
        year: `Now (${curYear})`,
        BearPrice: buyPrice,
        BasePrice: buyPrice,
        BullPrice: buyPrice,
      },
      {
        year: `3Y (${curYear + 3})`,
        BearPrice: valuation.scenarios.BEAR.horizons[3].finalPrice,
        BasePrice: valuation.scenarios.BASE.horizons[3].finalPrice,
        BullPrice: valuation.scenarios.BULL.horizons[3].finalPrice,
      },
      {
        year: `5Y (${curYear + 5})`,
        BearPrice: valuation.scenarios.BEAR.horizons[5].finalPrice,
        BasePrice: valuation.scenarios.BASE.horizons[5].finalPrice,
        BullPrice: valuation.scenarios.BULL.horizons[5].finalPrice,
      },
      {
        year: `10Y (${curYear + 10})`,
        BearPrice: valuation.scenarios.BEAR.horizons[10].finalPrice,
        BasePrice: valuation.scenarios.BASE.horizons[10].finalPrice,
        BullPrice: valuation.scenarios.BULL.horizons[10].finalPrice,
      },
    ];
  }, [valuation]);

  // Bar Chart Data for Selected Horizon
  const horizonBarData = useMemo(() => {
    if (!valuation) return [];

    const pPrice = valuation.purchasePrice;
    const h = selectedHorizon;

    return [
      {
        name: "Your Buy Price",
        price: pPrice,
        fill: "#94a3b8",
        label: "Entry Price",
      },
      {
        name: `Bear ${h}Y Target`,
        price: valuation.scenarios.BEAR.horizons[h].finalPrice,
        cagr: valuation.scenarios.BEAR.horizons[h].expectedCagr,
        fill: "#f59e0b",
        label: "Conservative",
      },
      {
        name: `Base ${h}Y Target`,
        price: valuation.scenarios.BASE.horizons[h].finalPrice,
        cagr: valuation.scenarios.BASE.horizons[h].expectedCagr,
        fill: "#3b82f6",
        label: "Realistic",
      },
      {
        name: `Bull ${h}Y Target`,
        price: valuation.scenarios.BULL.horizons[h].finalPrice,
        cagr: valuation.scenarios.BULL.horizons[h].expectedCagr,
        fill: "#10b981",
        label: "Optimistic",
      },
    ];
  }, [valuation, selectedHorizon]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                EPS &amp; P/E Valuation &amp; Return Calculator
              </h2>
              <p className="text-xs text-slate-400">
                Calculates predicted final price after 3, 5, and 10 years and expected annual returns (% CAGR) for your purchase price.
              </p>
            </div>
          </div>
        </div>

        {/* Ticker Search Form */}
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={inputTicker}
                onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                placeholder="Enter Ticker (e.g. AAPL, NVDA)"
                className="w-44 sm:w-52 rounded-xl border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs font-mono font-medium text-white placeholder-slate-500 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-blue-500 disabled:opacity-50 transition"
            >
              {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <span>Analyze</span>}
            </button>
          </form>

          <button
            onClick={() => fetchFundamentals(ticker)}
            disabled={isLoading}
            className="flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition"
            title="Refresh latest stock price and EPS"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-blue-400 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Quick Pick Chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 flex items-center gap-1 text-[11px] font-medium">
          <Sparkles className="h-3 w-3 text-amber-400" /> Quick Tickers:
        </span>
        {POPULAR_TICKERS.map((item) => (
          <button
            key={item.symbol}
            onClick={() => {
              setInputTicker(item.symbol);
              fetchFundamentals(item.symbol);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition ${
              ticker === item.symbol
                ? "bg-blue-600/30 text-blue-400 border border-blue-500/40"
                : "bg-slate-800/60 text-slate-300 border border-slate-700/60 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {item.symbol} <span className="text-[10px] text-slate-400 font-sans">({item.name})</span>
          </button>
        ))}

        {portfolioHoldings.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-slate-400">From Portfolio:</span>
            <select
              value={ticker}
              onChange={(e) => {
                if (e.target.value) {
                  setInputTicker(e.target.value);
                  fetchFundamentals(e.target.value);
                }
              }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none"
            >
              <option value="" disabled>Select holding...</option>
              {portfolioHoldings.map((h) => (
                <option key={h.symbol} value={h.symbol}>
                  {h.symbol} - {h.companyName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
          <strong>Data Fetch Error:</strong> {error}
        </div>
      )}

      {valuation && financialData && (
        <div className="space-y-6">
          {/* Main Interactive Controls Panel */}
          <form
            onSubmit={handleCalculateAndSave}
            className="rounded-2xl border border-blue-500/30 bg-slate-900/90 p-5 shadow-2xl space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  {financialData.symbol}
                </span>
                <span className="text-sm font-bold text-white">{financialData.companyName}</span>
                <span className="text-xs text-slate-400 font-mono">
                  (Live Market Price: <strong>${financialData.currentPrice}</strong>)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isSavedNotice && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-pulse">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Inputs Saved!
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetToMarketDefaults}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition"
                >
                  <RotateCcw className="h-3 w-3 text-amber-400" />
                  <span>Reset Defaults</span>
                </button>
              </div>
            </div>

            {/* Top 2 Primary Inputs: Buy Price & Auto Starting EPS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* 1. Purchase / Buy Price ($) - Customer input */}
              <div className="rounded-xl border border-blue-500/40 bg-slate-950 p-4 space-y-1.5 ring-1 ring-blue-500/20">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-blue-400" /> Your Purchase / Buy Price ($)
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraftBuyPrice(String(financialData.currentPrice))}
                    className="text-[11px] text-blue-400 hover:text-blue-300 underline font-mono"
                    title="Reset buy price to live trading price"
                  >
                    Set to Live (${financialData.currentPrice})
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-base">$</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={draftBuyPrice}
                    onChange={(e) => setDraftBuyPrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-7 pr-3 font-mono text-lg font-bold text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Defaults to current market quote. You can change this to any price you bought (or plan to buy) at.
                </p>
              </div>

              {/* 2. Starting EPS (From actual data) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Starting EPS (Actual Trailing 12M)
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono border border-emerald-500/20">
                    From Data
                  </span>
                </div>
                <div className="py-1">
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    ${financialData.trailingEps || (financialData.currentPrice / (financialData.trailingPE || 25)).toFixed(2)}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Actual earnings per share over the past 4 quarters reported in SEC filings. Current P/E: <strong className="text-slate-200">{valuation.currentPE}x</strong>.
                </p>
              </div>
            </div>

            {/* Scenario Assumptions Matrix (Bear, Base, Bull) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-indigo-400" />
                  Scenario Inputs: Expected Annual EPS Growth (%) &amp; Exit P/E Multiples (x)
                </span>
                <span className="text-[11px] text-slate-400">Enter your estimates below</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Scenario</th>
                      <th className="px-4 py-2.5 font-semibold">Expected Annual EPS Growth (% per year)</th>
                      <th className="px-4 py-2.5 font-semibold">Expected Exit P/E Multiple (x)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono">
                    {/* BEAR */}
                    <tr className="hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-sans font-semibold text-amber-400 flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5" /> Bear Case (Conservative)
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            value={draftScenarios.BEAR.epsGrowth}
                            onChange={(e) =>
                              setDraftScenarios((prev) => ({
                                ...prev,
                                BEAR: { ...prev.BEAR, epsGrowth: e.target.value },
                              }))
                            }
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white font-mono"
                          />
                          <span className="text-slate-400">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            value={draftScenarios.BEAR.exitPE}
                            onChange={(e) =>
                              setDraftScenarios((prev) => ({
                                ...prev,
                                BEAR: { ...prev.BEAR, exitPE: e.target.value },
                              }))
                            }
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white font-mono"
                          />
                          <span className="text-slate-400">x</span>
                        </div>
                      </td>
                    </tr>

                    {/* BASE */}
                    <tr className="bg-blue-600/10 hover:bg-blue-600/20 font-semibold border-y border-blue-500/30">
                      <td className="px-4 py-2.5 font-sans font-bold text-blue-400 flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5" /> Base Case (Target / Realistic)
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            value={draftScenarios.BASE.epsGrowth}
                            onChange={(e) =>
                              setDraftScenarios((prev) => ({
                                ...prev,
                                BASE: { ...prev.BASE, epsGrowth: e.target.value },
                              }))
                            }
                            className="w-24 rounded border border-blue-500 bg-slate-900 px-2.5 py-1 text-white font-bold font-mono"
                          />
                          <span className="text-blue-300">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            value={draftScenarios.BASE.exitPE}
                            onChange={(e) =>
                              setDraftScenarios((prev) => ({
                                ...prev,
                                BASE: { ...prev.BASE, exitPE: e.target.value },
                              }))
                            }
                            className="w-24 rounded border border-blue-500 bg-slate-900 px-2.5 py-1 text-white font-bold font-mono"
                          />
                          <span className="text-blue-300">x</span>
                        </div>
                      </td>
                    </tr>

                    {/* BULL */}
                    <tr className="hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-sans font-semibold text-emerald-400 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5" /> Bull Case (Optimistic)
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            value={draftScenarios.BULL.epsGrowth}
                            onChange={(e) =>
                              setDraftScenarios((prev) => ({
                                ...prev,
                                BULL: { ...prev.BULL, epsGrowth: e.target.value },
                              }))
                            }
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white font-mono"
                          />
                          <span className="text-slate-400">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="any"
                            value={draftScenarios.BULL.exitPE}
                            onChange={(e) =>
                              setDraftScenarios((prev) => ({
                                ...prev,
                                BULL: { ...prev.BULL, exitPE: e.target.value },
                              }))
                            }
                            className="w-24 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white font-mono"
                          />
                          <span className="text-slate-400">x</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Calculate Button */}
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:from-blue-500 hover:to-indigo-500 transition ring-1 ring-white/10 cursor-pointer"
              >
                <Calculator className="h-4 w-4" />
                <span>Calculate &amp; Save Valuation</span>
              </button>
            </div>
          </form>

          {/* Time Horizon Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-400" /> Focus Horizon:
              </span>
              <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1">
                {([3, 5, 10] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setSelectedHorizon(h)}
                    className={`rounded-lg px-4 py-1.5 text-xs font-bold font-mono transition ${
                      selectedHorizon === h
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {h} Years
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Purchase Price: <strong className="text-white">${valuation.purchasePrice}</strong> &middot; Starting EPS: <strong className="text-emerald-400">${valuation.startingEps}</strong>
            </div>
          </div>

          {/* Top 3 Scenario Output Cards (With Expected Annual Return prominently shown) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* 1. BEAR CASE */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" /> Bear Case ({selectedHorizon}Y)
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                  {valuation.scenarios.BEAR.epsGrowth}% Growth &middot; {valuation.scenarios.BEAR.exitPE}x P/E
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 block">Expected Annual Return (% CAGR):</span>
                <div
                  className={`text-3xl font-extrabold font-mono flex items-center gap-1 ${
                    valuation.scenarios.BEAR.horizons[selectedHorizon].expectedCagr >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {valuation.scenarios.BEAR.horizons[selectedHorizon].expectedCagr >= 0 ? (
                    <ArrowUpRight className="h-6 w-6" />
                  ) : (
                    <ArrowDownRight className="h-6 w-6" />
                  )}
                  {formatPercent(valuation.scenarios.BEAR.horizons[selectedHorizon].expectedCagr)} / yr
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-800/80 pt-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Predicted Final Stock Price:</span>
                  <span className="font-mono text-white font-bold text-sm">
                    ${valuation.scenarios.BEAR.horizons[selectedHorizon].finalPrice}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Future EPS ({selectedHorizon}Y):</span>
                  <span className="font-mono text-slate-300">
                    ${valuation.scenarios.BEAR.horizons[selectedHorizon].futureEps}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Return:</span>
                  <span className="font-mono text-slate-300">
                    {formatPercent(valuation.scenarios.BEAR.horizons[selectedHorizon].totalGainPercent)} ({valuation.scenarios.BEAR.horizons[selectedHorizon].totalGainMultiple}x)
                  </span>
                </div>
              </div>
            </div>

            {/* 2. BASE CASE (HERO) */}
            <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500 bg-gradient-to-b from-blue-950/40 to-slate-900 p-5 shadow-2xl shadow-blue-500/10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="h-4 w-4" /> Base Case Target ({selectedHorizon}Y)
                </span>
                <span className="text-[10px] text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full font-mono font-semibold">
                  {valuation.scenarios.BASE.epsGrowth}% Growth &middot; {valuation.scenarios.BASE.exitPE}x P/E
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-blue-200 block">Expected Annual Return (% CAGR):</span>
                <div
                  className={`text-4xl font-black font-mono flex items-center gap-1 ${
                    valuation.scenarios.BASE.horizons[selectedHorizon].expectedCagr >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {valuation.scenarios.BASE.horizons[selectedHorizon].expectedCagr >= 0 ? (
                    <ArrowUpRight className="h-8 w-8" />
                  ) : (
                    <ArrowDownRight className="h-8 w-8" />
                  )}
                  {formatPercent(valuation.scenarios.BASE.horizons[selectedHorizon].expectedCagr)} / yr
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-800/80 pt-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-300">Predicted Final Stock Price:</span>
                  <span className="font-mono text-white font-extrabold text-base">
                    ${valuation.scenarios.BASE.horizons[selectedHorizon].finalPrice}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Future EPS ({selectedHorizon}Y):</span>
                  <span className="font-mono text-white font-semibold">
                    ${valuation.scenarios.BASE.horizons[selectedHorizon].futureEps}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Return:</span>
                  <span className="font-mono text-white font-semibold">
                    {formatPercent(valuation.scenarios.BASE.horizons[selectedHorizon].totalGainPercent)} ({valuation.scenarios.BASE.horizons[selectedHorizon].totalGainMultiple}x)
                  </span>
                </div>
              </div>
            </div>

            {/* 3. BULL CASE */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-4 hover:border-slate-700 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4" /> Bull Case ({selectedHorizon}Y)
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                  {valuation.scenarios.BULL.epsGrowth}% Growth &middot; {valuation.scenarios.BULL.exitPE}x P/E
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 block">Expected Annual Return (% CAGR):</span>
                <div
                  className={`text-3xl font-extrabold font-mono flex items-center gap-1 ${
                    valuation.scenarios.BULL.horizons[selectedHorizon].expectedCagr >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {valuation.scenarios.BULL.horizons[selectedHorizon].expectedCagr >= 0 ? (
                    <ArrowUpRight className="h-6 w-6" />
                  ) : (
                    <ArrowDownRight className="h-6 w-6" />
                  )}
                  {formatPercent(valuation.scenarios.BULL.horizons[selectedHorizon].expectedCagr)} / yr
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-800/80 pt-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Predicted Final Stock Price:</span>
                  <span className="font-mono text-white font-bold text-sm">
                    ${valuation.scenarios.BULL.horizons[selectedHorizon].finalPrice}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Future EPS ({selectedHorizon}Y):</span>
                  <span className="font-mono text-slate-300">
                    ${valuation.scenarios.BULL.horizons[selectedHorizon].futureEps}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Return:</span>
                  <span className="font-mono text-slate-300">
                    {formatPercent(valuation.scenarios.BULL.horizons[selectedHorizon].totalGainPercent)} ({valuation.scenarios.BULL.horizons[selectedHorizon].totalGainMultiple}x)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Master Comparison Table across 3, 5 & 10 Years */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-xl">
            <div className="border-b border-slate-800 px-5 py-3.5 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-400" />
                Predicted Final Stock Prices &amp; Expected Annual Returns (3Y, 5Y &amp; 10Y)
              </h3>
              <span className="text-xs font-mono text-slate-400">
                Entry Price: <strong className="text-white">${valuation.purchasePrice}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Scenario</th>
                    <th className="px-4 py-3">EPS Growth</th>
                    <th className="px-4 py-3 border-r border-slate-800">Exit P/E</th>
                    {/* 3 Years */}
                    <th className="px-4 py-3 text-right bg-slate-900/40">Final Price (3Y)</th>
                    <th className="px-4 py-3 text-right bg-slate-900/40 border-r border-slate-800 font-bold text-blue-400">
                      Expected CAGR (3Y)
                    </th>
                    {/* 5 Years */}
                    <th className="px-4 py-3 text-right bg-blue-950/20">Final Price (5Y)</th>
                    <th className="px-4 py-3 text-right bg-blue-950/20 border-r border-slate-800 font-bold text-blue-400">
                      Expected CAGR (5Y)
                    </th>
                    {/* 10 Years */}
                    <th className="px-4 py-3 text-right bg-slate-900/40">Final Price (10Y)</th>
                    <th className="px-4 py-3 text-right bg-slate-900/40 font-bold text-blue-400">
                      Expected CAGR (10Y)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-slate-200">
                  {/* BEAR ROW */}
                  <tr className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-sans font-semibold text-amber-400 flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" /> Bear (Low)
                    </td>
                    <td className="px-4 py-3 text-slate-300">{valuation.scenarios.BEAR.epsGrowth}%</td>
                    <td className="px-4 py-3 text-slate-300 border-r border-slate-800">{valuation.scenarios.BEAR.exitPE}x</td>
                    {/* 3Y */}
                    <td className="px-4 py-3 text-right font-bold text-white bg-slate-900/40">
                      ${valuation.scenarios.BEAR.horizons[3].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right border-r border-slate-800 bg-slate-900/40 font-bold">
                      <span className={valuation.scenarios.BEAR.horizons[3].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BEAR.horizons[3].expectedCagr)}
                      </span>
                    </td>
                    {/* 5Y */}
                    <td className="px-4 py-3 text-right font-bold text-white bg-blue-950/20">
                      ${valuation.scenarios.BEAR.horizons[5].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right border-r border-slate-800 bg-blue-950/20 font-bold">
                      <span className={valuation.scenarios.BEAR.horizons[5].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BEAR.horizons[5].expectedCagr)}
                      </span>
                    </td>
                    {/* 10Y */}
                    <td className="px-4 py-3 text-right font-bold text-white bg-slate-900/40">
                      ${valuation.scenarios.BEAR.horizons[10].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right bg-slate-900/40 font-bold">
                      <span className={valuation.scenarios.BEAR.horizons[10].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BEAR.horizons[10].expectedCagr)}
                      </span>
                    </td>
                  </tr>

                  {/* BASE ROW */}
                  <tr className="bg-blue-600/10 font-bold border-y border-blue-500/30">
                    <td className="px-4 py-3 font-sans text-blue-400 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" /> Base (Target)
                    </td>
                    <td className="px-4 py-3 text-white">{valuation.scenarios.BASE.epsGrowth}%</td>
                    <td className="px-4 py-3 text-white border-r border-slate-800">{valuation.scenarios.BASE.exitPE}x</td>
                    {/* 3Y */}
                    <td className="px-4 py-3 text-right text-white text-sm bg-slate-900/40">
                      ${valuation.scenarios.BASE.horizons[3].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right border-r border-slate-800 bg-slate-900/40 text-sm font-extrabold">
                      <span className={valuation.scenarios.BASE.horizons[3].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BASE.horizons[3].expectedCagr)}
                      </span>
                    </td>
                    {/* 5Y */}
                    <td className="px-4 py-3 text-right text-white text-base bg-blue-950/40 font-black">
                      ${valuation.scenarios.BASE.horizons[5].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right border-r border-slate-800 bg-blue-950/40 text-base font-black">
                      <span className={valuation.scenarios.BASE.horizons[5].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BASE.horizons[5].expectedCagr)}
                      </span>
                    </td>
                    {/* 10Y */}
                    <td className="px-4 py-3 text-right text-white text-sm bg-slate-900/40">
                      ${valuation.scenarios.BASE.horizons[10].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right bg-slate-900/40 text-sm font-extrabold">
                      <span className={valuation.scenarios.BASE.horizons[10].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BASE.horizons[10].expectedCagr)}
                      </span>
                    </td>
                  </tr>

                  {/* BULL ROW */}
                  <tr className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-sans font-semibold text-emerald-400 flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5" /> Bull (High)
                    </td>
                    <td className="px-4 py-3 text-slate-300">{valuation.scenarios.BULL.epsGrowth}%</td>
                    <td className="px-4 py-3 text-slate-300 border-r border-slate-800">{valuation.scenarios.BULL.exitPE}x</td>
                    {/* 3Y */}
                    <td className="px-4 py-3 text-right font-bold text-white bg-slate-900/40">
                      ${valuation.scenarios.BULL.horizons[3].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right border-r border-slate-800 bg-slate-900/40 font-bold">
                      <span className={valuation.scenarios.BULL.horizons[3].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BULL.horizons[3].expectedCagr)}
                      </span>
                    </td>
                    {/* 5Y */}
                    <td className="px-4 py-3 text-right font-bold text-white bg-blue-950/20">
                      ${valuation.scenarios.BULL.horizons[5].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right border-r border-slate-800 bg-blue-950/20 font-bold">
                      <span className={valuation.scenarios.BULL.horizons[5].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BULL.horizons[5].expectedCagr)}
                      </span>
                    </td>
                    {/* 10Y */}
                    <td className="px-4 py-3 text-right font-bold text-white bg-slate-900/40">
                      ${valuation.scenarios.BULL.horizons[10].finalPrice}
                    </td>
                    <td className="px-4 py-3 text-right bg-slate-900/40 font-bold">
                      <span className={valuation.scenarios.BULL.horizons[10].expectedCagr >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatPercent(valuation.scenarios.BULL.horizons[10].expectedCagr)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Interactive Visual Graphs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Graph 1: Multi-Year Price Trajectory */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  Stock Price Trajectory: Entry &rarr; 3Y &rarr; 5Y &rarr; 10Y
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">Buy: ${valuation.purchasePrice}</span>
              </div>
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trajectoryChartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="year" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "0.75rem",
                        color: "#f8fafc",
                        fontSize: "12px",
                      }}
                      formatter={(val: any) => [`$${Number(val).toFixed(2)}`, "Predicted Price"]}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                    <Line
                      type="monotone"
                      dataKey="BearPrice"
                      name="Bear Scenario Price"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="BasePrice"
                      name="Base Target Price"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="BullPrice"
                      name="Bull Scenario Price"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Graph 2: Target Price Comparison for Selected Horizon */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-emerald-400" />
                  {selectedHorizon}-Year Predicted Price vs Your Buy Price
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">{selectedHorizon}-Year Horizon</span>
              </div>
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={horizonBarData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "0.75rem",
                        color: "#f8fafc",
                        fontSize: "12px",
                      }}
                      formatter={(val: any, _name: any, item: any) => [
                        `$${Number(val).toFixed(2)} ${item.payload.cagr !== undefined ? `(${formatPercent(item.payload.cagr)} / yr)` : ""}`,
                        "Price",
                      ]}
                    />
                    <ReferenceLine
                      y={valuation.purchasePrice}
                      stroke="#f43f5e"
                      strokeDasharray="4 4"
                      label={{
                        value: `Buy Price ($${valuation.purchasePrice})`,
                        fill: "#f43f5e",
                        position: "insideTopRight",
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="price" radius={[6, 6, 0, 0]}>
                      {horizonBarData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 2D Sensitivity Heatmap Matrix: EPS Growth vs Exit P/E */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Grid className="h-4 w-4 text-indigo-400" />
                  Expected Annual Return (CAGR %) &amp; 5-Year Final Price Matrix
                </h4>
                <p className="text-xs text-slate-400">
                  Matrix showing resulting annual return (% CAGR) across various EPS growth rates (columns) and Exit P/E multiples (rows)
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded bg-emerald-500/40 border border-emerald-400 inline-block" /> Positive CAGR Return
                </span>
                <span className="flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                  <span className="h-2.5 w-2.5 rounded bg-rose-500/40 border border-rose-400 inline-block" /> Negative Return (Loss)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs">
                <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Exit P/E \ EPS Growth</th>
                    {valuation.sensitivityMatrix.growthRates.map((g) => (
                      <th
                        key={g}
                        className={`px-4 py-2.5 font-mono font-semibold ${
                          g === valuation.scenarios.BASE.epsGrowth ? "text-blue-400 font-bold" : ""
                        }`}
                      >
                        +{g}% Growth
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {valuation.sensitivityMatrix.grid.map((row, rIdx) => {
                    const peVal = valuation.sensitivityMatrix.peMultiples[rIdx];
                    const isBasePE = peVal === valuation.scenarios.BASE.exitPE;

                    return (
                      <tr key={peVal} className={isBasePE ? "bg-blue-500/5 font-semibold" : ""}>
                        <td className="px-4 py-2.5 text-left font-sans text-slate-300 font-medium">
                          <span className={isBasePE ? "text-blue-400 font-bold" : ""}>
                            {peVal}x P/E {isBasePE && "(Base)"}
                          </span>
                        </td>
                        {row.map((cell, cIdx) => {
                          const isSelectedBase =
                            isBasePE && cell.growth === valuation.scenarios.BASE.epsGrowth;
                          const isPositive = cell.cagr5Y >= 0;

                          return (
                            <td
                              key={cIdx}
                              className={`px-4 py-2.5 transition ${
                                isSelectedBase
                                  ? "ring-2 ring-blue-400 bg-blue-600/30 text-white font-extrabold rounded-lg shadow-lg"
                                  : isPositive
                                  ? "bg-emerald-950/40 text-emerald-300"
                                  : "bg-rose-950/40 text-rose-300"
                              }`}
                            >
                              <div className="font-bold">{formatPercent(cell.cagr5Y)} / yr</div>
                              <div className="text-[10px] text-slate-400">
                                5Y: ${cell.finalPrice5Y}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Simple Formula Legend */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5">
              <HelpCircle className="h-4 w-4 text-blue-400" />
              How the Calculations Work:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px]">
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-blue-400 font-bold block mb-0.5">1. Future EPS</span>
                EPS<sub>N</sub> = Starting EPS &times; (1 + Growth)<sup>N</sup>
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-emerald-400 font-bold block mb-0.5">2. Predicted Final Price</span>
                Price<sub>N</sub> = EPS<sub>N</sub> &times; Exit P/E Multiple
              </div>
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <span className="text-indigo-400 font-bold block mb-0.5">3. Expected Return (CAGR)</span>
                CAGR = (Price<sub>N</sub> / BuyPrice)<sup>1/N</sup> - 1
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
