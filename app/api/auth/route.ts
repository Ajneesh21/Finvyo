import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  generateStorageFolderKey,
  getAuthUserFromRequest,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  AuthUser,
} from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserDirectory, deleteUserAccount } from "@/lib/user-storage";
import { savePortfolio } from "@/lib/storage";
import { checkRateLimit, getClientIp, resetRateLimit } from "@/lib/rate-limiter";
import { blacklistToken } from "@/lib/redis";

// POST /api/auth — Login or Register
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "login";

    // ----------------------------------------------------
    // Action 1: Registration
    // ----------------------------------------------------
    if (action === "register") {
      const ip = getClientIp(req);
      const regRateCheck = await checkRateLimit(`auth:register:${ip}`, {
        maxRequests: 5,
        windowSeconds: 3600, // max 5 registrations per hour per IP
      });
      if (!regRateCheck.allowed) {
        return NextResponse.json(
          {
            error: "Too many accounts created from this IP. Please try again later.",
            retryAfter: regRateCheck.resetInSeconds,
          },
          {
            status: 429,
            headers: { "Retry-After": String(regRateCheck.resetInSeconds) },
          }
        );
      }

      const username = String(body.username || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      // Validation
      if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return NextResponse.json(
          {
            error:
              "Username must be 3-30 characters long and contain only letters, numbers, and underscores.",
          },
          { status: 400 }
        );
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { error: "Please enter a valid email address." },
          { status: 400 }
        );
      }

      if (!password || password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters long." },
          { status: 400 }
        );
      }

      const COMMON_PASSWORDS = new Set([
        "12345678",
        "password",
        "password123",
        "123456789",
        "qwerty123",
        "admin123",
        "welcome123",
      ]);
      if (COMMON_PASSWORDS.has(password.toLowerCase())) {
        return NextResponse.json(
          { error: "Password is too common or easily guessable. Please choose a stronger password." },
          { status: 400 }
        );
      }

      // Check if user already exists (unified message prevents user/email enumeration)
      const existingUser = await query(
        `SELECT id, username, email FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)`,
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        return NextResponse.json(
          { error: "An account with this username or email already exists." },
          { status: 409 }
        );
      }

      // Hash password and generate storage folder key
      const passwordHash = await hashPassword(password);
      const storageFolderKey = generateStorageFolderKey(username);
      const userId = crypto.randomUUID();

      // Ensure user directory is created safely on disk
      getUserDirectory(storageFolderKey);

      // Save user to PostgreSQL
      await query(
        `INSERT INTO users (id, username, email, password_hash, storage_folder_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, username, email, passwordHash, storageFolderKey]
      );

      const authUser: AuthUser = {
        userId,
        username,
        email,
        storageFolderKey,
        role: "user",
      };

      // Create an initial default empty portfolio
      await savePortfolio(
        {
          id: `port-${crypto.randomUUID().slice(0, 8)}`,
          name: "Main Portfolio",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          transactions: [],
          isDefault: true,
        },
        userId
      ).catch((err) => {
        console.warn("[Auth API] Note: Failed to create initial default portfolio:", err);
      });

      // Issue tokens
      const [accessToken, refreshToken] = await Promise.all([
        signAccessToken(authUser),
        signRefreshToken(authUser),
      ]);

      const response = NextResponse.json({
        success: true,
        user: { id: userId, username, email },
      });

      setAuthCookies(response, accessToken, refreshToken);
      return response;
    }

    // ----------------------------------------------------
    // Action 2: Delete Account (Permanently wipe data & files)
    // ----------------------------------------------------
    if (action === "delete_account") {
      const user = await getAuthUserFromRequest(req);
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const ip = getClientIp(req);
      const delRateCheck = await checkRateLimit(`auth:delete:${ip}`, {
        maxRequests: 5,
        windowSeconds: 300,
      });
      if (!delRateCheck.allowed) {
        return NextResponse.json(
          { error: "Too many attempts. Please try again later." },
          { status: 429 }
        );
      }

      const password = String(body.password || "");
      if (!password) {
        return NextResponse.json(
          { error: "Please enter your password to confirm account deletion." },
          { status: 400 }
        );
      }

      const userRow = await query(
        `SELECT password_hash, storage_folder_key FROM users WHERE id = $1`,
        [user.userId]
      );

      if (userRow.rows.length === 0) {
        return NextResponse.json({ error: "User account not found." }, { status: 404 });
      }

      const isMatch = await verifyPassword(password, userRow.rows[0].password_hash);
      if (!isMatch) {
        return NextResponse.json(
          { error: "Incorrect password. Account deletion aborted." },
          { status: 403 }
        );
      }

      await deleteUserAccount(user.userId, userRow.rows[0].storage_folder_key);

      // Blacklist tokens server-side
      const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
      const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
      if (accessToken) await blacklistToken(accessToken, 60 * 60);
      if (refreshToken) await blacklistToken(refreshToken, 60 * 60 * 24 * 30);

      const response = NextResponse.json({
        success: true,
        message: "Account, portfolios, and all stored data deleted permanently.",
      });
      response.cookies.delete(ACCESS_TOKEN_COOKIE);
      response.cookies.delete(REFRESH_TOKEN_COOKIE);
      return response;
    }

    // ----------------------------------------------------
    // Action 3: Logout
    // ----------------------------------------------------
    if (action === "logout") {
      const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
      const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
      if (accessToken) await blacklistToken(accessToken, 60 * 60);
      if (refreshToken) await blacklistToken(refreshToken, 60 * 60 * 24 * 30);

      const response = NextResponse.json({ success: true, message: "Logged out." });
      response.cookies.delete(ACCESS_TOKEN_COOKIE);
      response.cookies.delete(REFRESH_TOKEN_COOKIE);
      return response;
    }

    // ----------------------------------------------------
    // Action 4: Login
    // ----------------------------------------------------
    const ip = getClientIp(req);
    const loginRateKey = `auth:login:${ip}`;
    const loginRateCheck = await checkRateLimit(loginRateKey, {
      maxRequests: 5,
      windowSeconds: 900, // 5 attempts per 15 minutes per IP
    });

    if (!loginRateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Too many failed login attempts from this IP. Please wait 15 minutes before trying again.",
          retryAfter: loginRateCheck.resetInSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(loginRateCheck.resetInSeconds),
          },
        }
      );
    }

    const identifier = String(body.identifier || body.username || body.email || "").trim();
    const password = String(body.password || "");

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required" },
        { status: 400 }
      );
    }

    // Per-account rate limiting to prevent distributed credential stuffing / brute-force
    const normalizedIdentifier = identifier.toLowerCase();
    const accountRateKey = `auth:login:account:${normalizedIdentifier}`;
    const accountRateCheck = await checkRateLimit(accountRateKey, {
      maxRequests: 5,
      windowSeconds: 900, // 5 attempts per 15 minutes per account
    });

    if (!accountRateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Too many failed login attempts for this account. Please wait 15 minutes before trying again.",
          retryAfter: accountRateCheck.resetInSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(accountRateCheck.resetInSeconds),
          },
        }
      );
    }

    // Query PostgreSQL for the user
    let userRow: any = null;
    const userRes = await query(
      `SELECT id, username, email, password_hash, storage_folder_key FROM users
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [identifier]
    );
    if (userRes.rows.length > 0) {
      userRow = userRes.rows[0];
    }

    if (!userRow) {
      return NextResponse.json(
        { error: "Invalid username/email or password" },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, userRow.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username/email or password" },
        { status: 401 }
      );
    }

    // Reset both IP and account rate limiters on successful authentication
    await Promise.all([
      resetRateLimit(loginRateKey),
      resetRateLimit(accountRateKey),
    ]);

    const authUser: AuthUser = {
      userId: userRow.id,
      username: userRow.username,
      email: userRow.email,
      storageFolderKey: userRow.storage_folder_key,
      role: userRow.username === "admin" ? "admin" : "user",
    };

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(authUser),
      signRefreshToken(authUser),
    ]);

    const response = NextResponse.json({
      success: true,
      user: {
        id: userRow.id,
        username: userRow.username,
        email: userRow.email,
      },
    });

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (err: any) {
    console.error("[Auth API] Error:", err);
    const safeError =
      process.env.NODE_ENV === "production"
        ? "Authentication failed due to an unexpected error. Please try again later."
        : `Authentication failed: ${err?.message || "Unknown error"}`;
    return NextResponse.json(
      { error: safeError },
      { status: 500 }
    );
  }
}

