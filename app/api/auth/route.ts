import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { signAccessToken, signRefreshToken, verifyToken,
  ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth";
import { checkRateLimit, getClientIp, resetRateLimit } from "@/lib/rate-limiter";

/**
 * Constant-time string comparison to prevent timing attack leaks.
 */
function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Perform dummy timing safe equal against self to equalize execution time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// POST /api/auth — Login
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimitKey = `auth:login:${ip}`;

  // 1. Rate Limiting: Max 5 failed attempts per 15 minutes per IP
  const rateCheck = await checkRateLimit(rateLimitKey, {
    maxRequests: 5,
    windowSeconds: 900,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Too many failed login attempts. Please wait 15 minutes before trying again.",
        retryAfter: rateCheck.resetInSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateCheck.resetInSeconds),
        },
      }
    );
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminPassword || !jwtSecret) {
    return NextResponse.json(
      { error: "Server not configured. Set ADMIN_PASSWORD and JWT_SECRET in .env" },
      { status: 500 }
    );
  }

  // 2. Constant-time timing safe comparison
  if (!password || !safeTimingCompare(password, adminPassword)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // 3. Reset rate limit counter on successful authentication
  await resetRateLimit(rateLimitKey);

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(),
    signRefreshToken(),
  ]);

  const response = NextResponse.json({ success: true });

  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 15, // 15 minutes
    path: "/",
  });

  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}

// GET /api/auth — Refresh access token using refresh token
export async function GET(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const payload = await verifyToken(refreshToken);
  if (!payload || payload.type !== "refresh") {
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }

  const newAccessToken = await signAccessToken();
  const response = NextResponse.json({ success: true });

  response.cookies.set(ACCESS_TOKEN_COOKIE, newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 15,
    path: "/",
  });

  return response;
}

// DELETE /api/auth — Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

