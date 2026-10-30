"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  Menu,
} from "lucide-react";
import { StoredPortfolio } from "@/lib/storage";

export type TabId =
  | "overview"
  | "holdings"
  | "allocation"
  | "benchmarks"
  | "ledger"
  | "metrics"
  | "dcf";

export interface NavTabItem {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

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
  tabs?: NavTabItem[];
  activeTab?: TabId;
  onSelectTab?: (tab: TabId) => void;
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
  tabs,
  activeTab = "overview",
  onSelectTab,
}) => {
  const [mounted, setMounted] = useState(false);
  const [marketStatus, setMarketStatus] = useState<{
    isOpen: boolean;
    label: string;
  }>({ isOpen: false, label: "Market Closed" });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(portfolioName);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleSaveRename = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (renameValue.trim() && currentPortfolioId) {
      onRenamePortfolio(currentPortfolioId, renameValue.trim());
      setIsRenaming(false);
    }
  };

  const currentTabObj = tabs?.find((t) => t.id === activeTab);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur-md pt-[env(safe-area-inset-top,0px)]">
      {/* 1. Mobile Top Navigation Bar (< sm): Clean, spacious, and uncluttered */}
      <div className="flex sm:hidden items-center justify-between px-3 py-2.5">
        {/* Left: Hamburger Button + Brand with Active View Subtitle */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition flex-shrink-0"
            aria-label="Open Navigation Menu"
            title="Open views and actions menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-2 cursor-pointer active:opacity-80 transition select-none"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-sm shadow-blue-500/20 ring-1 ring-blue-400/30 flex-shrink-0">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white leading-tight">
                Fin<span className="text-blue-400">vyo</span>
              </span>
              <span className="text-[10px] font-semibold text-blue-400 leading-tight">
                {currentTabObj ? currentTabObj.shortLabel : "Overview"} ▾
              </span>
            </div>
          </div>
        </div>

        {/* Right: Portfolio Pill + Refresh + Upload */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onOpenPortfolioManager}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition max-w-[125px] shadow-sm"
            title={`Active Portfolio: ${portfolioName} (Tap to switch or manage)`}
          >
            <FolderOpen className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
            <span className="truncate">{portfolioName}</span>
          </button>

          <button
            onClick={onRefreshPrices}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/80 text-blue-400 hover:text-white active:scale-95 transition disabled:opacity-50"
            title="Refresh Live Stock Quotes"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={onOpenUpload}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20 active:scale-95 transition ring-1 ring-inset ring-white/10"
            title="Upload Statement (.xlsx / .csv)"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Desktop Navigation Bar (>= sm): Expansive full-width layout for Mac & Desktop */}
      <div className="hidden sm:flex mx-auto max-w-[1720px] items-center justify-between px-4 sm:px-6 lg:px-8 2xl:px-12 py-2.5 sm:py-3">
        {/* Brand & Portfolio Selector */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30 flex-shrink-0">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>

          <div className="min-w-0">
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
                className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:border-slate-600 hover:text-white group shadow-sm flex-shrink-0"
                title="Open Select Portfolio window to view uploaded statements and timestamps"
              >
                <FolderOpen className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-300 flex-shrink-0" />
                <span>Select Portfolio</span>
                {portfolios.length > 0 && (
                  <span className="rounded-full bg-blue-500/20 px-1.5 py-0.2 text-[10px] font-bold text-blue-300">
                    {portfolios.length}
                  </span>
                )}
              </button>

              {hasData && currentPortfolioId && (
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-slate-600">/</span>
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      onClick={onOpenPortfolioManager}
                      className="text-xs text-slate-300 hover:text-white font-medium truncate max-w-[180px] cursor-pointer"
                      title={`Active Portfolio: ${portfolioName} (Click to open manager)`}
                    >
                      {portfolioName}
                    </span>
                    <button
                      onClick={() => {
                        setRenameValue(portfolioName);
                        setIsRenaming(true);
                      }}
                      className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition flex-shrink-0"
                      title="Rename current portfolio"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setIsConfirmDeleteOpen(true)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition flex-shrink-0"
                      title="Delete current portfolio"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Market Status & Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
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
            <span>Sample Demo</span>
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
            <span>{isRefreshing ? "Updating..." : "Refresh Live"}</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 transition hover:from-blue-500 hover:to-indigo-500 ring-1 ring-inset ring-white/10 flex-shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Statement</span>
          </button>
        </div>
      </div>

      {/* 3. Mobile Slide-Over Drawer Navigation: Portaled to document.body to bypass header backdrop-filter bug */}
      {mounted &&
        isDrawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex sm:hidden">
            {/* Backdrop overlay (full window) */}
            <div
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            />

            {/* Slide-out drawer panel (full height) */}
            <div className="relative z-10 flex h-full max-h-[100dvh] w-[82vw] max-w-xs flex-col border-r border-slate-800 bg-[#0b0f19] shadow-2xl animate-in slide-in-from-left duration-250 ease-out pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-sm shadow-blue-500/20 ring-1 ring-blue-400/30">
                    <TrendingUp className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">Finvyo</h2>
                    <p className="text-[11px] text-slate-400">Your wealth. In view.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Drawer Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Active Portfolio Card */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Active Portfolio</span>
                    {portfolios.length > 0 && (
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                        {portfolios.length} stored
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-white truncate">{portfolioName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-800/80">
                    <button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        onOpenPortfolioManager();
                      }}
                      className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 py-1.5 text-center text-xs font-semibold text-slate-200 transition"
                    >
                      Switch Portfolio
                    </button>
                    {hasData && currentPortfolioId && (
                      <>
                        <button
                          onClick={() => {
                            setIsDrawerOpen(false);
                            setRenameValue(portfolioName);
                            setIsRenaming(true);
                          }}
                          className="rounded-lg bg-slate-800 hover:bg-slate-700 p-1.5 text-slate-400 hover:text-white transition"
                          title="Rename active portfolio"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setIsDrawerOpen(false);
                            setIsConfirmDeleteOpen(true);
                          }}
                          className="rounded-lg bg-slate-800 hover:bg-rose-500/20 p-1.5 text-slate-400 hover:text-rose-400 transition"
                          title="Delete active portfolio"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Navigation Tabs (Overview, Holdings, etc.) */}
                <div className="space-y-1.5">
                  <span className="px-1 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Dashboard Views
                  </span>
                  <div className="space-y-1">
                    {tabs?.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            onSelectTab?.(tab.id);
                            setIsDrawerOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                            isActive
                              ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm"
                              : "text-slate-300 hover:bg-slate-900 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`h-4 w-4 ${isActive ? "text-blue-400" : "text-slate-400"}`} />
                            <span>{tab.label}</span>
                          </div>
                          {isActive && (
                            <span className="h-2 w-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Actions in Drawer */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  <span className="px-1 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Actions
                  </span>
                  <div className="space-y-1.5">
                    <button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        onOpenUpload();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 active:opacity-90 transition"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Upload Statement (.xlsx / .csv)</span>
                    </button>

                    <button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        onRefreshPrices();
                      }}
                      disabled={isRefreshing}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <RefreshCw className={`h-4 w-4 text-blue-400 ${isRefreshing ? "animate-spin" : ""}`} />
                        <span>{isRefreshing ? "Updating Live Quotes..." : "Refresh Live Quotes"}</span>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setIsDrawerOpen(false);
                        onLoadDemo();
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-900 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        <span>Load Sample Demo Portfolio</span>
                      </div>
                    </button>

                    {hasData && (
                      <button
                        onClick={() => {
                          setIsDrawerOpen(false);
                          onExportCsv();
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-900 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <Download className="h-4 w-4 text-slate-400" />
                          <span>Export Transactions to CSV</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Drawer Footer: Market Hours Status */}
              <div className="border-t border-slate-800 px-4 py-3 bg-slate-950/80">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      marketStatus.isOpen
                        ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400"
                        : "bg-slate-500"
                    }`}
                  />
                  <span>{marketStatus.label}</span>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 4. Rename Portfolio Modal Dialog */}
      {mounted &&
        isRenaming &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-2xl border border-blue-500/30 bg-slate-950 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit2 className="h-4 w-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">Rename Portfolio</h3>
                </div>
                <button
                  onClick={() => setIsRenaming(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveRename} className="space-y-4">
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  placeholder="Enter portfolio name..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRenaming(false)}
                    className="rounded-lg px-3.5 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 shadow-md shadow-blue-600/30"
                  >
                    Save Name
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 5. Delete Confirmation Modal Overlay */}
      {mounted &&
        isConfirmDeleteOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md animate-in fade-in duration-150">
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
          </div>,
          document.body
        )}
    </header>
  );
};