// GET /api/auth — Get current logged-in user profile & storage stats
export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let createdAt: string | null = null;
  let stats = {
    portfolioCount: 0,
    fileCount: 0,
    storageBytes: 0,
    totalTransactions: 0,
  };

  try {
    const userRow = await query(
      `SELECT created_at FROM users WHERE id = $1`,
      [user.userId]
    );
    if (userRow.rows.length > 0) {
      createdAt = userRow.rows[0].created_at;
    }

    const statsRes = await query(
      `SELECT 
        (SELECT COUNT(*) FROM portfolios WHERE user_id = $1) AS portfolio_count,
        (SELECT COUNT(*) FROM user_files WHERE user_id = $1) AS file_count,
        (SELECT COALESCE(SUM(file_size_bytes), 0) FROM user_files WHERE user_id = $1) AS storage_bytes,
        (SELECT COALESCE(SUM(jsonb_array_length(transactions)), 0) FROM portfolios WHERE user_id = $1) AS total_transactions`,
      [user.userId]
    );

    if (statsRes.rows.length > 0) {
      const s = statsRes.rows[0];
      stats = {
        portfolioCount: parseInt(s.portfolio_count || "0", 10),
        fileCount: parseInt(s.file_count || "0", 10),
        storageBytes: parseInt(s.storage_bytes || "0", 10),
        totalTransactions: parseInt(s.total_transactions || "0", 10),
      };
    }
  } catch (err) {
    console.error("[Auth API] Error fetching profile stats:", err);
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.userId,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt,
    },
    stats,
  });
}

