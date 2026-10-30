import fs from "fs";
import path from "path";
import { Transaction, PortfolioSummary } from "./types";
import { getCachedData, setCachedData, deleteCachedData } from "./redis";
import { query } from "./db";

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

/**
 * Fetch all portfolios belonging to a specific user.
 * 1. Redis Cache -> 2. PostgreSQL -> 3. Fallback to Disk/Memory
 */
export async function getAllPortfolios(userId: string = "default-user"): Promise<StoredPortfolio[]> {
  if (!userId) return [];

  const redisKey = `portfolios:user:${userId}`;

  // 1. Check Redis cache first
  try {
    const cached = await getCachedData<StoredPortfolio[]>(redisKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch {}

  // 2. Fetch from PostgreSQL
  try {
    const res = await query(
      `SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    if (res.rows.length > 0) {
      const list: StoredPortfolio[] = res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        transactions: Array.isArray(row.transactions) ? row.transactions : [],
        sourceFileName: row.source_file_name || undefined,
        isDefault: Boolean(row.is_default),
        lastComputedSummary: row.last_computed_summary || undefined,
        lastCalculatedAt: row.last_calculated_at
          ? new Date(row.last_calculated_at).toISOString()
          : undefined,
      }));

      // Cache in Redis
      await setCachedData(redisKey, list, REDIS_PORTFOLIO_TTL);
      return list;
    }
  } catch (dbErr) {
    console.warn("[Storage] Database query error in getAllPortfolios:", dbErr);
  }

  // 3. Fallback: Check local disk storage (for legacy or offline single-tenant data)
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, "utf-8");
      const map = JSON.parse(raw) as Record<string, StoredPortfolio>;
      const list = Object.values(map);
      if (list.length > 0) {
        return list;
      }
    }
  } catch {}

  return [];
}

export async function getPortfolioById(
  id: string,
  userId: string = "default-user"
): Promise<StoredPortfolio | null> {
  const all = await getAllPortfolios(userId);
  return all.find((p) => p.id === id) || null;
}

/**
 * Saves or updates a portfolio for a specific user in PostgreSQL and Redis.
 */
export async function savePortfolio(
  portfolio: StoredPortfolio,
  userId: string = "default-user"
): Promise<StoredPortfolio> {
  if (!userId) {
    userId = "default-user";
  }

  return withLock(async () => {
    const redisKey = `portfolios:user:${userId}`;

    // If this portfolio is marked default, unset default on other portfolios
    if (portfolio.isDefault) {
      try {
        await query(
          `UPDATE portfolios SET is_default = false WHERE user_id = $1 AND id != $2`,
          [userId, portfolio.id]
        );
      } catch {}
    }

    const now = new Date().toISOString();
    const updatedPortfolio: StoredPortfolio = {
      ...portfolio,
      updatedAt: now,
    };

    // 1. Save to PostgreSQL
    try {
      await query(
        `INSERT INTO portfolios (
          id, user_id, name, is_default, source_file_name,
          transactions, last_computed_summary, last_calculated_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          is_default = EXCLUDED.is_default,
          source_file_name = COALESCE(EXCLUDED.source_file_name, portfolios.source_file_name),
          transactions = EXCLUDED.transactions,
          last_computed_summary = COALESCE(EXCLUDED.last_computed_summary, portfolios.last_computed_summary),
          last_calculated_at = COALESCE(EXCLUDED.last_calculated_at, portfolios.last_calculated_at),
          updated_at = EXCLUDED.updated_at;`,
        [
          updatedPortfolio.id,
          userId,
          updatedPortfolio.name,
          Boolean(updatedPortfolio.isDefault),
          updatedPortfolio.sourceFileName || null,
          JSON.stringify(updatedPortfolio.transactions || []),
          updatedPortfolio.lastComputedSummary
            ? JSON.stringify(updatedPortfolio.lastComputedSummary)
            : null,
          updatedPortfolio.lastCalculatedAt || null,
          now,
        ]
      );
    } catch (dbErr) {
      console.error("[Storage] Database save error in savePortfolio:", dbErr);
    }

    // 2. Invalidate / Update Redis Cache
    try {
      const currentList = await getAllPortfolios(userId);
      const filtered = currentList.filter((p) => p.id !== updatedPortfolio.id);
      const newList = [updatedPortfolio, ...filtered];
      await setCachedData(redisKey, newList, REDIS_PORTFOLIO_TTL);
    } catch (err) {
      console.error("[Storage] Failed to update Redis cache:", err);
    }

    return updatedPortfolio;
  });
}

/**
 * Deletes a portfolio belonging to a user from PostgreSQL and Redis.
 */
export async function deletePortfolio(
  id: string,
  userId: string = "default-user"
): Promise<boolean> {
  if (!userId) return false;

  return withLock(async () => {
    const redisKey = `portfolios:user:${userId}`;

    try {
      const res = await query(
        `DELETE FROM portfolios WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );

      // Invalidate Redis cache
      const currentList = await getAllPortfolios(userId);
      const newList = currentList.filter((p) => p.id !== id);
      await setCachedData(redisKey, newList, REDIS_PORTFOLIO_TTL);

      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      console.error("[Storage] Database delete error in deletePortfolio:", err);
      return false;
    }
  });
}

/**
 * Updates computed analytics and summary for a user's portfolio.
 */
export async function updatePortfolioSummary(
  id: string,
  summary: PortfolioSummary,
  userId: string = "default-user"
): Promise<void> {
  if (!userId) return;

  return withLock(async () => {
    const now = new Date().toISOString();

    try {
      await query(
        `UPDATE portfolios SET
          last_computed_summary = $1,
          last_calculated_at = $2,
          updated_at = $3
        WHERE id = $4 AND user_id = $5`,
        [JSON.stringify(summary), now, now, id, userId]
      );

      // Invalidate Redis cache
      const redisKey = `portfolios:user:${userId}`;
      await deleteCachedData(redisKey);
    } catch (err) {
      console.error("[Storage] Error updating portfolio summary:", err);
    }
  });
}
