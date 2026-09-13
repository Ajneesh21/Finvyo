import { Transaction, ParsedPdfResult } from "./types";
import { normalizeDateString } from "./pdf-parser";

/**
 * Parses multi-sheet Vested export (from Numbers, Excel XLSX, or folder of CSVs)
 */
export function parseVestedSpreadsheetSheets(
  sheetMap: Record<string, string | any[][]>
): ParsedPdfResult {
  const transactions: Transaction[] = [];
  let txCounter = 1;
  let latestAccountBalance: number | undefined;

  // Find sheet by name regex
  const findSheet = (pattern: RegExp) => {
    for (const key of Object.keys(sheetMap)) {
      if (pattern.test(key)) {
        return sheetMap[key];
      }
    }
    return null;
  };

  const parseRowsFromSheet = (content: string | any[][]): Record<string, string>[] => {
    if (Array.isArray(content)) {
      if (content.length === 0) return [];
      const headers = content[0].map((h: any) =>
        String(h || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      );
      const rows: Record<string, string>[] = [];
      for (let r = 1; r < content.length; r++) {
        const rowObj: Record<string, string> = {};
        for (let c = 0; c < headers.length; c++) {
          rowObj[headers[c]] = String(content[r][c] || "").trim();
        }
        rows.push(rowObj);
      }
      return rows;
    } else if (typeof content === "string") {
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) return [];
      const rawHeaders = lines[0].split(",").map((h) =>
        h
          .replace(/["']/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .trim()
      );

      const rows: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values: string[] = [];
        let inQuotes = false;
        let cur = "";

        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            values.push(cur.trim());
            cur = "";
          } else {
            cur += char;
          }
        }
        values.push(cur.trim());

        const rowObj: Record<string, string> = {};
        for (let c = 0; c < rawHeaders.length; c++) {
          rowObj[rawHeaders[c]] = (values[c] || "").replace(/["']/g, "").trim();
        }
        rows.push(rowObj);
      }
      return rows;
    }
    return [];
  };

  function parseDateTimeIso(dateStr: string, timeStr?: string): string {
    const normDate = normalizeDateString(dateStr) || "2026-01-01";
    if (!timeStr || !timeStr.trim()) return normDate;

    try {
      const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const min = timeMatch[2];
        const sec = timeMatch[3] || "00";
        const ampm = (timeMatch[4] || "").toUpperCase();

        if (ampm === "PM" && hour < 12) hour += 12;
        if (ampm === "AM" && hour === 12) hour = 0;

        const hh = String(hour).padStart(2, "0");
        return `${normDate}T${hh}:${min}:${sec}`;
      }
    } catch {}

    return normDate;
  }

  // 0. Parse All Transactions Sheet for exact running Account Balance
  const allTxSheet = findSheet(/all\s*transactions/i);
  const balanceByDateTime: Record<string, number> = {};

  if (allTxSheet) {
    const rows = parseRowsFromSheet(allTxSheet);
    for (const r of rows) {
      const dt = parseDateTimeIso(r["date"] || r["datetime"] || "", r["timeinutc"] || r["time"] || "");
      const balStr = r["accountbalance"] || r["balance"] || r["buyingpower"] || "";
      if (balStr) {
        const bal = parseFloat(balStr.replace(/[^0-9.-]/g, ""));
        if (!isNaN(bal)) {
          balanceByDateTime[dt] = bal;
          if (latestAccountBalance === undefined) {
            // Since All Transactions is listed with newest on top
            latestAccountBalance = bal;
          }
        }
      }
    }
  }

  // 1. Parse Transfers (Deposits & Withdrawals)
  const transfersSheet = findSheet(/transfers/i);
  if (transfersSheet) {
    const rows = parseRowsFromSheet(transfersSheet);
    for (const r of rows) {
      const dt = parseDateTimeIso(r["date"] || r["datetime"] || "", r["timeinutc"] || r["time"] || "");
      const activity = (r["activity"] || r["type"] || "Deposit").toUpperCase();
      const amount = Math.abs(parseFloat(r["cashamountinusd"] || r["amount"] || "0") || 0);
      const bal = balanceByDateTime[dt];

      if (dt && amount > 0) {
        const isDeposit = activity.includes("DEP") || activity.includes("REC") || !activity.includes("WITH");
        transactions.push({
          id: `tx-dep-${txCounter++}`,
          date: dt,
          symbol: "CASH",
          type: isDeposit ? "DEPOSIT" : "WITHDRAWAL",
          shares: 0,
          price: 1,
          amount: isDeposit ? amount : -amount,
          accountBalance: bal,
          notes: `Bank Transfer (${activity})`,
        });
      }
    }
  }

  // 2. Parse Trades (Stock Buys & Sells)
  const tradesSheet = findSheet(/trades/i);
  if (tradesSheet) {
    const rows = parseRowsFromSheet(tradesSheet);
    // Sort chronological: oldest to newest
    const sortedTradeRows = [...rows].sort((a, b) => {
      const dtA = parseDateTimeIso(a["date"] || "", a["timeinutc"] || a["time"] || "");
      const dtB = parseDateTimeIso(b["date"] || "", b["timeinutc"] || b["time"] || "");
      return dtA.localeCompare(dtB);
    });

    for (const r of sortedTradeRows) {
      const dt = parseDateTimeIso(r["date"] || r["datetime"] || "", r["timeinutc"] || r["time"] || "");
      const ticker = (r["ticker"] || r["symbol"] || r["security"] || "").toUpperCase();
      const activity = (r["activity"] || r["type"] || r["side"] || "Buy").toUpperCase();
      const shares = Math.abs(parseFloat(r["quantity"] || r["shares"] || r["qty"] || "0") || 0);
      const price = Math.abs(parseFloat(r["pricepershareinusd"] || r["price"] || "0") || 0);
      const amount = Math.abs(parseFloat(r["cashamountinusd"] || r["amount"] || "0") || shares * price);
      const fee = Math.abs(parseFloat(r["commissionchargesinusd"] || r["fee"] || "0") || 0);
      const bal = balanceByDateTime[dt];

      if (dt && ticker && (shares > 0 || amount > 0)) {
        const isBuy = activity.includes("BUY") || activity.includes("PURCHASE");
        transactions.push({
          id: `tx-trade-${txCounter++}`,
          date: dt,
          symbol: ticker,
          type: isBuy ? "BUY" : "SELL",
          shares: shares > 0 ? shares : price > 0 ? Number((amount / price).toFixed(6)) : 1,
          price: price > 0 ? price : Number((amount / (shares || 1)).toFixed(2)),
          amount: isBuy ? -amount : amount,
          fee,
          accountBalance: bal,
          notes: `${r["name"] || ticker} ${activity} (${dt})`,
        });
      }
    }
  }

  // 3. Parse Income (Dividends, Interest, Taxes)
  const incomeSheet = findSheet(/income/i);
  if (incomeSheet) {
    const rows = parseRowsFromSheet(incomeSheet);
    for (const r of rows) {
      const dt = parseDateTimeIso(r["date"] || r["datetime"] || "", r["timeinutc"] || r["time"] || "");
      const activity = (r["activity"] || r["type"] || "").toUpperCase();
      const ticker = (r["ticker"] || r["symbol"] || "USD").toUpperCase();
      const amount = parseFloat(r["grosscashamountinusd"] || r["amount"] || "0") || 0;
      const bal = balanceByDateTime[dt];

      if (dt && amount !== 0) {
        if (activity.includes("DIVIDEND")) {
          transactions.push({
            id: `tx-inc-${txCounter++}`,
            date: dt,
            symbol: ticker !== "USD" ? ticker : "CASH",
            type: "DIVIDEND",
            shares: 0,
            price: 0,
            amount: Math.abs(amount),
            accountBalance: bal,
            notes: `Dividend from ${ticker}`,
          });
        } else if (activity.includes("TAX")) {
          transactions.push({
            id: `tx-inc-${txCounter++}`,
            date: dt,
            symbol: ticker,
            type: "TAX",
            shares: 0,
            price: 0,
            amount: -Math.abs(amount),
            accountBalance: bal,
            notes: `Tax Withholding on ${ticker}`,
          });
        } else if (activity.includes("INTEREST")) {
          transactions.push({
            id: `tx-inc-${txCounter++}`,
            date: dt,
            symbol: "CASH",
            type: "DIVIDEND",
            shares: 0,
            price: 0,
            amount: Math.abs(amount),
            accountBalance: bal,
            notes: "Cash Interest Income",
          });
        }
      }
    }
  }

  // Sort all transactions chronologically
  const typePriority: Record<string, number> = {
    DEPOSIT: 1,
    BUY: 2,
    DIVIDEND: 3,
    SELL: 4,
    TAX: 5,
    FEE: 6,
    WITHDRAWAL: 7,
  };

  transactions.sort((a, b) => {
    const dComp = a.date.localeCompare(b.date);
    if (dComp !== 0) return dComp;
    const pA = typePriority[a.type] || 5;
    const pB = typePriority[b.type] || 5;
    return pA - pB;
  });

  return {
    success: transactions.length > 0,
    transactions,
    accountInfo: {
      brokerName: "Vested Finance / DriveWealth",
      cashBalance: latestAccountBalance,
    },
    totalTransactionsParsed: transactions.length,
    errors: transactions.length === 0 ? ["No transactions found in spreadsheet sheets."] : [],
  };
}
