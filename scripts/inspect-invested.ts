import fs from "fs";
import path from "path";
import { parseVestedSpreadsheetSheets } from "../lib/vested-sheet-parser";
import { computePortfolioSummary } from "../lib/portfolio-engine";

async function inspectInvested() {
  const csvDir = path.join(process.cwd(), "Transactions2.csv");
  const sheetMap: Record<string, string> = {};

  if (fs.existsSync(csvDir)) {
    const files = fs.readdirSync(csvDir);
    for (const f of files) {
      if (f.endsWith(".csv")) {
        sheetMap[f] = fs.readFileSync(path.join(csvDir, f), "utf-8");
      }
    }
  }

  const result = parseVestedSpreadsheetSheets(sheetMap);
  console.log("Total Transactions:", result.transactions.length);

  // Group by type
  let depTotal = 0;
  let buyTotal = 0;
  let sellTotal = 0;
  let divTotal = 0;
  let feeTotal = 0;

  for (const t of result.transactions) {
    if (t.type === "DEPOSIT") depTotal += Math.abs(t.amount);
    if (t.type === "BUY") buyTotal += Math.abs(t.amount);
    if (t.type === "SELL") sellTotal += Math.abs(t.amount);
    if (t.type === "DIVIDEND") divTotal += Math.abs(t.amount);
    if (t.fee) feeTotal += t.fee;
  }

  console.log({ depTotal, buyTotal, sellTotal, divTotal, feeTotal });

  const summary = await computePortfolioSummary(result.transactions);
  console.log("\nSummary Metrics:");
  console.log("totalDeposits:", summary.totalDeposits);
  console.log("netInvestedCapital:", summary.netInvestedCapital);
  console.log("cashBalance:", summary.cashBalance);
  console.log("totalValue:", summary.totalValue);
  console.log("totalFees:", summary.totalFees);
  console.log("totalDividends:", summary.totalDividends);
}

inspectInvested().catch(console.error);
