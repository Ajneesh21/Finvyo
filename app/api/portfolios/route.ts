import { NextRequest, NextResponse } from "next/server";
import {
  getAllPortfolios,
  getPortfolioById,
  savePortfolio,
  deletePortfolio,
  StoredPortfolio,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const list = await getAllPortfolios();
    return NextResponse.json({ portfolios: list });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error fetching portfolios", details: err?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const portfolio: StoredPortfolio = {
      id: body.id || `port-${Date.now()}`,
      name: body.name || "My Portfolio",
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions: body.transactions || [],
      sourceFileName: body.sourceFileName,
      isDefault: body.isDefault !== undefined ? body.isDefault : true,
    };

    const saved = await savePortfolio(portfolio);
    return NextResponse.json({ portfolio: saved });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error saving portfolio", details: err?.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
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
      existing.name = name;
    }
    if (isDefault !== undefined) {
      existing.isDefault = isDefault;
    }

    const saved = await savePortfolio(existing);
    return NextResponse.json({ portfolio: saved });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error updating portfolio", details: err?.message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
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
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error deleting portfolio", details: err?.message },
      { status: 500 }
    );
  }
}
