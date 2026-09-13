"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Upload,
  RefreshCw,
  Sparkles,
  Edit2,
  Trash2,
  Check,
  X,
  FolderOpen,
  Download,
  AlertTriangle,
} from "lucide-react";
import { StoredPortfolio } from "@/lib/storage";

interface NavbarProps {
  onOpenUpload: () => void;
  onLoadDemo: () => void;
  onRefreshPrices: () => void;
  onExportCsv: () => void;
  isRefreshing: boolean;
  portfolioName?: string;
  hasData: boolean;
  portfolios: StoredPortfolio[];
  currentPortfolioId: string;
  onRenamePortfolio: (id: string, newName: string) => void;
  onDeletePortfolio: (id: string) => void;
  onOpenPortfolioManager: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenUpload,
  onLoadDemo,
  onRefreshPrices,
  onExportCsv,
  isRefreshing,
  portfolioName = "My Portfolio",
  hasData,
  portfolios,
  currentPortfolioId,
  onRenamePortfolio,
  onDeletePortfolio,
  onOpenPortfolioManager,
}) => {
  const [marketStatus, setMarketStatus] = useState<{
    isOpen: boolean;
    label: string;
  }>({ isOpen: false, label: "Market Closed" });

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(portfolioName);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setRenameValue(portfolioName);
  }, [portfolioName]);

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

  const handleSaveRename = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (renameValue.trim() && currentPortfolioId) {
      onRenamePortfolio(currentPortfolioId, renameValue.trim());
      setIsRenaming(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand & Portfolio Selector */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                Fin<span className="text-blue-400">vyo</span>
              </h1>
              <span className="hidden sm:inline-block rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-300 ring-1 ring-inset ring-blue-500/20">
                Your wealth. In view.
              </span>
            </div>

            {/* Select Portfolio Button & Current Portfolio Actions */}
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={onOpenPortfolioManager}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:border-slate-600 hover:text-white group shadow-sm"
                title="Open Select Portfolio window to view uploaded statements and timestamps"
              >
                <FolderOpen className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-300" />
                <span className="font-semibold">Select Portfolio</span>
                {portfolios.length > 0 && (
                  <span className="rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[10px] font-bold text-blue-300">
                    {portfolios.length}
                  </span>
                )}
              </button>

              {hasData && currentPortfolioId && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-600">/</span>
                  {isRenaming ? (
                    <form onSubmit={handleSaveRename} className="flex items-center gap-1">
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
                        title="Save name"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRenaming(false)}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-800"
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span
                        onClick={onOpenPortfolioManager}
                        className="text-xs text-slate-300 hover:text-white font-medium truncate max-w-[120px] sm:max-w-[180px] cursor-pointer"
                        title={`Active Portfolio: ${portfolioName} (Click to open manager)`}
                      >
                        {portfolioName}
                      </span>
                      <button
                        onClick={() => {
                          setRenameValue(portfolioName);
                          setIsRenaming(true);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
                        title="Rename current portfolio"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      {/* Delete button: ALWAYS enabled when portfolio exists, even if single portfolio! */}
                      <button
                        onClick={() => setIsConfirmDeleteOpen(true)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Delete current portfolio"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
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

      {/* Delete Confirmation Modal Overlay */}
      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/30">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Delete Portfolio
                </h3>
                <p className="text-xs text-slate-400">
                  Are you sure you want to delete “{portfolioName}”?
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 text-xs text-slate-300 space-y-2">
              <p>
                This will permanently remove this portfolio and all of its transactions.
              </p>
              {portfolios.length <= 1 ? (
                <p className="text-amber-300/90 font-medium">
                  Notice: This is your only saved portfolio. Deleting it will clear the dashboard and return you to the upload statement screen so you can upload a fresh file.
                </p>
              ) : (
                <p className="text-slate-400">
                  The dashboard will switch to your next saved portfolio.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmDeleteOpen(false);
                  onDeletePortfolio(currentPortfolioId);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Portfolio</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
