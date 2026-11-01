import { NextRequest, NextResponse } from "next/server";
import { getStockDailyHistory } from "@/lib/stock-api";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { getAuthUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in to view stock history." },
      { status: 401 }
    );
  }

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
