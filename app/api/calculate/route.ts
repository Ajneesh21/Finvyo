import { NextRequest, NextResponse } from "next/server";
import { computePortfolioSummary } from "@/lib/portfolio-engine";
import { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transactions: Transaction[] = body.transactions || [];

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json(
        { error: "No transactions provided" },
        { status: 400 }
      );
    }

    const summary = await computePortfolioSummary(transactions);
    return NextResponse.json({ summary });
  } catch (err: any) {
    console.error("[Calculate API Error]:", err);
    return NextResponse.json(
      { error: "Calculation failed", details: err?.message },
      { status: 500 }
    );
  }
}
