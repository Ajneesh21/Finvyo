import { NextRequest, NextResponse } from "next/server";
import { getMultipleStockQuotes, getStockQuote } from "@/lib/stock-api";
import { checkRateLimit } from "@/lib/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

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
      const quotes = await getMultipleStockQuotes(symbols);
      return NextResponse.json({ quotes });
    }

    return NextResponse.json(
      { error: "Please provide ?symbols=AAPL,MSFT or ?symbol=AAPL" },
      { status: 400 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Error fetching stock quotes", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
