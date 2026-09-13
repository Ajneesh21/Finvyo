"use client";

import { useState, useEffect, useCallback } from "react";
import { Transaction, PortfolioSummary } from "@/lib/types";
import { StoredPortfolio } from "@/lib/storage";

function sanitizeCsvField(val: unknown): string {
  let str = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function usePortfolio() {
  const [portfolios, setPortfolios] = useState<StoredPortfolio[]>([]);
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolioName, setPortfolioName] = useState<string>("My Portfolio");

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Calculate portfolio summary
  const calculatePortfolio = useCallback(
    async (txList: Transaction[], showLoader = false) => {
      if (!txList || txList.length === 0) {
        setSummary(null);
        setCalculationError(null);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (showLoader) setIsLoading(true);
      else setIsRefreshing(true);
      setCalculationError(null);

      try {
        const res = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: txList }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          const errMsg = data.error || data.details || "Calculation failed";
          console.error("Failed to calculate portfolio:", errMsg);
          setCalculationError(errMsg);
          return;
        }

        if (data.summary) {
          setSummary(data.summary);
          setCalculationError(null);
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Failed to calculate portfolio:", msg);
        setCalculationError(msg);
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
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to load stored portfolios:", err instanceof Error ? err.message : String(err));
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
        console.error("Failed to set default portfolio:", err instanceof Error ? err.message : String(err));
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
      console.error("Failed to rename portfolio:", err instanceof Error ? err.message : String(err));
    }
  };

  // Handle Portfolio Deletion
  const handleDeletePortfolio = async (id: string) => {
    const remaining = portfolios.filter((item) => item.id !== id);
    setPortfolios(remaining);

    if (currentPortfolioId === id) {
      if (remaining.length > 0) {
        await handleSelectPortfolio(remaining[0].id);
      } else {
        setCurrentPortfolioId("");
        setPortfolioName("No Portfolio Loaded");
        setTransactions([]);
        setSummary(null);
      }
    }

    try {
      await fetch(`/api/portfolios?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete portfolio:", err instanceof Error ? err.message : String(err));
    }
  };

  // Handle New Transactions Loaded from Spreadsheet Uploader
  const handleTransactionsLoaded = async (
    newTx: Transaction[],
    name: string,
    sourceFileName?: string
  ) => {
    const newPortId = `port-${Date.now()}`;
    const newPort: StoredPortfolio = {
      id: newPortId,
      name: name || "Imported Portfolio",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions: newTx,
      sourceFileName: sourceFileName || name,
      isDefault: true,
    };

    setPortfolios((prev) => [newPort, ...prev.map((p) => ({ ...p, isDefault: false }))]);
    setCurrentPortfolioId(newPort.id);
    setTransactions(newTx);

    // 1. Await persistent save to disk first to prevent async state loss or race conditions
    try {
      const saveRes = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPort),
      });
      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        console.error("Failed to persist new portfolio:", errData.error || saveRes.statusText);
      }
    } catch (err) {
      console.error("Failed to persist new portfolio:", err instanceof Error ? err.message : String(err));
    }

    // 2. Trigger portfolio calculation after persistence is confirmed
    calculatePortfolio(newTx, true);
  };

  // Handle Load Demo with Lazy Dynamic Import
  const handleLoadDemo = async () => {
    try {
      const { SAMPLE_VESTED_TRANSACTIONS } = await import("@/lib/sample-data");
      await handleTransactionsLoaded(
        SAMPLE_VESTED_TRANSACTIONS,
        "Sample Finvyo US Growth Portfolio"
      );
    } catch (err) {
      console.error("Failed to load demo data:", err instanceof Error ? err.message : String(err));
    }
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
          console.error("Failed to save updated portfolio:", err instanceof Error ? err.message : String(err));
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
          console.error("Failed to save portfolio after deleting transaction:", err instanceof Error ? err.message : String(err));
        }
      }
    }
  };

  // Export CSV with formula injection sanitization
  const handleExportCsv = () => {
    if (!transactions || transactions.length === 0) return;

    const headers = ["Date", "Symbol", "Type", "Shares", "Price", "Amount", "Notes"];
    const rows = transactions.map((t) => [
      sanitizeCsvField(t.date),
      sanitizeCsvField(t.symbol),
      sanitizeCsvField(t.type),
      sanitizeCsvField(t.shares),
      sanitizeCsvField(t.price),
      sanitizeCsvField(t.amount),
      sanitizeCsvField(t.notes || ""),
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

  return {
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
  };
}
