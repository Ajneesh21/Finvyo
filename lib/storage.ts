import fs from "fs";
import path from "path";
import { Transaction } from "./types";
import { getCachedData, setCachedData, deleteCachedData } from "./redis";

export interface StoredPortfolio {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  transactions: Transaction[];
  sourceFileName?: string;
  isDefault?: boolean;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_FILE = path.join(DATA_DIR, "portfolios.json");

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

function atomicWriteFileSync(filePath: string, data: string) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
  );
  fs.writeFileSync(tempPath, data, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function ensureStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORAGE_FILE)) {
      atomicWriteFileSync(STORAGE_FILE, JSON.stringify({}, null, 2));
    }
  } catch {
    // Fallback if filesystem write is restricted
  }
}

export async function getAllPortfolios(): Promise<StoredPortfolio[]> {
  ensureStorage();

  const cached = await getCachedData<StoredPortfolio[]>("portfolios:all");
  if (cached) return cached;

  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
      const map = JSON.parse(raw) as Record<string, StoredPortfolio>;
      const list = Object.values(map);
      await setCachedData("portfolios:all", list, 60);
      return list;
    }
  } catch {
    // Fallback
  }

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

    try {
      let map: Record<string, StoredPortfolio> = {};
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
        map = JSON.parse(raw);
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

      atomicWriteFileSync(STORAGE_FILE, JSON.stringify(map, null, 2));
      await setCachedData("portfolios:all", Object.values(map), 60);
    } catch (err) {
      console.error("[Storage] Error saving portfolio:", err instanceof Error ? err.message : String(err));
    }

    return portfolio;
  });
}

export async function deletePortfolio(id: string): Promise<boolean> {
  return withLock(async () => {
    ensureStorage();

    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
        const map = JSON.parse(raw) as Record<string, StoredPortfolio>;
        if (map[id]) {
          delete map[id];
          atomicWriteFileSync(STORAGE_FILE, JSON.stringify(map, null, 2));
          await deleteCachedData("portfolios:all");
          return true;
        }
      }
      await deleteCachedData("portfolios:all");
    } catch (err) {
      console.error("[Storage] Error deleting portfolio:", err instanceof Error ? err.message : String(err));
    }

    return false;
  });
}
