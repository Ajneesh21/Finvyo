import { NextRequest, NextResponse } from "next/server";
import {
  getAllPortfolios,
  getPortfolioById,
  savePortfolio,
  deletePortfolio,
  StoredPortfolio,
} from "@/lib/storage";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { validateTransactionsList } from "@/lib/validation";
import { getAuthUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const resource = searchParams.get("resource") || "transactions";
    const pageStr = searchParams.get("page");
    const pageSizeStr = searchParams.get("pageSize");
    const search = searchParams.get("search")?.toLowerCase().trim();
    const type = searchParams.get("type");
    const sort = searchParams.get("sort") || "desc";
    const taxType = searchParams.get("taxType");

    // If requesting a specific portfolio's paginated resources
    if (id && pageStr) {
      const portfolio = await getPortfolioById(id, user.userId);
      if (!portfolio) {
        return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
      }

      const page = Math.max(1, parseInt(pageStr, 10));

      if (resource === "twr") {
        const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeStr || "10", 10)));
        const allTwr = portfolio.lastComputedSummary?.twrSubPeriods || [];
        const total = allTwr.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const startIndex = (page - 1) * pageSize;
        const paginatedTwr = allTwr.slice(startIndex, startIndex + pageSize);

        return NextResponse.json({
          id: portfolio.id,
          name: portfolio.name,
          twrSubPeriods: paginatedTwr,
          pagination: { page, pageSize, total, totalPages },
        });
      }

      if (resource === "trades") {
        const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeStr || "10", 10)));
        let allTrades = portfolio.lastComputedSummary?.realizedTrades || [];
        if (taxType && taxType !== "ALL") {
          allTrades = allTrades.filter((t) => t.taxType === taxType);
        }
        const total = allTrades.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const startIndex = (page - 1) * pageSize;
        const paginatedTrades = allTrades.slice(startIndex, startIndex + pageSize);

        return NextResponse.json({
          id: portfolio.id,
          name: portfolio.name,
          realizedTrades: paginatedTrades,
          pagination: { page, pageSize, total, totalPages },
        });
      }

      // Default resource: transactions
      const pageSize = Math.min(500, Math.max(1, parseInt(pageSizeStr || "25", 10)));
      let txs = portfolio.transactions;
      if (search) {
        txs = txs.filter(
          (t) =>
            t.symbol.toLowerCase().includes(search) ||
            (t.notes && t.notes.toLowerCase().includes(search)) ||
            t.type.toLowerCase().includes(search)
        );
      }
      if (type && type !== "ALL") {
        txs = txs.filter((t) => t.type === type);
      }

      // Sort
      txs = [...txs].sort((a, b) => {
        return sort === "desc"
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
      });

      const totalFees = txs.reduce((sum, t) => {
        if (t.type === "FEE" || t.type === "TAX") {
          return sum + Math.abs(t.amount || t.fee || 0);
        }
        return sum + (t.fee || 0);
      }, 0);

      const total = txs.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const startIndex = (page - 1) * pageSize;
      const paginatedTransactions = txs.slice(startIndex, startIndex + pageSize);

      return NextResponse.json({
        id: portfolio.id,
        name: portfolio.name,
        transactions: paginatedTransactions,
        totalFees,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      });
    }

    const list = await getAllPortfolios(user.userId);
    return NextResponse.json({ portfolios: list });
  } catch (err: unknown) {
    console.error("[Portfolios API GET] Error:", err);
    return NextResponse.json(
      { error: "Error fetching portfolios" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const cleanName =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().substring(0, 100)
        : "My Portfolio";

    const portfolio: StoredPortfolio = {
      id:
        typeof body.id === "string" && body.id.trim()
          ? body.id.trim()
          : `port-${Date.now()}`,
      name: cleanName,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions: validation.validatedList,
      sourceFileName:
        typeof body.sourceFileName === "string"
          ? body.sourceFileName.substring(0, 150)
          : undefined,
      isDefault: body.isDefault !== undefined ? Boolean(body.isDefault) : true,
      lastComputedSummary: body.lastComputedSummary || undefined,
      lastCalculatedAt: body.lastCalculatedAt || undefined,
    };

    const saved = await savePortfolio(portfolio, user.userId);
    return NextResponse.json({ portfolio: saved });
  } catch (err: unknown) {
    console.error("[Portfolios API POST] Error:", err);
    return NextResponse.json(
      { error: "Error saving portfolio" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const existing = await getPortfolioById(id, user.userId);
    if (!existing) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      );
    }

    if (name !== undefined) {
      existing.name =
        typeof name === "string" ? name.trim().substring(0, 100) : existing.name;
    }
    if (isDefault !== undefined) {
      existing.isDefault = Boolean(isDefault);
    }

    const saved = await savePortfolio(existing, user.userId);
    return NextResponse.json({ portfolio: saved });
  } catch (err: unknown) {
    console.error("[Portfolios API PATCH] Error:", err);
    return NextResponse.json(
      { error: "Error updating portfolio" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const success = await deletePortfolio(id, user.userId);
    return NextResponse.json({ success, id });
  } catch (err: unknown) {
    console.error("[Portfolios API DELETE] Error:", err);
    return NextResponse.json(
      { error: "Error deleting portfolio" },
      { status: 500 }
    );
  }
}
