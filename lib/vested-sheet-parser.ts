import { Transaction, ParsedPdfResult } from "./types";
import { normalizeDateString, resolveTickerFromLine } from "./pdf-parser";

/**
 * Parses Vested / DriveWealth spreadsheet exports (supports new single-sheet stacked format,
 * multi-sheet XLSX/Numbers exports, and single-table CSV exports).
 */
export function parseVestedSpreadsheetSheets(
  sheetMap: Record<string, string | any[][]>
): ParsedPdfResult {
  const transactions: Transaction[] = [];
  let txCounter = 1;
  let latestAccountBalance: number | undefined;
  let latestBalanceDateStr = "";

  let investorName: string | undefined;
  let accountNumber: string | undefined;
  let statementPeriod: string | undefined;

  // CSV line tokenizer handling quotes, commas, escaped characters
  const parseCsvLine = (line: string): string[] => {
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
    return values.map((v) => v.replace(/^["']|["']$/g, "").trim());
  };

  // Convert raw sheet content to a 2D array of string cells
  const getSheetGrid = (content: string | any[][]): string[][] => {
    if (Array.isArray(content)) {
      return content.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => String(cell ?? "").trim())
          : [String(row ?? "").trim()]
      );
    } else if (typeof content === "string") {
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      return lines.map(parseCsvLine);
    }
    return [];
  };

  function parseDateTimeIso(dateStr: string, timeStr?: string): string {
    const normDate = normalizeDateString(dateStr) || "2026-01-01";
    if (!timeStr || !timeStr.trim()) return normDate;

    try {
      const timeMatch = timeStr.match(
        /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i
      );
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

  type TableType =
    | "NONE"
    | "ALL_TX"
    | "TRADES"
    | "TRANSFERS"
    | "INCOME"
    | "GLOSSARY";

  const allTxRows: Record<string, string>[] = [];
  const tradesRows: Record<string, string>[] = [];
  const transfersRows: Record<string, string>[] = [];
  const incomeRows: Record<string, string>[] = [];

  for (const [sheetName, sheetContent] of Object.entries(sheetMap)) {
    const grid = getSheetGrid(sheetContent);
    if (grid.length === 0) continue;

    // Default table mode based on sheet name if it's a dedicated sheet
    let currentTable: TableType = "NONE";
    if (/all\s*transactions/i.test(sheetName)) currentTable = "ALL_TX";
    else if (/trades/i.test(sheetName)) currentTable = "TRADES";
    else if (/transfers/i.test(sheetName)) currentTable = "TRANSFERS";
    else if (/income/i.test(sheetName)) currentTable = "INCOME";

    let currentHeaders: string[] = [];

    for (const cols of grid) {
      if (cols.length === 0 || cols.every((c) => !c)) continue;

      const normCols = cols.map((c) =>
        String(c || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      );
      const joined = normCols.join("|");

      // 1. Check for account metadata lines
      if (!investorName && normCols[0] === "name" && cols[1]) {
        investorName = cols[1];
        continue;
      }
      if (
        !accountNumber &&
        (normCols[0].includes("accountnumber") ||
          normCols[0].includes("drivewealth")) &&
        cols[1]
      ) {
        accountNumber = cols[1];
        continue;
      }
      if (
        !statementPeriod &&
        normCols[0].includes("openingdate") &&
        cols[1]
      ) {
        statementPeriod = cols[1];
        continue;
      }

      // 2. Check for Table Section Headers
      if (
        joined.includes("accountbalance") &&
        (joined.includes("comment") || joined.includes("type"))
      ) {
        currentTable = "ALL_TX";
        currentHeaders = normCols;
        continue;
      } else if (
        joined.includes("ticker") &&
        (joined.includes("quantity") ||
          joined.includes("pricepershare") ||
          joined.includes("ordertype") ||
          joined.includes("shares"))
      ) {
        currentTable = "TRADES";
        currentHeaders = normCols;
        continue;
      } else if (
        joined.includes("activity") &&
        (joined.includes("cashamount") || joined.includes("amount")) &&
        !joined.includes("ticker")
      ) {
        currentTable = "TRANSFERS";
        currentHeaders = normCols;
        continue;
      } else if (
        joined.includes("grosscashamount") ||
        (joined.includes("activity") &&
          joined.includes("ticker") &&
          (joined.includes("cashamount") || joined.includes("amount")))
      ) {
        currentTable = "INCOME";
        currentHeaders = normCols;
        continue;
      } else if (
        joined.includes("transactiontype") &&
        joined.includes("description")
      ) {
        currentTable = "GLOSSARY";
        continue;
      }

      // If we don't have current headers yet, check if this row might be a header
      if (currentHeaders.length === 0 && currentTable !== "NONE") {
        if (normCols.includes("date") || normCols.includes("datetime")) {
          currentHeaders = normCols;
          continue;
        }
      }

      if (currentTable === "NONE" || currentTable === "GLOSSARY") {
        continue;
      }

      if (currentHeaders.length === 0) continue;

      const rowObj: Record<string, string> = {};
      for (let c = 0; c < currentHeaders.length; c++) {
        rowObj[currentHeaders[c]] = cols[c] || "";
      }

      // Ensure the row has a date value to avoid recording stray commentary
      const rowDate =
        rowObj["date"] ||
        rowObj["datetime"] ||
        rowObj["timeinutc"] ||
        rowObj["time"];
      if (!rowDate) continue;

      if (currentTable === "ALL_TX") allTxRows.push(rowObj);
      else if (currentTable === "TRADES") tradesRows.push(rowObj);
      else if (currentTable === "TRANSFERS") transfersRows.push(rowObj);
      else if (currentTable === "INCOME") incomeRows.push(rowObj);
    }
  }

  // Exact balance indexing by datetime and type
  const balanceByDateTime: Record<string, number> = {};
  const balanceByDateTimeAndType: Record<string, number> = {};

  for (const r of allTxRows) {
    const dt = parseDateTimeIso(
      r["date"] || r["datetime"] || "",
      r["timeinutc"] || r["time"] || ""
    );
    const balStr =
      r["accountbalance"] || r["balance"] || r["buyingpower"] || "";
    const typeStr = (r["type"] || "").toUpperCase();

    if (balStr) {
      const bal = parseFloat(balStr.replace(/[^0-9.-]/g, ""));
      if (!isNaN(bal)) {
        balanceByDateTime[dt] = bal;
        if (typeStr) {
          balanceByDateTimeAndType[`${dt}_${typeStr}`] = bal;
        }

        // Track the latest account balance by chronological date
        if (!latestBalanceDateStr || dt >= latestBalanceDateStr) {
          latestBalanceDateStr = dt;
          latestAccountBalance = bal;
        }
      }
    }
  }

  // 1. Parse Transfers (Deposits & Withdrawals)
  for (const r of transfersRows) {
    const dt = parseDateTimeIso(
      r["date"] || r["datetime"] || "",
      r["timeinutc"] || r["time"] || ""
    );
    const activity = (r["activity"] || r["type"] || "Deposit").toUpperCase();
    const amount = Math.abs(
      parseFloat(
        r["cashamount"] || r["cashamountinusd"] || r["amount"] || "0"
      ) || 0
    );
    const isDeposit =
      activity.includes("DEP") ||
      activity.includes("REC") ||
      !activity.includes("WITH");
    const typeKey = isDeposit ? "CSR" : "CSD";
    const bal =
      balanceByDateTimeAndType[`${dt}_${typeKey}`] ?? balanceByDateTime[dt];

    if (dt && amount > 0) {
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

  // 2. Parse Trades (Stock Buys & Sells)
  for (const r of tradesRows) {
    const dt = parseDateTimeIso(
      r["date"] || r["datetime"] || "",
      r["timeinutc"] || r["time"] || ""
    );
    const ticker = (
      r["ticker"] ||
      r["symbol"] ||
      r["security"] ||
      ""
    ).toUpperCase();
    const activity = (
      r["activity"] ||
      r["type"] ||
      r["side"] ||
      "Buy"
    ).toUpperCase();
    const shares = Math.abs(
      parseFloat(r["quantity"] || r["shares"] || r["qty"] || "0") || 0
    );
    const price = Math.abs(
      parseFloat(
        r["pricepershare"] || r["pricepershareinusd"] || r["price"] || "0"
      ) || 0
    );
    const amount = Math.abs(
      parseFloat(
        r["cashamount"] || r["cashamountinusd"] || r["amount"] || "0"
      ) || shares * price
    );
    const fee = Math.abs(
      parseFloat(
        r["commissioncharges"] ||
          r["commissionchargesinusd"] ||
          r["fee"] ||
          "0"
      ) || 0
    );
    const isBuy = activity.includes("BUY") || activity.includes("PURCHASE");
    const typeKey = isBuy ? "SPUR" : "SSAL";
    const bal =
      balanceByDateTimeAndType[`${dt}_${typeKey}`] ?? balanceByDateTime[dt];

    if (dt && ticker && (shares > 0 || amount > 0)) {
      transactions.push({
        id: `tx-trade-${txCounter++}`,
        date: dt,
        symbol: ticker,
        type: isBuy ? "BUY" : "SELL",
        shares:
          shares > 0
            ? shares
            : price > 0
            ? Number((amount / price).toFixed(6))
            : 1,
        price:
          price > 0
            ? price
            : Number((amount / (shares || 1)).toFixed(2)),
        amount: isBuy ? -amount : amount,
        fee,
        accountBalance: bal,
        notes: `${r["name"] || ticker} ${activity} (${dt})`,
      });
    }
  }

  // 3. Parse Income (Dividends, Interest, Taxes)
  for (const r of incomeRows) {
    const dt = parseDateTimeIso(
      r["date"] || r["datetime"] || "",
      r["timeinutc"] || r["time"] || ""
    );
    const activity = (r["activity"] || r["type"] || "").toUpperCase();
    const ticker = (r["ticker"] || r["symbol"] || "USD").toUpperCase();
    const amount =
      parseFloat(
        r["grosscashamount"] ||
          r["grosscashamountinusd"] ||
          r["amount"] ||
          "0"
      ) || 0;

    let typeKey = "DIV";
    if (activity.includes("TAX")) typeKey = "DIVTAX";
    else if (activity.includes("INTEREST")) typeKey = "INT";
    const bal =
      balanceByDateTimeAndType[`${dt}_${typeKey}`] ?? balanceByDateTime[dt];

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

  // 4. Fallback: If only "All Transactions" table was present without dedicated Trades/Transfers tables
  if (
    tradesRows.length === 0 &&
    transfersRows.length === 0 &&
    incomeRows.length === 0 &&
    allTxRows.length > 0
  ) {
    for (const r of allTxRows) {
      const dt = parseDateTimeIso(
        r["date"] || r["datetime"] || "",
        r["timeinutc"] || r["time"] || ""
      );
      const typeStr = (r["type"] || "").toUpperCase();
      const amount = Math.abs(parseFloat(r["amount"] || "0") || 0);
      const bal =
        parseFloat(
          (r["accountbalance"] || r["balance"] || "").replace(/[^0-9.-]/g, "")
        ) || undefined;
      const comment = r["comment"] || "";
      const ticker = resolveTickerFromLine(comment) || "STOCK";

      if (typeStr.includes("SPUR") || typeStr.includes("BUY")) {
        transactions.push({
          id: `tx-trade-${txCounter++}`,
          date: dt,
          symbol: ticker,
          type: "BUY",
          shares: 1,
          price: amount,
          amount: -amount,
          accountBalance: bal,
          notes: comment || `Buy ${ticker}`,
        });
      } else if (typeStr.includes("SSAL") || typeStr.includes("SELL")) {
        transactions.push({
          id: `tx-trade-${txCounter++}`,
          date: dt,
          symbol: ticker,
          type: "SELL",
          shares: 1,
          price: amount,
          amount: amount,
          accountBalance: bal,
          notes: comment || `Sell ${ticker}`,
        });
      } else if (typeStr.includes("CSR") || typeStr.includes("DEP")) {
        transactions.push({
          id: `tx-dep-${txCounter++}`,
          date: dt,
          symbol: "CASH",
          type: "DEPOSIT",
          shares: 0,
          price: 1,
          amount,
          accountBalance: bal,
          notes: comment || "Deposit",
        });
      } else if (typeStr.includes("CSD") || typeStr.includes("WITH")) {
        transactions.push({
          id: `tx-dep-${txCounter++}`,
          date: dt,
          symbol: "CASH",
          type: "WITHDRAWAL",
          shares: 0,
          price: 1,
          amount: -amount,
          accountBalance: bal,
          notes: comment || "Withdrawal",
        });
      } else if (typeStr.includes("DIVTAX") || typeStr.includes("TAX")) {
        transactions.push({
          id: `tx-inc-${txCounter++}`,
          date: dt,
          symbol: ticker !== "STOCK" ? ticker : "USD",
          type: "TAX",
          shares: 0,
          price: 0,
          amount: -amount,
          accountBalance: bal,
          notes: comment || "Tax",
        });
      } else if (typeStr.includes("DIV")) {
        transactions.push({
          id: `tx-inc-${txCounter++}`,
          date: dt,
          symbol: ticker !== "STOCK" ? ticker : "CASH",
          type: "DIVIDEND",
          shares: 0,
          price: 0,
          amount,
          accountBalance: bal,
          notes: comment || "Dividend",
        });
      } else if (typeStr.includes("INT")) {
        transactions.push({
          id: `tx-inc-${txCounter++}`,
          date: dt,
          symbol: "CASH",
          type: "DIVIDEND",
          shares: 0,
          price: 0,
          amount,
          accountBalance: bal,
          notes: comment || "Interest",
        });
      }
    }
  }

  // Sort all transactions chronologically: oldest to newest
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
      accountNumber,
      investorName,
      statementPeriod,
      cashBalance: latestAccountBalance,
    },
    totalTransactionsParsed: transactions.length,
    errors:
      transactions.length === 0
        ? ["No transactions found in spreadsheet."]
        : [],
  };
}
