import { NextRequest, NextResponse } from "next/server";
import { computePortfolioSummary } from "@/lib/portfolio-engine";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { validateTransactionsList } from "@/lib/validation";
import { updatePortfolioSummary } from "@/lib/storage";
import { getAuthUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting per IP
    const ip = getClientIp(req);

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

    if (typeof body?.portfolioId === "string" && body.portfolioId.trim()) {
      const user = await getAuthUserFromRequest(req);
      if (user) {
        updatePortfolioSummary(body.portfolioId.trim(), summary, user.userId).catch((err) => {
          console.error("[Calculate API] Failed to update stored portfolio summary:", err);
        });
      }
    }

    return NextResponse.json({ summary });
  } catch (err: unknown) {
    console.error("[Calculate API] Error:", err);
    return NextResponse.json(
      { error: "Calculation failed" },
      { status: 500 }
    );
  }
}
