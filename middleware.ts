import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

const ACCESS_TOKEN_COOKIE = "finvyo_token";
const REFRESH_TOKEN_COOKIE = "finvyo_refresh";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || "");
}

async function verify(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

async function freshAccessToken(): Promise<string> {
  return new SignJWT({ role: "admin", type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret());
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth API through
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 1. Try access token first
  if (accessToken) {
    const payload = await verify(accessToken);
    if (payload?.type === "access") {
      return NextResponse.next(); // ✅ Valid access token
    }
  }

  // 2. Access token missing/expired — try refresh token
  if (refreshToken) {
    const payload = await verify(refreshToken);
    if (payload?.type === "refresh") {
      // ✅ Valid refresh token — silently issue new access token
      const newAccessToken = await freshAccessToken();
      const response = NextResponse.next();
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

  // 3. Both tokens invalid — redirect to login
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};

