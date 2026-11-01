import { Pool, QueryResult, QueryResultRow } from "pg";

let pool: Pool | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

export function getDatabasePool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      "postgresql://finvyo:finvyo_db_pass@localhost:5432/finvyo";

    // SSL should only be enabled if explicitly requested via DATABASE_SSL=true,
    // or if the connection string explicitly requires it (sslmode=require),
    // or for external cloud databases (e.g. AWS RDS, Supabase, Neon) - never for internal Docker/local hosts.
    const isInternalHost =
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1") ||
      connectionString.includes("@postgres:") ||
      connectionString.includes("@postgres/") ||
      connectionString.includes("@db:") ||
      connectionString.includes("@db/");

    const isExplicitSsl =
      process.env.DATABASE_SSL === "true" ||
      connectionString.includes("sslmode=require") ||
      connectionString.includes("ssl=true");

    const isCloudDb =
      process.env.NODE_ENV === "production" &&
      !isInternalHost &&
      (connectionString.includes("amazonaws.com") ||
        connectionString.includes("supabase.co") ||
        connectionString.includes("render.com") ||
        connectionString.includes("neon.tech"));

    const useSsl = isExplicitSsl || isCloudDb;

    let sslConfig: { rejectUnauthorized: boolean; ca?: string } | undefined = undefined;
    if (useSsl) {
      // Secure SSL: enforce certificate validation by default (rejectUnauthorized: true)
      // Supports custom CA certificates via DATABASE_CA_CERT / DB_CA_CERT
      const ca = process.env.DATABASE_CA_CERT || process.env.DB_CA_CERT;
      const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
      sslConfig = {
        rejectUnauthorized,
        ...(ca ? { ca } : {}),
      };
    }

    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: sslConfig,
    });

    pool.on("error", (err) => {
      console.error("[PostgreSQL] Unexpected pool error:", err);
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  await ensureDatabaseInitialized();
  const dbPool = getDatabasePool();
  return dbPool.query<T>(text, params);
}

export async function ensureDatabaseInitialized(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const dbPool = getDatabasePool();

      // Check connectivity first
      const client = await dbPool.connect();
      try {
        await client.query("BEGIN");

        // 1. Users Table
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            storage_folder_key VARCHAR(100) UNIQUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // 2. Portfolios Table (Multi-tenant)
        await client.query(`
          CREATE TABLE IF NOT EXISTS portfolios (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            is_default BOOLEAN DEFAULT false,
            source_file_name TEXT,
            transactions JSONB DEFAULT '[]'::jsonb,
            last_computed_summary JSONB,
            last_calculated_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // 3. User Files Table (Metadata mapping to isolated user folder)
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_files (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            portfolio_id VARCHAR(64) REFERENCES portfolios(id) ON DELETE SET NULL,
            original_filename TEXT NOT NULL,
            stored_relative_path TEXT NOT NULL,
            file_type VARCHAR(100) NOT NULL,
            file_size_bytes BIGINT NOT NULL,
            checksum_sha256 VARCHAR(64),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // 4. Performance Indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
          CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
          CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `);

        await client.query("COMMIT");
        isInitialized = true;
        console.log("[PostgreSQL] Database schema verified and initialized successfully.");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn(
        `[PostgreSQL] Initialization note: Could not connect to database at ${
          process.env.DATABASE_URL || "default connection"
        }. (${err.message})`
      );
      // Do not permanently block so app can report clean message or fallback gracefully
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}
