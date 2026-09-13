"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Transaction, PortfolioSummary } from "@/lib/types";
import { SAMPLE_VESTED_TRANSACTIONS } from "@/lib/sample-data";
import { StoredPortfolio } from "@/lib/storage";
import { Navbar } from "@/components/Navbar";
import { PdfUploader } from "@/components/PdfUploader";
import { DashboardOverview } from "@/components/DashboardOverview";
import { PerformanceChart } from "@/components/PerformanceChart";
import { BenchmarkComparison } from "@/components/BenchmarkComparison";
import { HoldingsTable } from "@/components/HoldingsTable";
import { AssetAllocation } from "@/components/AssetAllocation";
import { TransactionLedger } from "@/components/TransactionLedger";
import { MetricsDetail } from "@/components/MetricsDetail";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import { DcfCalculator } from "@/components/DcfCalculator";
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
  const [portfolios, setPortfolios] = useState<StoredPortfolio[]>([]);
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolioName, setPortfolioName] = useState<string>("My Portfolio");

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Calculate portfolio summary
  const calculatePortfolio = useCallback(
    async (txList: Transaction[], showLoader = false) => {
      if (!txList || txList.length === 0) {
        setSummary(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (showLoader) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: txList }),
        });

        const data = await res.json();
        if (data.summary) {
          setSummary(data.summary);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (err) {
        console.error("Failed to calculate portfolio:", err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  // Load portfolios on mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        const res = await fetch("/api/portfolios");
        const data = await res.json();
        const storedList: StoredPortfolio[] = data.portfolios || [];

        if (storedList.length > 0) {
          setPortfolios(storedList);
          const defaultPort = storedList.find((p) => p.isDefault) || storedList[0];
          setCurrentPortfolioId(defaultPort.id);
          setPortfolioName(defaultPort.name);
          setTransactions(defaultPort.transactions);
          calculatePortfolio(defaultPort.transactions, true);
        } else {
          // If no stored portfolios, start empty or prompt user
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to load stored portfolios:", err);
        setIsLoading(false);
      }
    }

    loadInitialData();
  }, [calculatePortfolio]);

  // Handle Portfolio Selection
  const handleSelectPortfolio = async (id: string) => {
    const p = portfolios.find((item) => item.id === id);
    if (p) {
      setCurrentPortfolioId(p.id);
      setPortfolioName(p.name);
      setTransactions(p.transactions);
      calculatePortfolio(p.transactions, true);

      // Persist active default in background
      try {
        await fetch("/api/portfolios", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, isDefault: true }),
        });
      } catch (err) {
        console.error("Failed to set default portfolio:", err);
      }
    }
  };

  // Handle Portfolio Rename
  const handleRenamePortfolio = async (id: string, newName: string) => {
    setPortfolios((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: newName } : item))
    );
    if (currentPortfolioId === id) {
      setPortfolioName(newName);
    }

    try {
      await fetch("/api/portfolios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName }),
      });
    } catch (err) {
      console.error("Failed to rename portfolio:", err);
    }
  };

  // Handle Portfolio Deletion
  const handleDeletePortfolio = async (id: string) => {
    const remaining = portfolios.filter((item) => item.id !== id);
    setPortfolios(remaining);

    if (currentPortfolioId === id) {
      if (remaining.length > 0) {
        handleSelectPortfolio(remaining[0].id);
      } else {
        setCurrentPortfolioId("");
        setPortfolioName("My Portfolio");
        setTransactions([]);
        setSummary(null);
      }
    }

    try {
      await fetch(`/api/portfolios?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete portfolio:", err);
    }
  };

  // Handle New Transactions Loaded from Spreadsheet Uploader
  const handleTransactionsLoaded = async (
    newTx: Transaction[],
    name: string
  ) => {
    const newPortId = `port-${Date.now()}`;
    const newPort: StoredPortfolio = {
      id: newPortId,
      name: name || "Imported Portfolio",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions: newTx,
      isDefault: true,
    };

    setPortfolios((prev) => [newPort, ...prev.map((p) => ({ ...p, isDefault: false }))]);
    setCurrentPortfolioId(newPort.id);
    setPortfolioName(newPort.name);
    setTransactions(newTx);
    calculatePortfolio(newTx, true);

    // Save to persistent storage
    try {
      await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPort),
      });
    } catch (err) {
      console.error("Failed to persist new portfolio:", err);
    }
  };

  // Handle Load Demo
  const handleLoadDemo = () => {
    handleTransactionsLoaded(
      SAMPLE_VESTED_TRANSACTIONS,
      "Sample Finvyo US Growth Portfolio"
    );
  };

  // Refresh live prices
  const handleRefreshPrices = () => {
    calculatePortfolio(transactions, false);
  };

  // Save Transaction (Add / Edit)
  const handleSaveTransaction = async (tx: Transaction) => {
    let updatedTxList: Transaction[];
    const exists = transactions.some((t) => t.id === tx.id);
    if (exists) {
      updatedTxList = transactions.map((t) => (t.id === tx.id ? tx : t));
    } else {
      updatedTxList = [tx, ...transactions];
    }

    setTransactions(updatedTxList);
    calculatePortfolio(updatedTxList, false);

    // Update stored portfolio
    if (currentPortfolioId) {
      const p = portfolios.find((item) => item.id === currentPortfolioId);
      if (p) {
        const updatedPort = { ...p, transactions: updatedTxList };
        setPortfolios((prev) =>
          prev.map((item) => (item.id === currentPortfolioId ? updatedPort : item))
        );
        try {
          await fetch("/api/portfolios", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPort),
          });
        } catch (err) {
          console.error("Failed to save updated portfolio:", err);
        }
      }
    }
  };

  // Delete Transaction
  const handleDeleteTransaction = async (id: string) => {
    const updatedTxList = transactions.filter((t) => t.id !== id);
    setTransactions(updatedTxList);
    calculatePortfolio(updatedTxList, false);

    if (currentPortfolioId) {
      const p = portfolios.find((item) => item.id === currentPortfolioId);
      if (p) {
        const updatedPort = { ...p, transactions: updatedTxList };
        setPortfolios((prev) =>
          prev.map((item) => (item.id === currentPortfolioId ? updatedPort : item))
        );
        try {
          await fetch("/api/portfolios", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedPort),
          });
        } catch (err) {
          console.error("Failed to save portfolio after deleting transaction:", err);
        }
      }
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!transactions || transactions.length === 0) return;

    const headers = ["Date", "Symbol", "Type", "Shares", "Price", "Amount", "Notes"];
    const rows = transactions.map((t) => [
      t.date,
      t.symbol,
      t.type,
      t.shares,
      t.price,
      t.amount,
      `"${(t.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${portfolioName.toLowerCase().replace(/[^a-z0-9]/g, "_")}_transactions.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "overview", label: "Performance & Growth", icon: TrendingUp },
    { id: "holdings", label: "Holdings & Live Quotes", icon: Layers },
    { id: "allocation", label: "Asset & Sector Allocation", icon: PieChart },
    { id: "benchmarks", label: "Benchmark Alpha", icon: Globe },
    { id: "ledger", label: "Transaction Ledger", icon: FileText },
    { id: "metrics", label: "TWR & Tax Analytics", icon: Calculator },
    { id: "dcf", label: "DCF Valuation & Forecasts", icon: Scale },
  ];

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col">
      {/* Top Navigation Bar with Portfolio Switcher */}
      <Navbar
        onOpenUpload={() => setIsUploadOpen(true)}
        onLoadDemo={handleLoadDemo}
        onRefreshPrices={handleRefreshPrices}
        onExportCsv={handleExportCsv}
        isRefreshing={isRefreshing}
        lastUpdatedTime={lastUpdated}
        portfolioName={portfolioName}
        hasData={transactions.length > 0}
        portfolios={portfolios}
        currentPortfolioId={currentPortfolioId}
        onSelectPortfolio={handleSelectPortfolio}
        onRenamePortfolio={handleRenamePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 space-y-6">
        {/* Tab Navigation Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-1 overflow-x-auto">
          <div className="flex items-center gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition ${
                    isActive
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
            {lastUpdated && <span>Quotes updated: {lastUpdated}</span>}
          </div>
        </div>

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
                <MetricsDetail summary={summary} />
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
                Upload your Excel (.xlsx), Apple Numbers (.numbers), or CSV export to analyze your portfolio. Or try the DCF Valuation tab above.
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

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#080b12] py-4 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            Finvyo &copy; {new Date().getFullYear()} &middot; Your wealth. In view. &middot; Next.js + Finnhub + Redis
          </p>
          <p className="text-[11px] text-slate-600">
            Real-time market quotes via Finnhub API & Yahoo Finance. All calculations computed locally.
          </p>
        </div>
      </footer>
    </div>
  );
}
