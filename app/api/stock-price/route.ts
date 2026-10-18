import { NextRequest, NextResponse } from "next/server";
import { getMultipleStockQuotes, getStockQuote } from "@/lib/stock-api";
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

  const rateCheck = await checkRateLimit(`price:${ip}`, {
    maxRequests: 90,
    windowSeconds: 60,
  });

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded. Please wait before requesting prices.",
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
  const symbolsParam = searchParams.get("symbols");
  const symbolParam = searchParams.get("symbol");

  try {
    if (symbolParam) {
      const quote = await getStockQuote(symbolParam);
      return NextResponse.json({ quote });
    }

    if (symbolsParam) {
      const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (symbols.length > 50) {
        return NextResponse.json(
          { error: "Maximum 50 symbols allowed per request" },
          { status: 400 }
        );
      }
      const quotes = await getMultipleStockQuotes(symbols);
      return NextResponse.json({ quotes });
    }

    return NextResponse.json(
      { error: "Please provide ?symbols=AAPL,MSFT or ?symbol=AAPL" },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error("[Stock Price API] Error:", err);
    return NextResponse.json(
      { error: "Error fetching stock quotes" },
      { status: 500 }
    );
  }
}
