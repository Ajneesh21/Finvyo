"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  X,
  Eye,
  Loader2,
  Calendar,
  Layers,
  ArrowRight,
  Clipboard,
} from "lucide-react";
import { Transaction, ParsedPdfResult } from "@/lib/types";
import { SAMPLE_VESTED_TRANSACTIONS } from "@/lib/sample-data";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PdfUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onTransactionsLoaded: (transactions: Transaction[], portfolioName: string) => void;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({
  isOpen,
  onClose,
  onTransactionsLoaded,
}) => {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedPdfResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [showRawText, setShowRawText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    setFileName(file.name);
    setIsUploading(true);
    setUploadError(null);
    setParsedResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to parse spreadsheet file");
      }

      setParsedResult(data);
    } catch (err: any) {
      console.error("Spreadsheet parsing error:", err);
      setUploadError(err.message || "Failed to read or parse this spreadsheet file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleParsePastedText = async () => {
    if (!pastedText.trim()) {
      setUploadError("Please paste some statement text first.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setParsedResult(null);
    setFileName("Pasted Statement Activity");

    try {
      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to parse pasted text");
      }

      setParsedResult(data);
    } catch (err: any) {
      console.error("Pasted text parsing error:", err);
      setUploadError(err.message || "Failed to parse pasted statement text.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleConfirmTransactions = () => {
    if (!parsedResult || parsedResult.transactions.length === 0) return;

    let portName = fileName.replace(/\.[^/.]+$/, "");
    if (!portName || portName === "Pasted Statement Activity") {
      portName = parsedResult.accountInfo?.investorName
        ? `${parsedResult.accountInfo.investorName}'s Portfolio`
        : "Imported Portfolio";
    }

    onTransactionsLoaded(parsedResult.transactions, portName);
    onClose();
  };

  const handleLoadSample = () => {
    onTransactionsLoaded(
      SAMPLE_VESTED_TRANSACTIONS,
      "Sample Finvyo US Growth Portfolio"
    );
    onClose();
  };

  const handleLoadSnippetExample = () => {
    setPastedText(`Date Time (in UTC) Type Amount (in USD) Account Balance (in USD) Comment
2026-08-24 02:37:21 PM SPUR 509.8 30.61 Meta Platforms Inc Market Buy
2026-08-21 02:02:40 PM SPUR 551.26 540.41 Meta Platforms Inc Market Buy
2026-08-21 01:59:52 PM CSR 1000 1091.67 Deposit
2026-08-19 01:32:40 PM SSAL 42.86 91.67 LUCAS GC LIMITED Market Sell
2026-08-18 05:39:28 PM SSAL 6.27 48.81 C3IS INC Market Sell`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Import Spreadsheet Statement
              </h2>
              <p className="text-xs text-slate-400">
                Upload your Excel (.xlsx, .xls), Apple Numbers (.numbers), or CSV export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Toggle (Upload File vs Paste Text) */}
        {!parsedResult && (
          <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
            <button
              onClick={() => setActiveTab("file")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === "file"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Excel / Numbers / CSV</span>
            </button>
            <button
              onClick={() => setActiveTab("paste")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === "paste"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              <Clipboard className="h-3.5 w-3.5" />
              <span>Paste Text Activity</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* File Upload Mode */}
          {!parsedResult && activeTab === "file" && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
                isDragging
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/70"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.numbers,.csv,.txt"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
                  <p className="text-sm font-medium text-slate-200">
                    Parsing Spreadsheet Sheets...
                  </p>
                  <p className="text-xs text-slate-400">
                    Extracting Trades, Transfers, Income, and Ledger Balances
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                    <FileSpreadsheet className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-white">
                    Click to browse or drag & drop Excel / Numbers file
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Supports Excel (.xlsx, .xls), Apple Numbers (.numbers), and CSV exports
                  </p>
                </>
              )}
            </div>
          )}

          {/* Paste Text Mode */}
          {!parsedResult && activeTab === "paste" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Paste your statement table or transaction log:</span>
                <button
                  onClick={handleLoadSnippetExample}
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  Insert Sample Snippet
                </button>
              </div>

              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Date Time (in UTC) Type Amount (in USD) Account Balance (in USD) Comment&#10;2026-08-24 02:37:21 PM SPUR 509.8 30.61 Meta Platforms Inc Market Buy&#10;2026-08-21 02:02:40 PM SPUR 551.26 540.41 Meta Platforms Inc Market Buy&#10;2026-08-21 01:59:52 PM CSR 1000 1091.67 Deposit..."
                rows={7}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
              />

              <button
                onClick={handleParsePastedText}
                disabled={isUploading || !pastedText.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span>Parse Statement Text</span>
              </button>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to parse file</p>
                <p className="mt-0.5 text-slate-300">{uploadError}</p>
              </div>
            </div>
          )}

          {/* Parsed Result Preview */}
          {parsedResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Successfully parsed {parsedResult.transactions.length} transactions
                    </h3>
                    <p className="text-xs text-slate-300">
                      {fileName}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setParsedResult(null);
                    setFileName("");
                  }}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Choose another file
                </button>
              </div>

              {/* Transactions Preview Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">
                    Preview of Extracted Transactions:
                  </span>
                  <span>Total: {parsedResult.transactions.length} rows</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-xs">
                  {parsedResult.transactions.slice(0, 10).map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between rounded-lg bg-slate-900/80 px-3 py-1.5 border border-slate-800/60 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{formatDate(tx.date, "yyyy-MM-dd")}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            tx.type === "BUY"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : tx.type === "SELL"
                              ? "bg-rose-500/20 text-rose-400"
                              : tx.type === "DEPOSIT"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-purple-500/20 text-purple-400"
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span className="font-bold text-white">{tx.symbol}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        {tx.shares > 0 && (
                          <span className="text-slate-400">
                            {tx.shares} shs @ ${tx.price.toFixed(2)}
                          </span>
                        )}
                        <span
                          className={`font-semibold ${
                            tx.amount >= 0 ? "text-emerald-400" : "text-slate-300"
                          }`}
                        >
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {parsedResult.transactions.length > 10 && (
                    <p className="text-center text-[10px] text-slate-500 pt-1">
                      + {parsedResult.transactions.length - 10} more transactions...
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/70 px-6 py-4">
          {!parsedResult ? (
            <>
              <button
                onClick={handleLoadSample}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Load Sample Data</span>
              </button>

              <button
                onClick={onClose}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setParsedResult(null)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Back to Upload
              </button>

              <button
                onClick={handleConfirmTransactions}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition"
              >
                <span>Calculate & Load Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
