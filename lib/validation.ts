import { Transaction, TransactionType } from "./types";

const VALID_TRANSACTION_TYPES: Set<TransactionType> = new Set([
  "BUY",
  "SELL",
  "DIVIDEND",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
  "TAX",
  "STOCK_SPLIT",
]);

function isValidDateString(val: unknown): boolean {
  if (typeof val !== "string" || !val.trim()) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateTransaction(tx: unknown, index: number): ValidationResult {
  if (!tx || typeof tx !== "object") {
    return { valid: false, error: `Transaction at index ${index} must be an object` };
  }

  const t = tx as Record<string, unknown>;

  if (!isValidDateString(t.date)) {
    return {
      valid: false,
      error: `Transaction at index ${index} has invalid date '${String(t.date)}'`,
    };
  }

  if (typeof t.symbol !== "string" || !t.symbol.trim()) {
    return {
      valid: false,
      error: `Transaction at index ${index} has missing or empty symbol`,
    };
  }

  if (typeof t.type !== "string" || !VALID_TRANSACTION_TYPES.has(t.type as TransactionType)) {
    return {
      valid: false,
      error: `Transaction at index ${index} has unknown type '${String(t.type)}'`,
    };
  }

  if (typeof t.shares !== "number" || isNaN(t.shares) || !isFinite(t.shares) || t.shares < 0) {
    return {
      valid: false,
      error: `Transaction at index ${index} has invalid shares quantity '${String(t.shares)}'`,
    };
  }

  if (typeof t.price !== "number" || isNaN(t.price) || !isFinite(t.price) || t.price < 0) {
    return {
      valid: false,
      error: `Transaction at index ${index} has invalid price '${String(t.price)}'`,
    };
  }

  if (typeof t.amount !== "number" || isNaN(t.amount) || !isFinite(t.amount)) {
    return {
      valid: false,
      error: `Transaction at index ${index} has invalid amount '${String(t.amount)}'`,
    };
  }

  return { valid: true };
}

export function validateTransactionsList(
  transactions: unknown,
  maxAllowed = 5000
): { valid: boolean; error?: string; validatedList?: Transaction[] } {
  if (!Array.isArray(transactions)) {
    return { valid: false, error: "Payload must contain an array of transactions" };
  }

  if (transactions.length === 0) {
    return { valid: false, error: "Transactions list cannot be empty" };
  }

  if (transactions.length > maxAllowed) {
    return {
      valid: false,
      error: `Payload too large. Maximum ${maxAllowed.toLocaleString()} transactions allowed per calculation.`,
    };
  }

  for (let i = 0; i < transactions.length; i++) {
    const res = validateTransaction(transactions[i], i);
    if (!res.valid) {
      return { valid: false, error: res.error };
    }
  }

  return { valid: true, validatedList: transactions as Transaction[] };
}