// DELETE /api/auth — Logout or Delete Account
export async function DELETE(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (body?.action === "delete_account") {
        const user = await getAuthUserFromRequest(req);
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const password = String(body.password || "");
        if (!password) {
          return NextResponse.json(
            { error: "Password required to confirm account deletion." },
            { status: 400 }
          );
        }

        const userRow = await query(
          `SELECT password_hash, storage_folder_key FROM users WHERE id = $1`,
          [user.userId]
        );

        if (userRow.rows.length === 0) {
          return NextResponse.json({ error: "User not found." }, { status: 404 });
        }

        const isMatch = await verifyPassword(password, userRow.rows[0].password_hash);
        if (!isMatch) {
          return NextResponse.json(
            { error: "Incorrect password. Account deletion aborted." },
            { status: 403 }
          );
        }

        await deleteUserAccount(user.userId, userRow.rows[0].storage_folder_key);

        const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
        const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
        if (accessToken) await blacklistToken(accessToken, 60 * 60);
        if (refreshToken) await blacklistToken(refreshToken, 60 * 60 * 24 * 30);

        const response = NextResponse.json({
          success: true,
          message: "Account and all associated files deleted permanently.",
        });
        response.cookies.delete(ACCESS_TOKEN_COOKIE);
        response.cookies.delete(REFRESH_TOKEN_COOKIE);
        return response;
      }
    }
  } catch (err) {
    console.error("[Auth API DELETE] Error:", err);
  }

  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (accessToken) await blacklistToken(accessToken, 60 * 60);
  if (refreshToken) await blacklistToken(refreshToken, 60 * 60 * 24 * 30);

  const response = NextResponse.json({ success: true, message: "Logged out." });
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string
) {
  res.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 15, // 15 minutes
    path: "/",
  });

  res.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
}
