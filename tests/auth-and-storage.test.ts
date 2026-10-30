import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  hashPassword,
  verifyPassword,
  generateStorageFolderKey,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  AuthUser,
} from "../lib/auth";
import {
  getUserDirectory,
  resolveUserFilePath,
} from "../lib/user-storage";

describe("Lightweight Built-In Auth & Crypto", () => {
  test("hashes passwords and verifies correct matches", async () => {
    const rawPass = "SuperSecret_123$!";
    const hash = await hashPassword(rawPass);

    assert.ok(hash.includes(":"), "Hash must contain salt delimiter");

    const isMatch = await verifyPassword(rawPass, hash);
    assert.equal(isMatch, true, "Valid password should verify successfully");

    const isBadMatch = await verifyPassword("WrongPassword123", hash);
    assert.equal(isBadMatch, false, "Invalid password should fail verification");
  });

  test("generates safe, sanitized storage folder keys", () => {
    const key1 = generateStorageFolderKey("Ajneesh.Patil!");
    assert.match(
      key1,
      /^ajneeshpatil_[a-f0-9]{8}$/,
      "Folder key should be sanitized to alphanumeric with hex suffix"
    );

    const key2 = generateStorageFolderKey("../../etc/passwd");
    assert.ok(
      !key2.includes("..") && !key2.includes("/"),
      "Must not contain path traversal characters"
    );
  });

  test("signs and verifies JWT access and refresh tokens with user payload", async () => {
    const testUser: AuthUser = {
      userId: "usr-12345",
      username: "ajneesh",
      email: "ajneesh@example.com",
      storageFolderKey: "ajneesh_12345678",
      role: "user",
    };

    const accessToken = await signAccessToken(testUser);
    assert.ok(typeof accessToken === "string" && accessToken.length > 20);

    const verifiedAccess = await verifyToken(accessToken);
    assert.ok(verifiedAccess !== null);
    assert.equal(verifiedAccess.userId, testUser.userId);
    assert.equal(verifiedAccess.username, testUser.username);
    assert.equal(verifiedAccess.storageFolderKey, testUser.storageFolderKey);
    assert.equal(verifiedAccess.type, "access");

    const refreshToken = await signRefreshToken(testUser);
    const verifiedRefresh = await verifyToken(refreshToken);
    assert.ok(verifiedRefresh !== null);
    assert.equal(verifiedRefresh.userId, testUser.userId);
    assert.equal(verifiedRefresh.type, "refresh");
  });
});

describe("User-Isolated Folder Storage & Security", () => {
  const testKey = "testuser_a1b2c3d4";

  test("creates and ensures user directory structure", () => {
    const dir = getUserDirectory(testKey);
    assert.ok(fs.existsSync(dir), "User root directory must exist");
    assert.ok(fs.existsSync(path.join(dir, "statements")), "Statements folder must exist");
    assert.ok(fs.existsSync(path.join(dir, "exports")), "Exports folder must exist");
  });

  test("rejects malformed or malicious storage folder keys", () => {
    assert.throws(
      () => getUserDirectory("../../../etc"),
      /Invalid storage folder key/,
      "Must reject path traversal in key"
    );

    assert.throws(
      () => getUserDirectory("user/evil"),
      /Invalid storage folder key/,
      "Must reject slashes in key"
    );
  });

  test("resolves paths strictly within user isolated directory", () => {
    const validPath = resolveUserFilePath(testKey, "statements/report.xlsx");
    assert.ok(validPath.includes(testKey));
    assert.ok(validPath.endsWith("statements/report.xlsx"));

    // Attempt directory escape
    assert.throws(
      () => resolveUserFilePath(testKey, "../../passwords.txt"),
      /Path traversal detected/,
      "Must block relative directory escape"
    );

    assert.throws(
      () => resolveUserFilePath(testKey, "../other_user/secret.pdf"),
      /Path traversal detected/,
      "Must block crossing into another user's directory"
    );
  });
});
