import { NextRequest, NextResponse } from "next/server";
import { computePortfolioSummary } from "@/lib/portfolio-engine";
import { checkRateLimit } from "@/lib/rate-limiter";
import { validateTransactionsList } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting per IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    const rateCheck = await checkRateLimit(`calc:${ip}`, {
      maxRequests: 45,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please wait before recalculating.",
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

    // 2. Parse & Validate Payload
    const body = await req.json();
    const validation = validateTransactionsList(body?.transactions, 5000);

    if (!validation.valid || !validation.validatedList) {
      return NextResponse.json(
        { error: validation.error || "Invalid transactions payload" },
        { status: 400 }
      );
    }

    const summary = await computePortfolioSummary(validation.validatedList);
    return NextResponse.json({ summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Calculate API Error]:", message);
    return NextResponse.json(
      { error: "Calculation failed", details: message },
      { status: 500 }
    );
  }
}
