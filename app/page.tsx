"use client";

import React, { useState } from "react";
import { Transaction } from "@/lib/types";
import { usePortfolio } from "@/lib/usePortfolio";
import { Navbar } from "@/components/Navbar";
import { PdfUploader } from "@/components/PdfUploader";
import { DashboardOverview } from "@/components/DashboardOverview";
import { BenchmarkComparison } from "@/components/BenchmarkComparison";
import { HoldingsTable } from "@/components/HoldingsTable";
import { TransactionLedger } from "@/components/TransactionLedger";
import { MetricsDetail } from "@/components/MetricsDetail";
import dynamic from "next/dynamic";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { PortfolioManagerModal } from "@/components/PortfolioManagerModal";

const PerformanceChart = dynamic(
  () => import("@/components/PerformanceChart").then((m) => m.PerformanceChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 sm:h-80 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
      </div>
    ),
  }
);

const AssetAllocation = dynamic(
  () => import("@/components/AssetAllocation").then((m) => m.AssetAllocation),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 sm:h-80 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
      </div>
    ),
  }
);

const DcfCalculator = dynamic(
  () => import("@/components/DcfCalculator").then((m) => m.DcfCalculator),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
      </div>
    ),
  }
);
import {
  TrendingUp,
  Globe,
  Layers,
  PieChart,
  FileText,
  Calculator,
  Loader2,
  UploadCloud,
  Scale,
} from "lucide-react";

type TabId =
  | "overview"
  | "holdings"
  | "allocation"
  | "benchmarks"
  | "ledger"
  | "metrics"
  | "dcf";

