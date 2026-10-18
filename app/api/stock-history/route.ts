import { NextRequest, NextResponse } from "next/server";
import { getStockDailyHistory } from "@/lib/stock-api";
import { checkRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  // When behind a trusted reverse proxy (Vercel, Cloudflare), prefer req.ip
  // In direct-access mode, X-Forwarded-For can be spoofed
  return (
    (req as any).ip ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateCheck = await checkRateLimit(`history:${ip}`, {
    maxRequests: 60,
    windowSeconds: 60,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Please wait before requesting history.",
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

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "^GSPC";
  const startDate = searchParams.get("startDate") || "2022-01-01";

  const symbolRegex = /^[A-Z0-9.\^=_-]{1,10}$/i;
  if (!symbolRegex.test(symbol)) {
    return NextResponse.json(
      { error: "Invalid symbol parameter" },
      { status: 400 }
    );
  }

  try {
    const history = await getStockDailyHistory(symbol, startDate);
    return NextResponse.json({ symbol, history });
  } catch (err: unknown) {
    console.error("[Stock History API] Error:", err);
    return NextResponse.json(
      { error: "Error fetching stock history" },
      { status: 500 }
    );
  }
}
