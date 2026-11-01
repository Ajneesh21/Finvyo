import { NextRequest, NextResponse } from "next/server";
import { getMultipleStockQuotes, getStockQuote } from "@/lib/stock-api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { getAuthUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in to view stock prices." },
      { status: 401 }
    );
  }

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