export default function Home() {
  const {
    portfolios,
    currentPortfolioId,
    portfolioName,
    transactions,
    summary,
    calculationError,
    isLoading,
    isRefreshing,
    lastUpdated,
    handleSelectPortfolio,
    handleRenamePortfolio,
    handleDeletePortfolio,
    handleTransactionsLoaded,
    handleLoadDemo,
    handleRefreshPrices,
    handleSaveTransaction,
    handleDeleteTransaction,
    handleExportCsv,
  } = usePortfolio();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isPortfolioManagerOpen, setIsPortfolioManagerOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const tabs: {
    id: TabId;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "overview", label: "Performance & Growth", shortLabel: "Overview", icon: TrendingUp },
    { id: "holdings", label: "Holdings & Live Quotes", shortLabel: "Holdings", icon: Layers },
    { id: "allocation", label: "Asset & Sector Allocation", shortLabel: "Allocation", icon: PieChart },
    { id: "benchmarks", label: "Benchmark Alpha", shortLabel: "Benchmarks", icon: Globe },
    { id: "ledger", label: "Transaction Ledger", shortLabel: "Ledger", icon: FileText },
    { id: "metrics", label: "TWR & Tax Analytics", shortLabel: "Analytics", icon: Calculator },
    { id: "dcf", label: "DCF Valuation & Forecasts", shortLabel: "DCF", icon: Scale },
  ];

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#0b0f19] text-slate-100 flex flex-col">
      {/* Top Navigation Bar with Portfolio Switcher & Mobile Drawer */}
      <Navbar
        onOpenUpload={() => setIsUploadOpen(true)}
        onLoadDemo={handleLoadDemo}
        onRefreshPrices={handleRefreshPrices}
        onExportCsv={handleExportCsv}
        isRefreshing={isRefreshing}
        portfolioName={portfolioName}
        hasData={transactions.length > 0}
        portfolios={portfolios}
        currentPortfolioId={currentPortfolioId}
        onRenamePortfolio={handleRenamePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
        onOpenPortfolioManager={() => setIsPortfolioManagerOpen(true)}
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* Main Content Area: Expansive width utilizing Mac, iPad, and desktop screens */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-2.5 sm:px-6 lg:px-8 2xl:px-12 py-2.5 sm:py-6 space-y-3.5 sm:space-y-6">
        {/* Desktop Tab Navigation Bar (hidden on mobile, mobile uses hamburger drawer) */}
        <div className="hidden sm:flex items-center justify-between border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar touch-pan-x">
          <div className="flex items-center gap-1.5 sm:gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition flex-shrink-0 ${
                    isActive
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
            {lastUpdated && <span>Quotes updated: {lastUpdated}</span>}
          </div>
        </div>

        {/* Calculation Error Notice */}
        {calculationError && (
          <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-xs text-rose-300 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-rose-200">Calculation Error:</span>
              <span>{calculationError}</span>
            </div>
            <button
              onClick={handleRefreshPrices}
              className="rounded-lg bg-rose-600/30 hover:bg-rose-600/50 px-3 py-1 text-xs font-semibold text-rose-200 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Tab 7: Dedicated DCF Valuation Calculator (available anytime) */}
        {activeTab === "dcf" ? (
          <DcfCalculator
            defaultTicker={
              summary?.holdings && summary.holdings.length > 0
                ? summary.holdings[0].symbol
                : "AAPL"
            }
            portfolioHoldings={
              summary?.holdings?.map((h) => ({
                symbol: h.symbol,
                companyName: h.companyName,
              })) || []
            }
          />
        ) : isLoading ? (
          <div className="flex h-96 flex-col items-center justify-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
            <p className="text-sm font-medium text-slate-300">
              Calculating Time-Weighted Returns & Live Market Prices...
            </p>
            <p className="text-xs text-slate-500">
              Benchmarking against S&P 500, Nasdaq 100 & Nifty 50
            </p>
          </div>
        ) : summary && transactions.length > 0 ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top KPI Cards */}
            <DashboardOverview summary={summary} />

            {/* Tab 1: Performance & Growth Chart */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <PerformanceChart timeline={summary.timeline} />
              </div>
            )}

            {/* Tab 2: Holdings & Live Quotes Table */}
            {activeTab === "holdings" && (
              <div className="space-y-6">
                <HoldingsTable
                  holdings={summary.holdings}
                  totalValue={summary.totalValue}
                />
              </div>
            )}

            {/* Tab 3: Asset & Sector Allocation */}
            {activeTab === "allocation" && (
              <div className="space-y-6">
                <AssetAllocation
                  holdings={summary.holdings}
                  cashBalance={summary.cashBalance}
                  totalValue={summary.totalValue}
                  layout="grid"
                />
              </div>
            )}

            {/* Tab 4: Global Benchmarks Comparison */}
            {activeTab === "benchmarks" && (
              <div className="space-y-6">
                <BenchmarkComparison summary={summary} />
              </div>
            )}

            {/* Tab 5: Transactions Ledger */}
            {activeTab === "ledger" && (
              <div className="space-y-6">
                <TransactionLedger
                  portfolioId={currentPortfolioId}
                  transactions={transactions}
                  onAddTransaction={() => {
                    setSelectedTx(null);
                    setIsEditModalOpen(true);
                  }}
                  onEditTransaction={(tx) => {
                    setSelectedTx(tx);
                    setIsEditModalOpen(true);
                  }}
                  onDeleteTransaction={handleDeleteTransaction}
                  onExportCsv={handleExportCsv}
                />
              </div>
            )}

            {/* Tab 6: TWR & Tax Analytics */}
            {activeTab === "metrics" && (
              <div className="space-y-6">
                <MetricsDetail
                  summary={summary}
                  portfolioId={currentPortfolioId}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-96 flex-col items-center justify-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
            <UploadCloud className="h-12 w-12 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white">
                No Spreadsheet Statement Loaded
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Upload your Vested Excel (.xlsx) statement to analyze your portfolio. Or try the DCF Valuation tab above.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsUploadOpen(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-500"
              >
                Upload Spreadsheet
              </button>
              <button
                onClick={handleLoadDemo}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                Load Sample Data
              </button>
              <button
                onClick={() => setActiveTab("dcf")}
                className="rounded-lg border border-blue-500/50 bg-blue-600/20 px-4 py-2 text-xs font-medium text-blue-300 hover:bg-blue-600/30"
              >
                Open DCF Valuation
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Spreadsheet Upload Modal */}
      <PdfUploader
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onTransactionsLoaded={handleTransactionsLoaded}
      />

      {/* Edit / Add Transaction Modal */}
      <EditTransactionModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveTransaction}
        transactionToEdit={selectedTx}
      />

      {/* Portfolio Manager Window Modal */}
      <PortfolioManagerModal
        isOpen={isPortfolioManagerOpen}
        onClose={() => setIsPortfolioManagerOpen(false)}
        portfolios={portfolios}
        currentPortfolioId={currentPortfolioId}
        onSelectPortfolio={handleSelectPortfolio}
        onRenamePortfolio={handleRenamePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
        onOpenUpload={() => setIsUploadOpen(true)}
        onLoadDemo={handleLoadDemo}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#080b12] py-4 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-[1720px] px-4 sm:px-6 lg:px-8 2xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            Finvyo &copy; {new Date().getFullYear()} &middot; Your wealth. In view. &middot; Next.js + Redis
          </p>
          <p className="text-[11px] text-slate-600">
            Real-time market quotes via Yahoo Finance. All calculations computed locally.
          </p>
        </div>
      </footer>
    </div>
  );
}
