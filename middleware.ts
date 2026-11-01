import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

const ACCESS_TOKEN_COOKIE = "finvyo_token";
const REFRESH_TOKEN_COOKIE = "finvyo_refresh";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "[Finvyo] FATAL: JWT_SECRET environment variable is not set or is too short " +
        "(minimum 32 characters). " +
        "Generate a secure secret with: openssl rand -hex 32"
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Builds a strict Content-Security-Policy header using a per-request nonce.
 * The nonce is forwarded via the x-nonce request header so that server
 * components can attach it to any inline <script> tags they render.
 */
function buildCspHeader(nonce: string): string {
  const policy: Record<string, string> = {
    "default-src": "'self'",
    // 'strict-dynamic' propagates trust to scripts loaded by nonced scripts,
    // which covers Next.js's module graph without needing 'unsafe-inline'.
    "script-src": `'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Tailwind's runtime and CSS-in-JS still require 'unsafe-inline' for styles.
    // Removing this would need a full CSS-module migration.
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data: blob:",
    "font-src": "'self' data:",
    "connect-src": "'self' https://query1.finance.yahoo.com",
    "frame-ancestors": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "object-src": "'none'",
    "upgrade-insecure-requests": "",
  };

  return Object.entries(policy)
    .map(([directive, value]) => (value ? `${directive} ${value}` : directive))
    .join("; ");
}

async function verify(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

async function freshAccessToken(userPayload: any): Promise<string> {
  return new SignJWT({
    userId: userPayload.userId,
    username: userPayload.username,
    email: userPayload.email,
    storageFolderKey: userPayload.storageFolderKey,
    role: userPayload.role || "user",
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret());
}

/**
 * Attaches the CSP header and x-nonce to a response.
 */
function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildCspHeader(nonce));
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate a unique nonce for every request using Web Crypto API. It is forwarded via x-nonce so
  // that server components can stamp it on any inline <script> they render.
  const nonce = btoa(crypto.randomUUID());

  // Allow login/register pages, static assets, and auth endpoints.
  // Still apply CSP headers so that even public pages are protected.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    const response = NextResponse.next();
    return applySecurityHeaders(response, nonce);
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // 1. Try access token first
  if (accessToken) {
    const payload = await verify(accessToken);
    if (payload?.type === "access" && payload.userId) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-nonce", nonce);
      requestHeaders.set("x-user-id", String(payload.userId));
      requestHeaders.set("x-user-name", String(payload.username || ""));
      requestHeaders.set("x-user-email", String(payload.email || ""));
      requestHeaders.set("x-user-folder", String(payload.storageFolderKey || ""));

      const response = NextResponse.next({ request: { headers: requestHeaders } });
      return applySecurityHeaders(response, nonce);
    }
  }

  // 2. Access token missing/expired — try refresh token
  if (refreshToken) {
    const payload = await verify(refreshToken);
    if (payload?.type === "refresh" && payload.userId) {
      const newAccessToken = await freshAccessToken(payload);

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-nonce", nonce);
      requestHeaders.set("x-user-id", String(payload.userId));
      requestHeaders.set("x-user-name", String(payload.username || ""));
      requestHeaders.set("x-user-email", String(payload.email || ""));
      requestHeaders.set("x-user-folder", String(payload.storageFolderKey || ""));

      const response = NextResponse.next({ request: { headers: requestHeaders } });
      response.cookies.set(ACCESS_TOKEN_COOKIE, newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 15, // 15 minutes
        path: "/",
      });
      return applySecurityHeaders(response, nonce);
    }
  }

  // 3. For API routes, return 401 JSON instead of redirecting to /login HTML
  if (pathname.startsWith("/api/")) {
    const response = NextResponse.json(
      { error: "Unauthorized. Please sign in." },
      { status: 401 }
    );
    return applySecurityHeaders(response, nonce);
  }

  // 4. For page navigation, redirect to /login
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return applySecurityHeaders(response, nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
