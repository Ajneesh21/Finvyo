"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Upload,
  RefreshCw,
  Sparkles,
  ChevronDown,
  Edit2,
  Trash2,
  Check,
  X,
  Plus,
  Layers,
  Download,
} from "lucide-react";
import { StoredPortfolio } from "@/lib/storage";

interface NavbarProps {
  onOpenUpload: () => void;
  onLoadDemo: () => void;
  onRefreshPrices: () => void;
  onExportCsv: () => void;
  isRefreshing: boolean;
  lastUpdatedTime?: string;
  portfolioName?: string;
  hasData: boolean;
  portfolios: StoredPortfolio[];
  currentPortfolioId: string;
  onSelectPortfolio: (id: string) => void;
  onRenamePortfolio: (id: string, newName: string) => void;
  onDeletePortfolio: (id: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenUpload,
  onLoadDemo,
  onRefreshPrices,
  onExportCsv,
  isRefreshing,
  lastUpdatedTime,
  portfolioName = "My Portfolio",
  hasData,
  portfolios,
  currentPortfolioId,
  onSelectPortfolio,
  onRenamePortfolio,
  onDeletePortfolio,
}) => {
  const [marketStatus, setMarketStatus] = useState<{
    isOpen: boolean;
    label: string;
  }>({ isOpen: false, label: "Market Closed" });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(portfolioName);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRenameValue(portfolioName);
  }, [portfolioName]);

  // Click outside listener for dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const checkMarket = () => {
      const now = new Date();
      const utcHour = now.getUTCHours();
      const utcMin = now.getUTCMinutes();
      const dayOfWeek = now.getUTCDay();

      const currentUtcMinutes = utcHour * 60 + utcMin;
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const isMarketHours =
        isWeekday && currentUtcMinutes >= 13 * 60 + 30 && currentUtcMinutes < 20 * 60;

      setMarketStatus({
        isOpen: isMarketHours,
        label: isMarketHours ? "US Market Open" : "US Market Closed",
      });
    };

    checkMarket();
    const timer = setInterval(checkMarket, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleSaveRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (renameValue.trim() && currentPortfolioId) {
      onRenamePortfolio(currentPortfolioId, renameValue.trim());
      setIsRenaming(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand & Portfolio Switcher */}
        <div className="flex items-center gap-3" ref={dropdownRef}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                Fin<span className="text-blue-400">vyo</span>
              </h1>
              <span className="hidden sm:inline-block rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-300 ring-1 ring-inset ring-blue-500/20">
                Your wealth. In view.
              </span>
            </div>

            {/* Portfolio Dropdown / Rename */}
            {isRenaming ? (
              <form onSubmit={handleSaveRename} className="flex items-center gap-1 mt-0.5">
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="rounded border border-blue-500 bg-slate-950 px-1.5 py-0.5 text-xs text-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded p-0.5 text-emerald-400 hover:bg-slate-800"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-1 text-xs text-slate-300 hover:text-white font-medium group"
                >
                  <span className="truncate max-w-[150px] sm:max-w-xs">{portfolioName}</span>
                  <ChevronDown className="h-3 w-3 text-slate-500 group-hover:text-slate-300" />
                </button>
                <button
                  onClick={() => {
                    setRenameValue(portfolioName);
                    setIsRenaming(true);
                  }}
                  className="p-0.5 text-slate-500 hover:text-slate-300"
                  title="Rename portfolio"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
                {portfolios.length > 1 && (
                  <button
                    onClick={() => onDeletePortfolio(currentPortfolioId)}
                    className="p-0.5 text-slate-500 hover:text-rose-400"
                    title="Delete portfolio"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Portfolios Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-800 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md z-50 animate-in fade-in duration-150">
                <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Saved Portfolios ({portfolios.length})
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5 my-1">
                  {portfolios.map((p) => {
                    const isSelected = p.id === currentPortfolioId;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                          isSelected
                            ? "bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                        onClick={() => {
                          onSelectPortfolio(p.id);
                          setIsDropdownOpen(false);
                        }}
                      >
                        <div className="truncate mr-2">
                          <p className="truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {p.transactions.length} records
                          </p>
                        </div>
                        {isSelected && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-slate-800 pt-1">
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenUpload();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-blue-400 hover:bg-slate-800 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Import New Statement</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Market Status & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-300 md:flex">
            <span
              className={`h-2 w-2 rounded-full ${
                marketStatus.isOpen
                  ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400"
                  : "bg-slate-500"
              }`}
            />
            <span>{marketStatus.label}</span>
          </div>

          <button
            onClick={onLoadDemo}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
            title="Load sample portfolio for instant testing"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Sample Demo</span>
            <span className="sm:hidden">Demo</span>
          </button>

          {hasData && (
            <button
              onClick={onExportCsv}
              className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
              title="Export transactions to CSV"
            >
              <Download className="h-3.5 w-3.5 text-slate-300" />
              <span>Export CSV</span>
            </button>
          )}

          <button
            onClick={onRefreshPrices}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white disabled:opacity-50"
            title="Fetch latest stock quotes & index prices"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-blue-400 ${
                isRefreshing ? "animate-spin" : ""
              }`}
            />
            <span className="hidden sm:inline">
              {isRefreshing ? "Updating..." : "Refresh Live"}
            </span>
          </button>

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition hover:from-blue-500 hover:to-indigo-500 ring-1 ring-inset ring-white/10"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Statement</span>
          </button>
        </div>
      </div>
    </header>
  );
};
