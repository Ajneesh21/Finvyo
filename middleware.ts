import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

const ACCESS_TOKEN_COOKIE = "finvyo_token";
const REFRESH_TOKEN_COOKIE = "finvyo_refresh";

function getSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET || "finvyo_default_jwt_secret_dev_32chars_len!";
  return new TextEncoder().encode(secret);
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page, register page, static assets, and auth endpoints
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // 1. Try access token first
  if (accessToken) {
    const payload = await verify(accessToken);
    if (payload?.type === "access" && payload.userId) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-user-id", String(payload.userId));
      requestHeaders.set("x-user-name", String(payload.username || ""));
      requestHeaders.set("x-user-email", String(payload.email || ""));
      requestHeaders.set("x-user-folder", String(payload.storageFolderKey || ""));

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }
  }

  // 2. Access token missing/expired — try refresh token
  if (refreshToken) {
    const payload = await verify(refreshToken);
    if (payload?.type === "refresh" && payload.userId) {
      const newAccessToken = await freshAccessToken(payload);

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-user-id", String(payload.userId));
      requestHeaders.set("x-user-name", String(payload.username || ""));
      requestHeaders.set("x-user-email", String(payload.email || ""));
      requestHeaders.set("x-user-folder", String(payload.storageFolderKey || ""));

      const response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });

      response.cookies.set(ACCESS_TOKEN_COOKIE, newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 15, // 15 minutes
        path: "/",
      });

      return response;
    }
  }

  // 3. For API routes, return 401 JSON instead of redirecting to /login HTML
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in." },
      { status: 401 }
    );
  }

  // 4. For page navigation, redirect to /login
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
