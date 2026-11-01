import fs from "fs";
import path from "path";
import crypto from "crypto";
import { query } from "./db";
import { deleteCachedData } from "./redis";

export interface StoredUserFile {
  id: string;
  userId: string;
  portfolioId?: string | null;
  originalFilename: string;
  storedRelativePath: string;
  fileType: string;
  fileSizeBytes: number;
  checksumSha256?: string;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_STORAGE_DIR = path.join(DATA_DIR, "users");

/**
 * Validates and returns the isolated folder for a user.
 * Prevents any directory escape or path traversal.
 */
export function getUserDirectory(storageFolderKey: string): string {
  if (!storageFolderKey || !/^[a-zA-Z0-9_-]+$/.test(storageFolderKey)) {
    throw new Error("Invalid storage folder key");
  }

  const baseDir = path.resolve(USERS_STORAGE_DIR);
  const targetDir = path.resolve(baseDir, storageFolderKey);

  if (!targetDir.startsWith(baseDir + path.sep)) {
    throw new Error("Security violation: Target directory outside users storage root");
  }

  // Ensure directories exist
  const statementsDir = path.join(targetDir, "statements");
  const exportsDir = path.join(targetDir, "exports");

  if (!fs.existsSync(statementsDir)) {
    fs.mkdirSync(statementsDir, { recursive: true });
  }
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  return targetDir;
}

/**
 * Resolves a path inside the user's folder with strict path traversal checking.
 */
export function resolveUserFilePath(
  storageFolderKey: string,
  relativePath: string
): string {
  const userDir = getUserDirectory(storageFolderKey);
  const resolved = path.resolve(userDir, relativePath);

  if (!resolved.startsWith(userDir + path.sep) && resolved !== userDir) {
    throw new Error("Security violation: Path traversal detected outside user folder");
  }

  return resolved;
}

/**
 * Saves an uploaded statement or document directly into the user's isolated folder
 * and registers metadata in PostgreSQL.
 */
export async function saveUserFile(params: {
  userId: string;
  storageFolderKey: string;
  originalFilename: string;
  buffer: Buffer;
  mimeType: string;
  portfolioId?: string | null;
  subfolder?: "statements" | "exports";
}): Promise<StoredUserFile> {
  const {
    userId,
    storageFolderKey,
    originalFilename,
    buffer,
    mimeType,
    portfolioId = null,
    subfolder = "statements",
  } = params;

  // 1. Calculate SHA-256 checksum
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  // 2. Compute a unique, collision-resistant filename
  const cleanBaseName = path
    .basename(originalFilename)
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${cleanBaseName}`;
  const relativePath = path.join(subfolder, storedFilename);

  // 3. Resolve target destination & write safely to disk
  const absolutePath = resolveUserFilePath(storageFolderKey, relativePath);
  fs.writeFileSync(absolutePath, buffer);

  // 4. Save metadata to PostgreSQL
  const fileId = crypto.randomUUID();
  const sql = `
    INSERT INTO user_files (
      id, user_id, portfolio_id, original_filename,
      stored_relative_path, file_type, file_size_bytes, checksum_sha256
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;

  try {
    const res = await query(sql, [
      fileId,
      userId,
      portfolioId,
      originalFilename,
      relativePath,
      mimeType,
      buffer.length,
      hash,
    ]);

    const row = res.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      portfolioId: row.portfolio_id,
      originalFilename: row.original_filename,
      storedRelativePath: row.stored_relative_path,
      fileType: row.file_type,
      fileSizeBytes: Number(row.file_size_bytes),
      checksumSha256: row.checksum_sha256,
      createdAt: row.created_at,
    };
  } catch (err) {
    // If DB fails, clean up the written file to prevent orphan files on disk
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch {}
    throw err;
  }
}

/**
 * List all files belonging to a specific user.
 */
export async function listUserFiles(userId: string): Promise<StoredUserFile[]> {
  try {
    const res = await query(
      `SELECT * FROM user_files WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      portfolioId: row.portfolio_id,
      originalFilename: row.original_filename,
      storedRelativePath: row.stored_relative_path,
      fileType: row.file_type,
      fileSizeBytes: Number(row.file_size_bytes),
      checksumSha256: row.checksum_sha256,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Retrieve a specific file owned by a user, returning metadata and buffer.
 */
export async function getUserFile(
  userId: string,
  storageFolderKey: string,
  fileId: string
): Promise<{ metadata: StoredUserFile; buffer: Buffer } | null> {
  const res = await query(
    `SELECT * FROM user_files WHERE id = $1 AND user_id = $2`,
    [fileId, userId]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  const metadata: StoredUserFile = {
    id: row.id,
    userId: row.user_id,
    portfolioId: row.portfolio_id,
    originalFilename: row.original_filename,
    storedRelativePath: row.stored_relative_path,
    fileType: row.file_type,
    fileSizeBytes: Number(row.file_size_bytes),
    checksumSha256: row.checksum_sha256,
    createdAt: row.created_at,
  };

  const absolutePath = resolveUserFilePath(storageFolderKey, row.stored_relative_path);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const buffer = fs.readFileSync(absolutePath);
  return { metadata, buffer };
}

/**
 * Deletes a file from both disk and PostgreSQL, ensuring strictly the owner can delete it.
 */
export async function deleteUserFile(
  userId: string,
  storageFolderKey: string,
  fileId: string
): Promise<boolean> {
  const res = await query(
    `SELECT * FROM user_files WHERE id = $1 AND user_id = $2`,
    [fileId, userId]
  );

  if (res.rows.length === 0) {
    return false;
  }

  const row = res.rows[0];
  const absolutePath = resolveUserFilePath(storageFolderKey, row.stored_relative_path);

  try {
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (err) {
    console.error("[UserStorage] Error deleting file from disk:", err);
  }

  await query(`DELETE FROM user_files WHERE id = $1 AND user_id = $2`, [
    fileId,
    userId,
  ]);

  return true;
}

/**
 * Completely removes a user's isolated storage folder from disk.
 * Strictly verifies directory isolation to avoid traversal.
 */
export function deleteUserStorageDirectory(storageFolderKey: string): boolean {
  if (!storageFolderKey || !/^[a-zA-Z0-9_-]+$/.test(storageFolderKey)) {
    throw new Error("Invalid storage folder key");
  }

  const baseDir = path.resolve(USERS_STORAGE_DIR);
  const targetDir = path.resolve(baseDir, storageFolderKey);

  if (!targetDir.startsWith(baseDir + path.sep)) {
    throw new Error("Security violation: Target directory outside users storage root");
  }

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Associates an unassigned user file with a newly created portfolio.
 */
export async function linkFilesToPortfolio(
  userId: string,
  portfolioId: string,
  sourceFileName: string
): Promise<void> {
  try {
    await query(
      `UPDATE user_files 
       SET portfolio_id = $1 
       WHERE user_id = $2 AND (portfolio_id IS NULL OR portfolio_id = '') AND original_filename = $3`,
      [portfolioId, userId, sourceFileName]
    );
  } catch (err) {
    console.error("[UserStorage] Error linking file to portfolio:", err);
  }
}

/**
 * Deletes all files linked to a specific portfolio from disk and database.
 */
export async function deletePortfolioFiles(
  portfolioId: string,
  userId: string,
  storageFolderKey: string
): Promise<number> {
  let deletedCount = 0;
  try {
    // 1. Direct portfolio_id matches
    const res = await query(
      `SELECT id, stored_relative_path FROM user_files WHERE portfolio_id = $1 AND user_id = $2`,
      [portfolioId, userId]
    );

    for (const row of res.rows) {
      try {
        const absolutePath = resolveUserFilePath(storageFolderKey, row.stored_relative_path);
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
          deletedCount++;
        }
      } catch (fileErr) {
        console.error("[UserStorage] Failed to unlink file:", fileErr);
      }
    }

    // 2. Also check if the portfolio has a source_file_name that is unassigned in user_files
    const portRes = await query(
      `SELECT source_file_name FROM portfolios WHERE id = $1 AND user_id = $2`,
      [portfolioId, userId]
    );

    if (portRes.rows.length > 0 && portRes.rows[0].source_file_name) {
      const sourceName = portRes.rows[0].source_file_name;
      const unassignedRes = await query(
        `SELECT id, stored_relative_path FROM user_files 
         WHERE user_id = $1 AND (portfolio_id IS NULL OR portfolio_id = '') AND original_filename = $2`,
        [userId, sourceName]
      );

      for (const row of unassignedRes.rows) {
        try {
          const absolutePath = resolveUserFilePath(storageFolderKey, row.stored_relative_path);
          if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            deletedCount++;
          }
        } catch (fileErr) {
          console.error("[UserStorage] Failed to unlink unassigned source file:", fileErr);
        }
        await query(`DELETE FROM user_files WHERE id = $1 AND user_id = $2`, [row.id, userId]);
      }
    }

    // 3. Clean up database records
    await query(
      `DELETE FROM user_files WHERE portfolio_id = $1 AND user_id = $2`,
      [portfolioId, userId]
    );
  } catch (err) {
    console.error("[UserStorage] Error deleting portfolio files:", err);
  }
  return deletedCount;
}

/**
 * Permanently deletes a user account, all linked files/directories on disk,
 * cached data in Redis, and cascades all database records.
 */
export async function deleteUserAccount(
  userId: string,
  storageFolderKey: string
): Promise<boolean> {
  // 1. Delete physical storage folder and all statements/exports on disk
  try {
    deleteUserStorageDirectory(storageFolderKey);
  } catch (dirErr) {
    console.error("[UserStorage] Note: Error deleting user folder from disk:", dirErr);
  }

  // 2. Clear Redis cache for this user
  try {
    await deleteCachedData(`portfolios:user:${userId}`);
  } catch (redisErr) {
    console.error("[UserStorage] Error clearing Redis cache for user:", redisErr);
  }

  // 3. Delete user record in PostgreSQL (cascades to portfolios and user_files)
  const res = await query(`DELETE FROM users WHERE id = $1`, [userId]);
  return (res.rowCount ?? 0) > 0;
}
