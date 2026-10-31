import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  safeTimingCompare,
  generateStorageFolderKey,
  getAuthUserFromRequest,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  AuthUser,
} from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserDirectory } from "@/lib/user-storage";
import { savePortfolio } from "@/lib/storage";
import { checkRateLimit, getClientIp, resetRateLimit } from "@/lib/rate-limiter";

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

      if (!password || password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters long." },
          { status: 400 }
        );
      }

      // Check if user already exists
      const existingUser = await query(
        `SELECT id, username, email FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)`,
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        const match = existingUser.rows[0];
        if (match.username.toLowerCase() === username.toLowerCase()) {
          return NextResponse.json(
            { error: "Username is already taken. Please choose another." },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: "An account with this email already exists." },
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
    // Action 2: Login
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
          error: "Too many failed login attempts. Please wait 15 minutes before trying again.",
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

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    // Query PostgreSQL for the user
    let userRow: any = null;
    if (identifier) {
      const userRes = await query(
        `SELECT id, username, email, password_hash, storage_folder_key FROM users
         WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
        [identifier]
      );
      if (userRes.rows.length > 0) {
        userRow = userRes.rows[0];
      }
    }

    // If no user found by identifier, check if there's a legacy admin password configured
    if (!userRow && process.env.ADMIN_PASSWORD && safeTimingCompare(password, process.env.ADMIN_PASSWORD)) {
      // Find or create default admin account in PostgreSQL
      let adminRes = await query(
        `SELECT id, username, email, password_hash, storage_folder_key FROM users WHERE username = 'admin'`
      );

      if (adminRes.rows.length === 0) {
        const adminId = crypto.randomUUID();
        const folderKey = generateStorageFolderKey("admin");
        getUserDirectory(folderKey);
        const adminHash = await hashPassword(password);

        await query(
          `INSERT INTO users (id, username, email, password_hash, storage_folder_key)
           VALUES ($1, 'admin', 'admin@finvyo.local', $2, $3)`,
          [adminId, adminHash, folderKey]
        );

        adminRes = await query(
          `SELECT id, username, email, password_hash, storage_folder_key FROM users WHERE id = $1`,
          [adminId]
        );
      }

      userRow = adminRes.rows[0];
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

    // Reset rate limiter on successful authentication
    await resetRateLimit(loginRateKey);

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
    return NextResponse.json(
      { error: "Authentication failed. " + (err.message || "") },
      { status: 500 }
    );
  }
}

// GET /api/auth — Get current logged-in user profile
export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.userId,
      username: user.username,
      email: user.email,
      storageFolderKey: user.storageFolderKey,
      role: user.role,
    },
  });
}

// DELETE /api/auth — Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
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
