import fs from "fs";
import path from "path";
import { Transaction, PortfolioSummary } from "./types";
import { getCachedData, setCachedData, deleteCachedData } from "./redis";

export interface StoredPortfolio {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  transactions: Transaction[];
  sourceFileName?: string;
  isDefault?: boolean;
  lastComputedSummary?: PortfolioSummary;
  lastCalculatedAt?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_FILE = path.join(DATA_DIR, "portfolios.json");
const REDIS_PORTFOLIO_TTL = 86400 * 30; // 30 days retention in Redis

// In-process lock to serialize concurrent read-modify-write operations
let lockPromise: Promise<unknown> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const currentLock = lockPromise;
  lockPromise = currentLock.then(() => nextLock);

  await currentLock;
  try {
    return await fn();
  } finally {
    release!();
  }
}

function safeWriteFileSync(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error(`[Storage] Failed to ensure directory ${dir}:`, err);
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
    // Atomic rename can fail across Docker mount boundaries or permission quirks;
    // fall back to direct write
    try {
      fs.writeFileSync(filePath, data, "utf-8");
      return;
    } catch (directErr) {
      console.error(`[Storage] Direct write to ${filePath} failed:`, directErr);
      throw directErr;
    }
  }
}

function ensureStorage(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORAGE_FILE)) {
      safeWriteFileSync(STORAGE_FILE, JSON.stringify({}, null, 2));
    }
  } catch (err) {
    console.error("[Storage] Failed to ensure storage directory/file:", err);
  }
}

export async function getAllPortfolios(): Promise<StoredPortfolio[]> {
  ensureStorage();

  // 1. Check Redis cache first (fast & reliable across container restarts)
  try {
    const cached = await getCachedData<StoredPortfolio[]>("portfolios:all");
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch (err) {
    console.error("[Storage] Error checking Redis in getAllPortfolios:", err);
  }

  // 2. Read from disk if Redis has no data
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
      const map = JSON.parse(raw) as Record<string, StoredPortfolio>;
      const list = Object.values(map);
      if (list.length > 0) {
        // Re-populate Redis with 30-day TTL
        await setCachedData("portfolios:all", list, REDIS_PORTFOLIO_TTL);
        return list;
      }
    }
  } catch (err) {
    console.error("[Storage] Error reading portfolios from disk:", err);
  }

  // 3. Fallback: if Redis had an empty array or disk was empty, return whatever Redis had
  try {
    const cached = await getCachedData<StoredPortfolio[]>("portfolios:all");
    if (cached && Array.isArray(cached)) return cached;
  } catch {}

  return [];
}

export async function getPortfolioById(
  id: string
): Promise<StoredPortfolio | null> {
  const all = await getAllPortfolios();
  return all.find((p) => p.id === id) || null;
}

export async function savePortfolio(
  portfolio: StoredPortfolio
): Promise<StoredPortfolio> {
  return withLock(async () => {
    ensureStorage();

    let map: Record<string, StoredPortfolio> = {};

    // 1. Read existing from disk
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
        map = JSON.parse(raw);
      }
    } catch (err) {
      console.error("[Storage] Error reading portfolios from disk before save:", err);
    }

    // 2. If disk had nothing, check Redis backup as secondary source of truth
    if (Object.keys(map).length === 0) {
      try {
        const cached = await getCachedData<StoredPortfolio[]>("portfolios:all");
        if (cached && Array.isArray(cached) && cached.length > 0) {
          for (const p of cached) {
            map[p.id] = p;
          }
        }
      } catch {}
    }

    // If setting isDefault to true, ensure others are set to false
    if (portfolio.isDefault) {
      for (const k of Object.keys(map)) {
        if (k !== portfolio.id) {
          map[k].isDefault = false;
        }
      }
    }

    map[portfolio.id] = {
      ...portfolio,
      updatedAt: new Date().toISOString(),
    };

    const list = Object.values(map);

    // 3. PERSIST IN REDIS FIRST (30-day retention)
    try {
      await setCachedData("portfolios:all", list, REDIS_PORTFOLIO_TTL);
    } catch (err) {
      console.error("[Storage] Failed to update Redis cache:", err);
    }

    // 4. PERSIST TO DISK
    try {
      safeWriteFileSync(STORAGE_FILE, JSON.stringify(map, null, 2));
    } catch (err) {
      console.error("[Storage] Error saving portfolio to disk:", err instanceof Error ? err.message : String(err));
    }

    return portfolio;
  });
}

export async function deletePortfolio(id: string): Promise<boolean> {
  return withLock(async () => {
    ensureStorage();

    let map: Record<string, StoredPortfolio> = {};
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
        map = JSON.parse(raw) as Record<string, StoredPortfolio>;
      }
    } catch {}

    if (Object.keys(map).length === 0) {
      try {
        const cached = await getCachedData<StoredPortfolio[]>("portfolios:all");
        if (cached && Array.isArray(cached)) {
          for (const p of cached) {
            map[p.id] = p;
          }
        }
      } catch {}
    }

    if (map[id]) {
      delete map[id];
      const list = Object.values(map);
      await setCachedData("portfolios:all", list, REDIS_PORTFOLIO_TTL);
      try {
        safeWriteFileSync(STORAGE_FILE, JSON.stringify(map, null, 2));
      } catch (err) {
        console.error("[Storage] Error saving after deletion to disk:", err);
      }
      return true;
    }

    return false;
  });
}

export async function updatePortfolioSummary(
  id: string,
  summary: PortfolioSummary
): Promise<void> {
  return withLock(async () => {
    ensureStorage();
    let map: Record<string, StoredPortfolio> = {};
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
        map = JSON.parse(raw) as Record<string, StoredPortfolio>;
      }
    } catch {}

    if (Object.keys(map).length === 0) {
      try {
        const cached = await getCachedData<StoredPortfolio[]>("portfolios:all");
        if (cached && Array.isArray(cached)) {
          for (const p of cached) {
            map[p.id] = p;
          }
        }
      } catch {}
    }

    if (map[id]) {
      map[id].lastComputedSummary = summary;
      map[id].lastCalculatedAt = new Date().toISOString();
      const list = Object.values(map);
      await setCachedData("portfolios:all", list, REDIS_PORTFOLIO_TTL);
      try {
        safeWriteFileSync(STORAGE_FILE, JSON.stringify(map, null, 2));
      } catch (err) {
        console.error("[Storage] Error updating portfolio summary on disk:", err);
      }
    }
  });
}

