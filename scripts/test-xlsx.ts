import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { parseVestedSpreadsheetSheets } from "../lib/vested-sheet-parser";
import { computePortfolioSummary } from "../lib/portfolio-engine";

async function testXlsx() {
  console.log("=== TESTING VESTED SPREADSHEET PARSER WITH MULTI-SHEET EXCEL/NUMBERS ===");

  // Read CSV files exported from Transactions2
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

  // Create an in-memory XLSX workbook with all 4 sheets
  const wb = XLSX.utils.book_new();
  for (const [name, csv] of Object.entries(sheetMap)) {
    const cleanName = name.replace(".csv", "").replace("-Table 1", "").substring(0, 30);
    const rows = csv.split(/\r?\n/).map(line => line.split(","));
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, cleanName);
  }

  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  fs.writeFileSync(path.join(process.cwd(), "Transactions2.xlsx"), xlsxBuffer);
  console.log("Created Transactions2.xlsx!");

  // Parse XLSX buffer
  const parsedWb = XLSX.read(xlsxBuffer, { type: "buffer" });
  const xlsxSheetMap: Record<string, string> = {};
  for (const sheetName of parsedWb.SheetNames) {
    xlsxSheetMap[sheetName] = XLSX.utils.sheet_to_csv(parsedWb.Sheets[sheetName]);
  }

  const result = parseVestedSpreadsheetSheets(xlsxSheetMap);
  console.log(`Parsed ${result.transactions.length} transactions from XLSX!`);
  console.log("Account Info Cash Balance:", result.accountInfo?.cashBalance);

  const summary = await computePortfolioSummary(result.transactions);
  console.log("\n==========================================");
  console.log(`Total Portfolio Value: $${summary.totalValue}`);
  console.log(`Cash Balance / Buying Power: $${summary.cashBalance}`);
  console.log(`Net Invested Capital: $${summary.netInvestedCapital}`);
  console.log(`Unrealized P&L: $${summary.unrealizedPnL} (${summary.unrealizedPnLPercent}%)`);
  console.log(`Dividends & Interest: $${summary.totalDividends}`);
  console.log(`Time-Weighted Return (TWR): ${summary.twrPercent}%`);
  console.log("==========================================");
}

testXlsx().catch(console.error);
