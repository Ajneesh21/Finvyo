import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import pdfParse from "pdf-parse";
import { parseVestedStatementText, parseVestedXlsxBuffer } from "@/lib/pdf-parser";
import { parseVestedSpreadsheetSheets } from "@/lib/vested-sheet-parser";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const tempFilesToClean: string[] = [];

  try {
    // 1. Rate Limiting per IP
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(`parse-pdf:${ip}`, {
      maxRequests: 30,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please wait.",
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

    // 2. File size check via content-length header
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Payload too large. Maximum allowed size is 10MB." },
        { status: 413 }
      );
    }

    const contentType = req.headers.get("content-type") || "";

    // Case 1: JSON with pasted raw text
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const rawText = body.text || "";
      if (!rawText.trim()) {
        return NextResponse.json(
          { error: "No text provided" },
          { status: 400 }
        );
      }
      const result = parseVestedStatementText(rawText);
      return NextResponse.json(result);
    }

    // Case 2: Multipart Form Data with PDF, XLSX, CSV file
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum allowed size is 10MB." },
        { status: 413 }
      );
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. If Apple Numbers (.numbers) file - unsupported (osascript execution removed for security)
    if (fileName.endsWith(".numbers")) {
      return NextResponse.json(
        {
          error:
            "Apple Numbers (.numbers) format is not supported. Please export and upload your statement in Excel (.xlsx), PDF (.pdf), or CSV (.csv) format.",
        },
        { status: 400 }
      );
    }

    // 2. If PDF (.pdf) file
    if (fileName.endsWith(".pdf")) {
      const pdfData = await pdfParse(buffer);
      const result = parseVestedStatementText(pdfData.text);
      return NextResponse.json(result);
    }

    // 3. If Excel file (.xlsx or .xls)
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      try {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheetMap: Record<string, string> = {};
        for (const sheetName of workbook.SheetNames) {
          const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          sheetMap[sheetName] = csvText;
        }

        const result = parseVestedSpreadsheetSheets(sheetMap);
        if (result.success && result.transactions.length > 0) {
          return NextResponse.json(result);
        }
      } catch {
        // Fallback to single sheet parser
      }

      const result = parseVestedXlsxBuffer(buffer);
      return NextResponse.json(result);
    }

    // 4. If CSV file (.csv)
    if (fileName.endsWith(".csv")) {
      const text = buffer.toString("utf-8");
      try {
        const sheetResult = parseVestedSpreadsheetSheets({ Sheet1: text });
        if (sheetResult.success && sheetResult.transactions.length > 0) {
          return NextResponse.json(sheetResult);
        }
      } catch {
        // Fallback to text parsing
      }

      const result = parseVestedStatementText(text);
      return NextResponse.json(result);
    }

    // 5. If plain text file (.txt)
    if (fileName.endsWith(".txt")) {
      const text = buffer.toString("utf-8");
      const parsedTextResult = parseVestedStatementText(text);
      return NextResponse.json(parsedTextResult);
    }

    // Unsupported format
    return NextResponse.json(
      {
        error:
          "Unsupported file format. Please upload your statement in PDF (.pdf), Excel (.xlsx), or CSV (.csv) format.",
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error("[Parse PDF API] Error:", err);
    return NextResponse.json(
      { error: "Failed to process statement file" },
      { status: 500 }
    );
  } finally {
    // Clean up any temporary files tracked in tempFilesToClean
    for (const tempPath of tempFilesToClean) {
      try {
        if (fs.existsSync(tempPath)) {
          const stat = fs.statSync(tempPath);
          if (stat.isDirectory()) {
            fs.rmSync(tempPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(tempPath);
          }
        }
      } catch (cleanupErr) {
        console.error("[Parse PDF API] Cleanup error:", tempPath, cleanupErr);
      }
    }
  }
}
