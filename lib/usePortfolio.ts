"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Transaction, PortfolioSummary } from "@/lib/types";
import { StoredPortfolio } from "@/lib/storage";

function sanitizeCsvField(val: unknown): string {
  let str = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function syncLocalBackup(ports: StoredPortfolio[]): void {
  if (typeof window !== "undefined") {
    try {
      // Clean up legacy unencrypted persistent storage
      localStorage.removeItem("finvyo_portfolios_backup");
      // Keep only in ephemeral sessionStorage (wiped automatically on browser close)
      sessionStorage.setItem("finvyo_portfolios_session", JSON.stringify(ports));
    } catch {
      // Ignore quota errors
    }
  }
}

function getLocalFallback(): StoredPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const sessionData = sessionStorage.getItem("finvyo_portfolios_session");
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    // One-time security migration: scrub persistent localStorage and move to session
    const legacy = localStorage.getItem("finvyo_portfolios_backup");
    if (legacy) {
      localStorage.removeItem("finvyo_portfolios_backup");
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.length > 0) {
        sessionStorage.setItem("finvyo_portfolios_session", legacy);
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function usePortfolio() {
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    username: string;
    email: string;
  } | null>(null);
  const [portfolios, setPortfolios] = useState<StoredPortfolio[]>([]);
  const [currentPortfolioId, setCurrentPortfolioId] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [portfolioName, setPortfolioName] = useState<string>("My Portfolio");

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const currentPortfolioIdRef = useRef<string>(currentPortfolioId);
  currentPortfolioIdRef.current = currentPortfolioId;

  const hasMountedRef = useRef<boolean>(false);

  // Calculate portfolio summary
  const calculatePortfolio = useCallback(
    async (txList: Transaction[], showLoader = false, portId?: string) => {
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
        const pId = portId || currentPortfolioIdRef.current;
        const res = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: txList, portfolioId: pId }),
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

  // Load portfolios on mount (strictly once)
  useEffect(() => {
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;

    async function loadInitialData() {
      try {
        // Fetch current authenticated user
        fetch("/api/auth")
          .then((r) => r.json())
          .then((data) => {
            if (data.authenticated && data.user) {
              setCurrentUser(data.user);
            }
          })
          .catch(() => {});

        const res = await fetch("/api/portfolios");
        let storedList: StoredPortfolio[] = [];

        if (res.ok) {
          const data = await res.json();
          storedList = data.portfolios || [];
        }

        // Resilient fallback: If server returned empty, check browser ephemeral session backup
        if (storedList.length === 0) {
          storedList = getLocalFallback();
          if (storedList.length > 0) {
            // Re-sync backup to server in background
            for (const port of storedList) {
              fetch("/api/portfolios", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(port),
              }).catch(() => {});
            }
          }
        }

        if (storedList.length > 0) {
          syncLocalBackup(storedList);
          setPortfolios(storedList);
          const defaultPort = storedList.find((p) => p.isDefault) || storedList[0];
          setCurrentPortfolioId(defaultPort.id);
          setPortfolioName(defaultPort.name);
          setTransactions(defaultPort.transactions);

          // If the stored portfolio already has a precomputed summary, render it IMMEDIATELY (0ms wait)!
          if (defaultPort.lastComputedSummary) {
            setSummary(defaultPort.lastComputedSummary);
            setIsLoading(false);
            if (defaultPort.lastCalculatedAt) {
              setLastUpdated(new Date(defaultPort.lastCalculatedAt).toLocaleTimeString());
            }
            // Revalidate quotes quietly in the background without a blocking screen spinner
            calculatePortfolio(defaultPort.transactions, false, defaultPort.id);
          } else {
            calculatePortfolio(defaultPort.transactions, true, defaultPort.id);
          }
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to load stored portfolios:", err instanceof Error ? err.message : String(err));
        // Also try session fallback if fetch itself failed (e.g. transient network glitch)
        const sessionFallback = getLocalFallback();
        if (sessionFallback.length > 0) {
          const defaultPort = sessionFallback.find((p: StoredPortfolio) => p.isDefault) || sessionFallback[0];
          setPortfolios(sessionFallback);
          setCurrentPortfolioId(defaultPort.id);
          setPortfolioName(defaultPort.name);
          setTransactions(defaultPort.transactions);
          if (defaultPort.lastComputedSummary) {
            setSummary(defaultPort.lastComputedSummary);
          }
        }
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

      if (p.lastComputedSummary) {
        setSummary(p.lastComputedSummary);
        setIsLoading(false);
        calculatePortfolio(p.transactions, false, p.id);
      } else {
        calculatePortfolio(p.transactions, true, p.id);
      }

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
    setPortfolios((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, name: newName } : item));
      syncLocalBackup(updated);
      return updated;
    });
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
    syncLocalBackup(remaining);
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

    setPortfolios((prev) => {
      const updated = [newPort, ...prev.map((p) => ({ ...p, isDefault: false }))];
      syncLocalBackup(updated);
      return updated;
    });
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

    // 2. Trigger portfolio calculation with explicit portfolio ID
    calculatePortfolio(newTx, true, newPort.id);
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
    calculatePortfolio(transactions, false, currentPortfolioId);
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
    calculatePortfolio(updatedTxList, false, currentPortfolioId);

    // Update stored portfolio
    if (currentPortfolioId) {
      const p = portfolios.find((item) => item.id === currentPortfolioId);
      if (p) {
        const updatedPort = { ...p, transactions: updatedTxList };
        setPortfolios((prev) => {
          const updated = prev.map((item) => (item.id === currentPortfolioId ? updatedPort : item));
          syncLocalBackup(updated);
          return updated;
        });
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
    calculatePortfolio(updatedTxList, false, currentPortfolioId);

    if (currentPortfolioId) {
      const p = portfolios.find((item) => item.id === currentPortfolioId);
      if (p) {
        const updatedPort = { ...p, transactions: updatedTxList };
        setPortfolios((prev) => {
          const updated = prev.map((item) => (item.id === currentPortfolioId ? updatedPort : item));
          syncLocalBackup(updated);
          return updated;
        });
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
    currentUser,
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
