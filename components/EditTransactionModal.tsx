"use client";

import React, { useState, useEffect } from "react";
import { Transaction, TransactionType } from "@/lib/types";
import { X } from "lucide-react";

interface EditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Transaction) => void;
  transactionToEdit?: Transaction | null;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  transactionToEdit,
}) => {
  const [symbol, setSymbol] = useState("AAPL");
  const [type, setType] = useState<TransactionType>("BUY");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [shares, setShares] = useState("1.0");
  const [price, setPrice] = useState("150.00");
  const [amount, setAmount] = useState("-150.00");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (transactionToEdit) {
      setSymbol(transactionToEdit.symbol);
      setType(transactionToEdit.type);
      setDate(transactionToEdit.date);
      setShares(String(transactionToEdit.shares));
      setPrice(String(transactionToEdit.price));
      setAmount(String(transactionToEdit.amount));
      setNotes(transactionToEdit.notes || "");
    } else {
      setSymbol("AAPL");
      setType("BUY");
      setDate(new Date().toISOString().split("T")[0]);
      setShares("1.0");
      setPrice("150.00");
      setAmount("-150.00");
      setNotes("");
    }
  }, [transactionToEdit, isOpen]);

  // Auto-calculate amount when shares or price change for Buy/Sell
  const handleSharesChange = (val: string) => {
    setShares(val);
    const s = parseFloat(val) || 0;
    const p = parseFloat(price) || 0;
    if (type === "BUY") setAmount((-s * p).toFixed(2));
    if (type === "SELL") setAmount((s * p).toFixed(2));
  };

  const handlePriceChange = (val: string) => {
    setPrice(val);
    const s = parseFloat(shares) || 0;
    const p = parseFloat(val) || 0;
    if (type === "BUY") setAmount((-s * p).toFixed(2));
    if (type === "SELL") setAmount((s * p).toFixed(2));
  };

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    const s = parseFloat(shares) || 0;
    const p = parseFloat(price) || 0;
    if (newType === "BUY") {
      setAmount((-s * p).toFixed(2));
      if (symbol === "CASH") setSymbol("AAPL");
    } else if (newType === "SELL") {
      setAmount((s * p).toFixed(2));
      if (symbol === "CASH") setSymbol("AAPL");
    } else if (newType === "DEPOSIT") {
      setSymbol("CASH");
      setShares("0");
      setPrice("1");
      setAmount("1000.00");
    } else if (newType === "WITHDRAWAL") {
      setSymbol("CASH");
      setShares("0");
      setPrice("1");
      setAmount("-1000.00");
    } else if (newType === "DIVIDEND") {
      setPrice("0");
      setAmount("10.00");
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    const newTx: Transaction = {
      id: transactionToEdit?.id || `tx-${Date.now()}`,
      symbol: symbol.trim().toUpperCase(),
      type,
      date,
      shares: parseFloat(shares) || 0,
      price: parseFloat(price) || 0,
      amount: parseFloat(amount) || 0,
      notes,
    };
    onSave(newTx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-white">
            {transactionToEdit ? "Edit Transaction" : "Add Transaction"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            {/* Type */}
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Activity Type
              </label>
              <select
                value={type}
                onChange={(e) =>
                  handleTypeChange(e.target.value as TransactionType)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
                <option value="DIVIDEND">DIVIDEND</option>
                <option value="DEPOSIT">DEPOSIT</option>
                <option value="WITHDRAWAL">WITHDRAWAL</option>
                <option value="FEE">FEE</option>
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Date (YYYY-MM-DD)
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Symbol */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">
              Symbol / Ticker
            </label>
            <input
              type="text"
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. AAPL, NVDA, VOO"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Shares and Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Shares / Quantity
              </label>
              <input
                type="number"
                step="any"
                value={shares}
                onChange={(e) => handleSharesChange(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Price per Share ($)
              </label>
              <input
                type="number"
                step="any"
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Net Cash Flow Amount */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">
              Net Amount (Negative = Outflow, Positive = Inflow)
            </label>
            <input
              type="number"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white font-mono font-bold focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Monthly DCA"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500"
            >
              Save Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
