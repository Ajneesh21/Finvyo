import fs from "fs";
import path from "path";
import { HistoricalPricePoint } from "./stock-api";

export interface HistoricalPriceRecord {
  symbol: string;
  isAdjusted: boolean;
  lastFetchedDate: string; // YYYY-MM-DD
  points: Record<string, number>; // date "YYYY-MM-DD" -> close price
}

export type HistoricalPriceStoreData = Record<string, HistoricalPriceRecord>;

const DATA_DIR = path.join(process.cwd(), "data");
const HISTORICAL_FILE = path.join(DATA_DIR, "historical-prices.json");

// In-process lock to serialize concurrent read-modify-write operations
let lockPromise: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const currentLock = lockPromise;
  lockPromise = currentLock.then(() => nextLock);

  return currentLock.then(async () => {
    try {
      return await fn();
    } finally {
      release!();
    }
  });
}

function safeWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error(`[HistoricalStore] Failed to ensure directory ${dir}:`, err);
  }

  // Attempt atomic write first
  try {
    const tempPath = path.join(
      dir,
      `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
    );
    fs.writeFileSync(tempPath, data, "utf-8");
    fs.renameSync(tempPath, filePath);
    return;
  } catch (atomicErr) {
    // Atomic rename can fail across Docker mount boundaries; fall back to direct write
    try {
      fs.writeFileSync(filePath, data, "utf-8");
      return;
    } catch (directErr) {
      console.error(`[HistoricalStore] Direct write to ${filePath} failed:`, directErr);
      throw directErr;
    }
  }
}

// In-memory hot cache
let memoryStore: HistoricalPriceStoreData | null = null;

function ensureStorage(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(HISTORICAL_FILE)) {
      safeWriteFileSync(HISTORICAL_FILE, JSON.stringify({}, null, 2));
    }
  } catch (err) {
    console.error("[HistoricalStore] Failed to ensure storage directory:", err);
  }
}

function loadStoreFromDisk(): HistoricalPriceStoreData {
  if (memoryStore !== null) {
    return memoryStore;
  }
  ensureStorage();
  try {
    if (fs.existsSync(HISTORICAL_FILE)) {
      const raw = fs.readFileSync(HISTORICAL_FILE, "utf-8");
      memoryStore = JSON.parse(raw) as HistoricalPriceStoreData;
      return memoryStore;
    }
  } catch (err) {
    console.error("[HistoricalStore] Error reading historical-prices.json:", err);
  }
  memoryStore = {};
  return memoryStore;
}

export function getCacheKey(symbol: string, isAdjusted: boolean): string {
  return `${symbol.trim().toUpperCase()}:${isAdjusted ? "adj" : "raw"}`;
}

/**
 * Retrieves historical price points for a symbol starting from startDateStr.
 * Returns null if the symbol is not cached or if the cache does not cover the requested start date.
 */
export function getCachedHistoricalPrices(
  symbol: string,
  startDateStr: string,
  isAdjusted: boolean = true
): { points: HistoricalPricePoint[]; lastFetchedDate: string; isFresh: boolean } | null {
  const store = loadStoreFromDisk();
  const primaryRecord = store[getCacheKey(symbol, isAdjusted)];
  const fallbackRecord = store[getCacheKey(symbol, !isAdjusted)];
  const record =
    primaryRecord && Object.keys(primaryRecord.points || {}).length > 0
      ? primaryRecord
      : fallbackRecord;

  if (!record || !record.points || Object.keys(record.points).length === 0) {
    return null;
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const sortedDates = Object.keys(record.points).sort();
  const earliestDate = sortedDates[0];
  const latestDate = sortedDates[sortedDates.length - 1];

  // If the user's start date is earlier than our earliest cached date, we need more history
  if (startDateStr < earliestDate) {
    return null;
  }

  // Check freshness: if fetched today, or if latest data is yesterday or today, it's fresh
  const isFresh =
    record.lastFetchedDate === todayStr ||
    latestDate >= todayStr ||
    (Date.now() - new Date(record.lastFetchedDate || 0).getTime() < 12 * 3600 * 1000);

  const filteredPoints: HistoricalPricePoint[] = sortedDates
    .filter((d) => d >= startDateStr)
    .map((d) => ({ date: d, close: record.points[d] }));

  return {
    points: filteredPoints,
    lastFetchedDate: record.lastFetchedDate,
    isFresh,
  };
}

/**
 * Retrieves all cached historical price points for a symbol, regardless of start date or freshness.
 * Essential for offline operation when network queries cannot backfill older dates.
 */
export function getAllCachedPoints(
  symbol: string,
  isAdjusted: boolean = true
): HistoricalPricePoint[] {
  const store = loadStoreFromDisk();
  const cleanSymbol = symbol.trim().toUpperCase();

  // Try requested mode, then fall back to the other mode if empty
  const primaryRecord = store[getCacheKey(cleanSymbol, isAdjusted)];
  const fallbackRecord = store[getCacheKey(cleanSymbol, !isAdjusted)];
  const record =
    primaryRecord && Object.keys(primaryRecord.points || {}).length > 0
      ? primaryRecord
      : fallbackRecord;

  if (!record || !record.points) return [];

  return Object.keys(record.points)
    .sort()
    .map((d) => ({ date: d, close: record.points[d] }))
    .filter((p) => typeof p.close === "number" && !isNaN(p.close) && p.close > 0);
}

/**
 * Saves or merges historical price points into persistent storage.
 */
export async function saveHistoricalPrices(
  symbol: string,
  points: HistoricalPricePoint[],
  isAdjusted: boolean = true
): Promise<void> {
  if (!points || points.length === 0) return;

  const cleanSymbol = symbol.trim().toUpperCase();
  const key = getCacheKey(cleanSymbol, isAdjusted);
  const todayStr = new Date().toISOString().split("T")[0];

  await withLock(async () => {
    const store = loadStoreFromDisk();
    const existing = store[key] || {
      symbol: cleanSymbol,
      isAdjusted,
      lastFetchedDate: todayStr,
      points: {},
    };

    // Merge points into dictionary (past dates are immutable and preserved)
    for (const pt of points) {
      if (pt.date && typeof pt.close === "number" && !isNaN(pt.close) && pt.close > 0) {
        existing.points[pt.date] = pt.close;
      }
    }

    existing.lastFetchedDate = todayStr;
    store[key] = existing;
    memoryStore = store;

    try {
      safeWriteFileSync(HISTORICAL_FILE, JSON.stringify(store, null, 2));
    } catch (err) {
      console.error("[HistoricalStore] Error saving historical-prices.json:", err);
    }
  });
}

/**
 * Returns all dates currently cached for a given symbol.
 */
export function getCachedDateRange(
  symbol: string,
  isAdjusted: boolean = true
): { earliestDate: string; latestDate: string; count: number } | null {
  const store = loadStoreFromDisk();
  const key = getCacheKey(symbol, isAdjusted);
  const record = store[key];

  if (!record || !record.points) return null;

  const dates = Object.keys(record.points).sort();
  if (dates.length === 0) return null;

  return {
    earliestDate: dates[0],
    latestDate: dates[dates.length - 1],
    count: dates.length,
  };
}

/**
 * Retrieves the most recent available closing price for a symbol from persistent disk storage.
 * Prevents artificial price collapse to cost basis when offline or when network requests fail.
 */
export function getLatestCachedPrice(
  symbol: string
): { price: number; date: string } | null {
  const store = loadStoreFromDisk();
  const cleanSymbol = symbol.trim().toUpperCase();

  // Prefer raw (unadjusted) for holdings valuation; fall back to adjusted (e.g. indices)
  const rawRecord = store[`${cleanSymbol}:raw`];
  const adjRecord = store[`${cleanSymbol}:adj`];
  const record =
    rawRecord && Object.keys(rawRecord.points || {}).length > 0
      ? rawRecord
      : adjRecord;

  if (!record || !record.points) return null;

  const dates = Object.keys(record.points).sort();
  if (dates.length === 0) return null;

  // Search backwards for the latest valid positive price
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i];
    const p = record.points[d];
    if (typeof p === "number" && !isNaN(p) && p > 0) {
      return { price: p, date: d };
    }
  }

  return null;
}

/**
 * Persists a single live price point (e.g. today's quote) to ensure
 * subsequent offline calculations retain the latest market valuation.
 */
export async function saveLatestStockPrice(
  symbol: string,
  price: number,
  dateStr?: string,
  isAdjusted: boolean = false
): Promise<void> {
  if (!price || isNaN(price) || price <= 0) return;
  const d = dateStr || new Date().toISOString().split("T")[0];
  await saveHistoricalPrices(symbol, [{ date: d, close: price }], isAdjusted);
}
