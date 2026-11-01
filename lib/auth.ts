import { SignJWT, jwtVerify, JWTPayload } from "jose";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { isTokenBlacklisted } from "./redis";

export const ACCESS_TOKEN_COOKIE = "finvyo_token";
export const REFRESH_TOKEN_COOKIE = "finvyo_refresh";
export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY = "30d";

export interface AuthUser {
  userId: string;
  username: string;
  email: string;
  storageFolderKey: string;
  role?: string;
}

export interface UserJwtPayload extends JWTPayload, AuthUser {
  type: "access" | "refresh";
}

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
 * Native Node.js cryptographic password hashing using scrypt with random salt.
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Constant-time string comparison to prevent timing attack leaks on plain secrets.
 */
export function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Constant-time password verification to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return resolve(false);

    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const keyBuffer = Buffer.from(key, "hex");
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Creates a safe, collision-resistant storage folder key for a user.
 * e.g., 'ajneesh_a9f14b2c'
 */
export function generateStorageFolderKey(username: string): string {
  const clean = username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${clean}_${suffix}`;
}

export async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    username: user.username,
    email: user.email,
    storageFolderKey: user.storageFolderKey,
    role: user.role || "user",
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getSecret());
}

export async function signRefreshToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    username: user.username,
    email: user.email,
    storageFolderKey: user.storageFolderKey,
    role: user.role || "user",
    type: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(
  token: string
): Promise<UserJwtPayload | null> {
  try {
    if (await isTokenBlacklisted(token)) {
      return null;
    }
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as UserJwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the current authenticated user from request cookies or forwarded headers.
 */
export async function getAuthUserFromRequest(
  req: NextRequest
): Promise<AuthUser | null> {
  // Check access token cookie first
  const accessToken = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken) {
    const payload = await verifyToken(accessToken);
    if (payload && payload.userId && payload.type === "access") {
      return {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        storageFolderKey: payload.storageFolderKey,
        role: payload.role,
      };
    }
  }

  // Fallback to refresh token if present
  const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    const payload = await verifyToken(refreshToken);
    if (payload && payload.userId && payload.type === "refresh") {
      return {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        storageFolderKey: payload.storageFolderKey,
        role: payload.role,
      };
    }
  }

  // Check Bearer authorization header if present
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    const payload = await verifyToken(bearerToken);
    if (payload && payload.userId) {
      return {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        storageFolderKey: payload.storageFolderKey,
        role: payload.role,
      };
    }
  }

  // In automated test runner only, allow internal headers for unit test mocks
  if (process.env.NODE_ENV === "test") {
    const headerUserId = req.headers.get("x-user-id");
    const headerUsername = req.headers.get("x-user-name");
    const headerFolder = req.headers.get("x-user-folder");
    if (headerUserId && headerUsername && headerFolder) {
      return {
        userId: headerUserId,
        username: headerUsername,
        email: req.headers.get("x-user-email") || "",
        storageFolderKey: headerFolder,
        role: "user",
      };
    }
  }

  return null;
}
