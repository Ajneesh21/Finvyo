import { NextRequest, NextResponse } from "next/server";
import {
  getAllPortfolios,
  getPortfolioById,
  savePortfolio,
  deletePortfolio,
  StoredPortfolio,
} from "@/lib/storage";
import { checkRateLimit } from "@/lib/rate-limiter";
import { validateTransactionsList } from "@/lib/validation";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(`portfolios:get:${ip}`, {
      maxRequests: 60,
      windowSeconds: 60,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait.", retryAfter: rateCheck.resetInSeconds },
        { status: 429, headers: { "Retry-After": String(rateCheck.resetInSeconds) } }
      );
    }

    const list = await getAllPortfolios();
    return NextResponse.json({ portfolios: list });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Error fetching portfolios", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(`portfolios:post:${ip}`, {
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait.", retryAfter: rateCheck.resetInSeconds },
        { status: 429, headers: { "Retry-After": String(rateCheck.resetInSeconds) } }
      );
    }

    // 2. Payload size check
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Payload too large. Maximum allowed size is 5MB." },
        { status: 413 }
      );
    }

    const body = await req.json();

    // 3. Transactions validation
    const validation = validateTransactionsList(body?.transactions || [], 5000);
    if (!validation.valid || !validation.validatedList) {
      return NextResponse.json(
        { error: validation.error || "Invalid transactions payload" },
        { status: 400 }
      );
    }

    const cleanName = typeof body.name === "string" && body.name.trim()
      ? body.name.trim().substring(0, 100)
      : "My Portfolio";

    const portfolio: StoredPortfolio = {
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : `port-${Date.now()}`,
      name: cleanName,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions: validation.validatedList,
      sourceFileName: typeof body.sourceFileName === "string" ? body.sourceFileName.substring(0, 150) : undefined,
      isDefault: body.isDefault !== undefined ? Boolean(body.isDefault) : true,
    };

    const saved = await savePortfolio(portfolio);
    return NextResponse.json({ portfolio: saved });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Error saving portfolio", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(`portfolios:patch:${ip}`, {
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait.", retryAfter: rateCheck.resetInSeconds },
        { status: 429, headers: { "Retry-After": String(rateCheck.resetInSeconds) } }
      );
    }

    const body = await req.json();
    const { id, name, isDefault } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing id parameter in request body" },
        { status: 400 }
      );
    }

    const existing = await getPortfolioById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    if (name !== undefined) {
      existing.name = typeof name === "string" ? name.trim().substring(0, 100) : existing.name;
    }
    if (isDefault !== undefined) {
      existing.isDefault = Boolean(isDefault);
    }

    const saved = await savePortfolio(existing);
    return NextResponse.json({ portfolio: saved });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Error updating portfolio", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(`portfolios:delete:${ip}`, {
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait.", retryAfter: rateCheck.resetInSeconds },
        { status: 429, headers: { "Retry-After": String(rateCheck.resetInSeconds) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing ?id= parameter" },
        { status: 400 }
      );
    }

    const success = await deletePortfolio(id);
    return NextResponse.json({ success, id });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Error deleting portfolio", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
