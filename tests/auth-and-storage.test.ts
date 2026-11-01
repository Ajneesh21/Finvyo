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
  deleteUserStorageDirectory,
} from "../lib/user-storage";
import { validateFileSignature } from "../lib/pdf-parser";
import {
  withDistributedLock,
  blacklistToken,
  isTokenBlacklisted,
} from "../lib/redis";

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

  test("deletes user storage folder and cleans up files on disk", () => {
    const dir = getUserDirectory(testKey);
    assert.ok(fs.existsSync(dir), "User root directory must exist before delete");

    const deleted = deleteUserStorageDirectory(testKey);
    assert.equal(deleted, true, "Should return true on successful directory deletion");
    assert.equal(fs.existsSync(dir), false, "User root directory must not exist after delete");
  });

  test("creates files inside user folder and cleans them up completely on directory deletion", () => {
    const key = "testcleanup_99887766";
    const dir = getUserDirectory(key);
    const dummyFile = path.join(dir, "statements", "dummy_statement.xlsx");
    fs.writeFileSync(dummyFile, "test data");
    assert.ok(fs.existsSync(dummyFile), "Dummy statement file must exist");

    const deleted = deleteUserStorageDirectory(key);
    assert.equal(deleted, true, "Should return true on successful directory deletion");
    assert.equal(fs.existsSync(dir), false, "User root directory must not exist after delete");
    assert.equal(fs.existsSync(dummyFile), false, "Files inside must be completely wiped");
  });
});

describe("File Signature & Magic-Byte Validation", () => {
  test("accepts valid PDF magic bytes", () => {
    const validPdf = Buffer.from("%PDF-1.7\n%some content...");
    const result = validateFileSignature(validPdf, "statement.pdf");
    assert.equal(result.valid, true);
    assert.equal(result.detectedType, "pdf");
    assert.equal(result.mimeType, "application/pdf");
  });

  test("rejects PDF file missing %PDF- header", () => {
    const invalidPdf = Buffer.from("Hello world not a pdf");
    const result = validateFileSignature(invalidPdf, "statement.pdf");
    assert.equal(result.valid, false);
    assert.match(result.error || "", /valid PDF header/);
  });

  test("accepts valid XLSX ZIP magic bytes", () => {
    const validXlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    const result = validateFileSignature(validXlsx, "transactions.xlsx");
    assert.equal(result.valid, true);
    assert.equal(result.detectedType, "xlsx");
    assert.equal(result.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  test("rejects XLSX missing PK ZIP header", () => {
    const fakeXlsx = Buffer.from("Plain text content in an xlsx file");
    const result = validateFileSignature(fakeXlsx, "transactions.xlsx");
    assert.equal(result.valid, false);
    assert.match(result.error || "", /valid ZIP\/OpenXML/);
  });

  test("rejects Windows PE executable disguised as any format", () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]); // 'MZ'
    const resPdf = validateFileSignature(exeBuffer, "malicious.pdf");
    assert.equal(resPdf.valid, false);
    assert.match(resPdf.error || "", /Windows binary/);

    const resCsv = validateFileSignature(exeBuffer, "malicious.csv");
    assert.equal(resCsv.valid, false);
    assert.match(resCsv.error || "", /Windows binary/);
  });

  test("rejects Linux ELF binary disguised as any format", () => {
    const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]); // '\x7fELF'
    const res = validateFileSignature(elfBuffer, "exploit.xlsx");
    assert.equal(res.valid, false);
    assert.match(res.error || "", /Linux binary/);
  });

  test("rejects CSV with binary null bytes", () => {
    const binaryInCsv = Buffer.from("Date,Symbol,Price\x00\x00\x01\x02");
    const res = validateFileSignature(binaryInCsv, "trades.csv");
    assert.equal(res.valid, false);
    assert.match(res.error || "", /binary null bytes/);
  });

  test("accepts clean CSV and TXT statements", () => {
    const cleanCsv = Buffer.from("Date,Symbol,Type,Amount\n2026-01-01,AAPL,BUY,150.00\n");
    const resCsv = validateFileSignature(cleanCsv, "trades.csv");
    assert.equal(resCsv.valid, true);
    assert.equal(resCsv.detectedType, "csv");

    const cleanTxt = Buffer.from("2026-08-24 SPUR 509.8 Meta Platforms Inc\n");
    const resTxt = validateFileSignature(cleanTxt, "activity.txt");
    assert.equal(resTxt.valid, true);
    assert.equal(resTxt.detectedType, "txt");
  });
});

describe("Distributed Locking (Redlock) & Server-Side Token Blacklisting", () => {
  test("withDistributedLock serializes concurrent critical sections safely", async () => {
    const order: number[] = [];
    const resource = `test-resource-${Date.now()}`;

    const task1 = withDistributedLock(resource, async () => {
      await new Promise((r) => setTimeout(r, 50));
      order.push(1);
      return "result1";
    });

    const task2 = withDistributedLock(resource, async () => {
      order.push(2);
      return "result2";
    });

    const [r1, r2] = await Promise.all([task1, task2]);
    assert.equal(r1, "result1");
    assert.equal(r2, "result2");
    assert.deepEqual(order, [1, 2], "Task 1 must complete before Task 2 enters critical section");
  });

  test("blacklists revoked tokens and prevents verification", async () => {
    const testUser: AuthUser = {
      userId: "revoked-usr-1",
      username: "revokeduser",
      email: "revoked@example.com",
      storageFolderKey: "revoked_12345678",
      role: "user",
    };

    const token = await signAccessToken(testUser);
    const validPayload = await verifyToken(token);
    assert.ok(validPayload !== null, "Token should be valid before revocation");

    // Revoke token
    await blacklistToken(token, 300);
    const isRevoked = await isTokenBlacklisted(token);
    assert.equal(isRevoked, true, "Token should report as revoked in blacklist");

    // verifyToken should reject blacklisted token
    const revokedPayload = await verifyToken(token);
    assert.equal(revokedPayload, null, "verifyToken must return null for blacklisted token");
  });
});
