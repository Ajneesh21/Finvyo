import * as XLSX from "xlsx";
import { Transaction, TransactionType, ParsedPdfResult } from "./types";

// Known Company Name to Ticker Symbol mapping
const COMPANY_TO_TICKER: Record<string, string> = {
  "META PLATFORMS": "META",
  "META PLATFORMS INC": "META",
  "FACEBOOK": "META",
  "LUCAS GC LIMITED": "LGCL",
  "LUCAS GC": "LGCL",
  "C3IS INC": "CISS",
  "C3IS": "CISS",
  "APPLE INC": "AAPL",
  "APPLE": "AAPL",
  "MICROSOFT CORP": "MSFT",
  "MICROSOFT": "MSFT",
  "NVIDIA CORP": "NVDA",
  "NVIDIA": "NVDA",
  "AMAZON.COM INC": "AMZN",
  "AMAZON": "AMZN",
  "TESLA INC": "TSLA",
  "TESLA": "TSLA",
  "ALPHABET INC": "GOOGL",
  "ALPHABET": "GOOGL",
  "GOOGLE": "GOOGL",
  "VANGUARD S&P 500": "VOO",
  "VANGUARD 500": "VOO",
  "INVESCO QQQ": "QQQ",
  "SPDR S&P 500": "SPY",
  "PALANTIR TECHNOLOGIES": "PLTR",
  "PALANTIR": "PLTR",
  "ADVANCED MICRO DEVICES": "AMD",
  "AMD": "AMD",
  "ARM HOLDINGS": "ARM",
  "SUPER MICRO COMPUTER": "SMCI",
  "NETFLIX INC": "NFLX",
  "NETFLIX": "NFLX",
  "COINBASE GLOBAL": "COIN",
  "COINBASE": "COIN",
  "WALT DISNEY": "DIS",
  "DISNEY": "DIS",
};

interface ExtractedHolding {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  costBasis?: number;
}

/**
 * Parses XLSX / XLS spreadsheet buffer exported from Vested / DriveWealth
 */
export function parseVestedXlsxBuffer(buffer: Buffer): ParsedPdfResult {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const transactions: Transaction[] = [];
    let txCounter = 1;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
        defval: "",
        raw: false,
      });

      for (const row of rows) {
        // Normalize keys (lowercase without spaces/symbols)
        const normalizedRow: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          const normKey = k
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .trim();
          normalizedRow[normKey] = String(v).trim();
        }

        // 1. Identify Date
        const dateRaw =
          normalizedRow["date"] ||
          normalizedRow["datetime"] ||
          normalizedRow["datetimeinutc"] ||
          normalizedRow["transactiondate"] ||
          normalizedRow["tradedate"] ||
          normalizedRow["activitydate"] ||
          "";

        const normDate = normalizeDateString(dateRaw) || new Date().toISOString().split("T")[0];

        // 2. Identify Type
        const typeRaw = (
          normalizedRow["type"] ||
          normalizedRow["activitytype"] ||
          normalizedRow["transactiontype"] ||
          normalizedRow["action"] ||
          normalizedRow["side"] ||
          ""
        ).toUpperCase();

        let type: TransactionType = "BUY";
        if (typeRaw.includes("SPUR") || typeRaw.includes("BUY") || typeRaw.includes("PURCHASE")) {
          type = "BUY";
        } else if (typeRaw.includes("SSAL") || typeRaw.includes("SELL") || typeRaw.includes("SOLD")) {
          type = "SELL";
        } else if (typeRaw.includes("CSR") || typeRaw.includes("DEPOSIT") || typeRaw.includes("FUNDS REC")) {
          type = "DEPOSIT";
        } else if (typeRaw.includes("CSD") || typeRaw.includes("CSW") || typeRaw.includes("WITHDRAW")) {
          type = "WITHDRAWAL";
        } else if (typeRaw.includes("DIV") || typeRaw.includes("CDIV")) {
          type = "DIVIDEND";
        } else if (typeRaw.includes("TAX")) {
          type = "TAX";
        } else if (typeRaw.includes("FEE")) {
          type = "FEE";
        }

        // 3. Identify Symbol / Security
        const symbolRaw =
          normalizedRow["symbol"] ||
          normalizedRow["ticker"] ||
          normalizedRow["security"] ||
          normalizedRow["asset"] ||
          normalizedRow["company"] ||
          normalizedRow["description"] ||
          normalizedRow["comment"] ||
          "";

        let symbol = resolveTickerFromLine(symbolRaw);
        if (type === "DEPOSIT" || type === "WITHDRAWAL") {
          symbol = "CASH";
        }

        // 4. Identify Numeric Fields: Shares, Price, Amount
        const sharesRaw =
          normalizedRow["shares"] ||
          normalizedRow["quantity"] ||
          normalizedRow["qty"] ||
          normalizedRow["share"] ||
          "";
        const priceRaw =
          normalizedRow["price"] ||
          normalizedRow["shareprice"] ||
          normalizedRow["unitprice"] ||
          normalizedRow["costperunit"] ||
          "";
        const amountRaw =
          normalizedRow["amount"] ||
          normalizedRow["amountinusd"] ||
          normalizedRow["grossamount"] ||
          normalizedRow["netamount"] ||
          normalizedRow["total"] ||
          normalizedRow["value"] ||
          "";

        const parsedShares = Math.abs(parseFloat(sharesRaw.replace(/[^0-9.-]/g, "")) || 0);
        const parsedPrice = Math.abs(parseFloat(priceRaw.replace(/[^0-9.-]/g, "")) || 0);
        const parsedAmount = Math.abs(parseFloat(amountRaw.replace(/[^0-9.-]/g, "")) || 0);

        let finalShares = parsedShares;
        let finalPrice = parsedPrice;
        let finalAmount = parsedAmount;

        if (finalShares > 0 && finalPrice > 0 && finalAmount === 0) {
          finalAmount = finalShares * finalPrice;
        } else if (finalAmount > 0 && finalPrice > 0 && finalShares === 0) {
          finalShares = Number((finalAmount / finalPrice).toFixed(4));
        } else if (finalAmount > 0 && finalShares > 0 && finalPrice === 0) {
          finalPrice = Number((finalAmount / finalShares).toFixed(2));
        }

        if (finalAmount > 0 || finalShares > 0) {
          transactions.push({
            id: `tx-xlsx-${txCounter++}`,
            date: normDate,
            symbol: symbol || "STOCK",
            type,
            shares: finalShares,
            price: finalPrice || (finalShares > 0 ? finalAmount / finalShares : finalAmount),
            amount:
              type === "BUY" || type === "WITHDRAWAL"
                ? -Math.abs(finalAmount || finalShares * finalPrice)
                : Math.abs(finalAmount || finalShares * finalPrice),
            notes: symbolRaw || `${type} ${symbol}`,
          });
        }
      }
    }

    // Sort chronologically
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: transactions.length > 0,
      transactions,
      accountInfo: {
        brokerName: "Vested Finance / DriveWealth (Excel Export)",
      },
      totalTransactionsParsed: transactions.length,
      errors: transactions.length === 0 ? ["No valid transaction rows found in XLSX sheet."] : [],
    };
  } catch (err: unknown) {
    return {
      success: false,
      transactions: [],
      totalTransactionsParsed: 0,
      errors: [`XLSX parsing failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

/**
 * Parses raw text extracted from a Vested PDF statement, CSV, or pasted activity ledger.
 * Robustly parses BOTH the Open Holdings / Positions table AND the Activity Ledger.
 */
export function parseVestedStatementText(rawText: string): ParsedPdfResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const transactions: Transaction[] = [];
  let txCounter = 1;

  // Extract Account metadata if present
  let accountNumber: string | undefined;
  let statementPeriod: string | undefined;
  let brokerName = "Vested Finance / DriveWealth";
  let investorName: string | undefined;
  let totalAccountValue: number | undefined;
  let cashBalanceFromSummary: number | undefined;

  for (const line of lines) {
    if (!accountNumber) {
      const dwMatch = line.match(/\b(DW[-_]?[0-9A-Z]{4,12}|VF[-_]?[0-9A-Z]{4,12})\b/i);
      if (dwMatch) {
        accountNumber = dwMatch[1];
      } else {
        const accMatch = line.match(/account\s*(?:number|no|id|#)\s*[:\-]?\s*([A-Z0-9\-]+)/i);
        if (accMatch && !/name|type|status|balance/i.test(accMatch[1])) {
          accountNumber = accMatch[1];
        }
      }
    }

    if (!statementPeriod && /period\s*[:\-]?\s*([A-Za-z0-9,\s\-]+)/i.test(line)) {
      const match = line.match(/period\s*[:\-]?\s*([A-Za-z0-9,\s\-]+)/i);
      if (match) statementPeriod = match[1].trim();
    }

    if (!investorName) {
      const nameMatch = line.match(/(?:account\s*name|investor\s*name|name)\s*[:\-]\s*([A-Za-z\s]{3,35})/i);
      if (nameMatch && !/vested|drivewealth|statement|activity|summary|report|type|amount|total/i.test(nameMatch[1])) {
        investorName = nameMatch[1].trim();
      }
    }

    // Check for Total Account Value / Portfolio Value header
    if (!totalAccountValue) {
      const valMatch = line.match(/(?:total\s*(?:account|portfolio|ending)?\s*value|net\s*account\s*value|ending\s*portfolio\s*value|account\s*value)\s*[:\-]?\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
      if (valMatch) {
        const parsed = parseFloat(valMatch[1].replace(/,/g, ""));
        if (!isNaN(parsed) && parsed > 0) {
          totalAccountValue = parsed;
        }
      }
    }

    // Check for Cash Balance header
    if (cashBalanceFromSummary === undefined) {
      const cashMatch = line.match(/(?:cash\s*balance|uninvested\s*cash|cash\s*and\s*cash\s*equivalents)\s*[:\-]?\s*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
      if (cashMatch) {
        const parsed = parseFloat(cashMatch[1].replace(/,/g, ""));
        if (!isNaN(parsed)) {
          cashBalanceFromSummary = parsed;
        }
      }
    }
  }

  // 1. EXTRACT OPEN HOLDINGS / POSITIONS TABLE (if present in PDF)
  const extractedHoldings = extractHoldingsTable(lines);

  // Determine earliest date in statement or default to period start / today
  let earliestDate = "2024-01-01";

  // Regex patterns for parsing lines
  const dateRegex =
    /(?:(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s+[AP]M)?)?)|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})|((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}))/i;

  const actionKeywords: Record<string, TransactionType> = {
    SPUR: "BUY",
    SSAL: "SELL",
    CSR: "DEPOSIT",
    CSD: "WITHDRAWAL",
    CSW: "WITHDRAWAL",
    CDIV: "DIVIDEND",
    DIV: "DIVIDEND",
    TAXD: "TAX",
    BUY: "BUY",
    BOUGHT: "BUY",
    PURCHASE: "BUY",
    SELL: "SELL",
    SOLD: "SELL",
    DIVIDEND: "DIVIDEND",
    DEPOSIT: "DEPOSIT",
    "FUNDS RECEIVED": "DEPOSIT",
    TRANSFER_IN: "DEPOSIT",
    WITHDRAWAL: "WITHDRAWAL",
    "FUNDS DISBURSED": "WITHDRAWAL",
    TRANSFER_OUT: "WITHDRAWAL",
    FEE: "FEE",
    "ADR FEE": "FEE",
    "WIRE FEE": "FEE",
    TAX: "TAX",
    WITHHOLDING: "TAX",
    SPLIT: "STOCK_SPLIT",
    "STOCK SPLIT": "STOCK_SPLIT",
  };

  // 2. PARSE TRANSACTION ACTIVITY LINES
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line contains a date
    const dateMatch = line.match(dateRegex);
    if (!dateMatch) continue;

    const rawDateToken = dateMatch[0];
    const normalizedDate = normalizeDateString(rawDateToken);
    if (!normalizedDate) continue;

    if (normalizedDate < earliestDate) {
      earliestDate = normalizedDate;
    }

    let detectedType: TransactionType | null = null;
    const upperLine = line.toUpperCase();

    if (/\bSPUR\b/.test(upperLine)) detectedType = "BUY";
    else if (/\bSSAL\b/.test(upperLine)) detectedType = "SELL";
    else if (/\bCSR\b/.test(upperLine)) detectedType = "DEPOSIT";
    else if (/\b(?:CSD|CSW)\b/.test(upperLine)) detectedType = "WITHDRAWAL";
    else if (/\b(?:DIV|CDIV)\b/.test(upperLine)) detectedType = "DIVIDEND";
    else if (/\bTAXD\b/.test(upperLine)) detectedType = "TAX";
    else {
      for (const [kw, type] of Object.entries(actionKeywords)) {
        if (new RegExp(`\\b${kw}\\b`, "i").test(upperLine)) {
          detectedType = type;
          break;
        }
      }
    }

    if (!detectedType) {
      if (/market\s*buy/i.test(line)) detectedType = "BUY";
      else if (/market\s*sell/i.test(line)) detectedType = "SELL";
      else if (/deposit/i.test(line)) detectedType = "DEPOSIT";
    }

    let detectedSymbol = resolveTickerFromLine(line);

    // Extract numbers from the line
    const lineWithoutDate = line.replace(rawDateToken, "");
    const numberMatches =
      lineWithoutDate.match(/(?:[-+]|\()?\s*\$?\d{1,4}(?:,\d{3})*(?:\.\d+)?\)?/g) || [];
    const parsedNumbers: number[] = [];

    for (const numStr of numberMatches) {
      const clean = numStr
        .replace(/[$ ]/g, "")
        .replace(/^\((.+)\)$/, "-$1")
        .replace(/,/g, "");
      const val = parseFloat(clean);
      if (!isNaN(val)) {
        parsedNumbers.push(val);
      }
    }

    const accountBalance = parsedNumbers.length >= 2 ? parsedNumbers[1] : undefined;

    if (detectedType === "DEPOSIT" || detectedType === "WITHDRAWAL") {
      const amount = parsedNumbers[0] || 0;
      if (amount !== 0) {
        transactions.push({
          id: `tx-parsed-${txCounter++}`,
          date: normalizedDate,
          symbol: "CASH",
          type: detectedType,
          shares: 0,
          price: 1,
          amount: detectedType === "DEPOSIT" ? Math.abs(amount) : -Math.abs(amount),
          accountBalance,
          notes: line,
        });
      }
    } else if (detectedType === "DIVIDEND") {
      const amount = parsedNumbers[0] || 0;
      if (amount !== 0) {
        transactions.push({
          id: `tx-parsed-${txCounter++}`,
          date: normalizedDate,
          symbol: detectedSymbol !== "CASH" ? detectedSymbol : "STOCK",
          type: "DIVIDEND",
          shares: 0,
          price: 0,
          amount: Math.abs(amount),
          accountBalance,
          notes: line,
        });
      }
    } else if (detectedType === "BUY" || detectedType === "SELL") {
      let shares = 0;
      let price = 0;
      let amount = 0;

      if (parsedNumbers.length >= 3) {
        const n0 = Math.abs(parsedNumbers[0]);
        const n1 = Math.abs(parsedNumbers[1]);
        const n2 = Math.abs(parsedNumbers[2]);

        if (Math.abs(n0 * n1 - n2) < n2 * 0.15) {
          shares = n0;
          price = n1;
          amount = n2;
        } else {
          amount = n0;
          price = estimatePriceForSymbol(detectedSymbol);
          shares = price > 0 ? Number((amount / price).toFixed(4)) : 1;
        }
      } else if (parsedNumbers.length >= 1) {
        amount = Math.abs(parsedNumbers[0]);
        price = estimatePriceForSymbol(detectedSymbol);
        shares = price > 0 ? Number((amount / price).toFixed(4)) : 1;
      }

      if (amount > 0 && detectedSymbol !== "CASH") {
        transactions.push({
          id: `tx-parsed-${txCounter++}`,
          date: normalizedDate,
          symbol: detectedSymbol,
          type: detectedType,
          shares: shares > 0 ? shares : 1,
          price: price > 0 ? price : amount,
          amount: detectedType === "BUY" ? -Math.abs(amount) : Math.abs(amount),
          accountBalance,
          notes: line,
        });
      }
    }
  }

  // 3. RECONCILE HOLDINGS: If holdings table was found in PDF, incorporate existing open holdings!
  // Any holding from the Holdings table that wasn't created in the activity transactions is added as an initial holding
  if (extractedHoldings.length > 0) {
    // Initial deposit transaction date (just before earliest transaction)
    const initDate = getDayBefore(earliestDate);

    let initialDepositTotal = 0;

    for (const h of extractedHoldings) {
      // If symbol is not already bought in activity, or has larger existing position
      const cost = h.costBasis || h.value || h.shares * h.price;
      initialDepositTotal += cost;

      transactions.unshift({
        id: `tx-init-hold-${txCounter++}`,
        date: initDate,
        symbol: h.symbol,
        type: "BUY",
        shares: h.shares,
        price: h.price,
        amount: -cost,
        notes: `Initial Position from Statement (${h.name})`,
      });
    }

    const hasRealDeposits = transactions.some((t) => t.type === "DEPOSIT");
    if (initialDepositTotal > 0 && !hasRealDeposits) {
      transactions.unshift({
        id: `tx-init-cash-${txCounter++}`,
        date: initDate,
        symbol: "CASH",
        type: "DEPOSIT",
        shares: 0,
        price: 1,
        amount: initialDepositTotal + (cashBalanceFromSummary || 0),
        notes: "Starting Portfolio Capital Deposit",
      });
    }
  }

  // Deduplicate transactions
  const uniqueMap = new Map<string, Transaction>();
  for (const t of transactions) {
    const key = `${t.date}_${t.symbol}_${t.type}_${t.amount.toFixed(2)}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, t);
    }
  }

  const finalTransactions = Array.from(uniqueMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    success: finalTransactions.length > 0,
    transactions: finalTransactions,
    accountInfo: {
      accountNumber,
      statementPeriod,
      brokerName,
      investorName,
    },
    totalTransactionsParsed: finalTransactions.length,
    rawTextPreview: rawText.slice(0, 1500),
    errors:
      finalTransactions.length === 0
        ? ["Could not automatically detect transactions or holdings."]
        : [],
  };
}

/**
 * Extracts open holdings table from statement text lines
 */
function extractHoldingsTable(lines: string[]): ExtractedHolding[] {
  const holdings: ExtractedHolding[] = [];
  let inHoldingsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    // Detect Holdings section header
    if (
      /HOLDINGS|PORTFOLIO HOLDINGS|SECURITIES HELD|EQUITY POSITIONS|POSITIONS SUMMARY|OPEN POSITIONS/i.test(
        upper
      )
    ) {
      inHoldingsSection = true;
      continue;
    }

    // Detect when Holdings section ends (e.g. Account Activity, Disclaimer, Disclosure)
    if (
      inHoldingsSection &&
      /ACCOUNT ACTIVITY|TRANSACTION HISTORY|TRANSACTIONS|DISCLOSURES|IMPORTANT DISCLOSURES|CASH ACTIVITY/i.test(
        upper
      )
    ) {
      inHoldingsSection = false;
      continue;
    }

    if (inHoldingsSection) {
      // Look for holding row: Ticker/Company + Quantity + Price + Value
      const symbol = resolveTickerFromLine(line);
      if (symbol === "CASH") continue;

      // Extract numbers (shares, price, value)
      const numMatches =
        line.match(/(?:[-+]|\()?\s*\$?\d{1,4}(?:,\d{3})*(?:\.\d+)?\)?/g) || [];
      const nums: number[] = [];
      for (const n of numMatches) {
        const clean = n.replace(/[$ ,()]/g, "");
        const v = parseFloat(clean);
        if (!isNaN(v)) nums.push(v);
      }

      if (nums.length >= 2) {
        // e.g. [Shares, Price, Value, CostBasis] or [Shares, Price, Value]
        let shares = nums[0];
        let price = nums[1];
        let val = nums.length >= 3 ? nums[2] : shares * price;
        let costBasis = nums.length >= 4 ? nums[3] : val * 0.85;

        if (shares > 0 && price > 0) {
          holdings.push({
            symbol,
            name: line,
            shares: Number(shares.toFixed(4)),
            price: Number(price.toFixed(2)),
            value: Number(val.toFixed(2)),
            costBasis: Number(costBasis.toFixed(2)),
          });
        }
      }
    }
  }

  return holdings;
}

/**
 * Resolves ticker symbol from line text or company names
 */
function resolveTickerFromLine(line: string): string {
  const upper = line.toUpperCase();

  for (const [company, ticker] of Object.entries(COMPANY_TO_TICKER)) {
    if (upper.includes(company)) {
      return ticker;
    }
  }

  const ignoredWords = new Set([
    "USD", "INR", "BUY", "SELL", "DIV", "TOTAL", "DATE", "TIME",
    "PRICE", "QTY", "FEE", "TAX", "CASH", "TRADE", "TYPE", "SIDE",
    "NET", "NAME", "PAGE", "REPORT", "SPUR", "SSAL", "CSR", "CSD",
    "CSW", "TAXD", "MARKET", "LIMIT", "DEPOSIT", "INC", "CORP", "LTD",
    "LIMITED", "LLC", "PLC", "HOLDINGS", "GROUP", "CLASS", "ACCOUNT",
    "BALANCE", "COMMENT", "UTC", "AM", "PM", "SECURITIES", "POSITION",
    "POSITIONS", "EQUITY", "VALUE", "PORTFOLIO", "STATEMENT"
  ]);

  const words = upper.match(/\b[A-Z]{1,5}\b/g) || [];
  for (const w of words) {
    if (!ignoredWords.has(w) && !/^\d+$/.test(w)) {
      return w;
    }
  }

  return "CASH";
}

function estimatePriceForSymbol(symbol: string): number {
  const map: Record<string, number> = {
    META: 512.0,
    AAPL: 228.0,
    NVDA: 128.0,
    MSFT: 422.0,
    AMZN: 186.0,
    TSLA: 218.0,
    GOOGL: 178.0,
    VOO: 512.0,
    QQQ: 485.0,
    SPY: 558.0,
    LGCL: 4.85,
    CISS: 2.24,
  };
  return map[symbol.toUpperCase()] || 100.0;
}

function getDayBefore(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  } catch {
    return "2024-01-01";
  }
}

export function normalizeDateString(rawDate: string): string | null {
  if (!rawDate) return null;

  try {
    const ymdMatch = rawDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      const y = ymdMatch[1];
      const m = ymdMatch[2].padStart(2, "0");
      const d = ymdMatch[3].padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    const dmyMatch = rawDate.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      const y = dmyMatch[3];

      if (p1 > 12) {
        return `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      }
      return `${y}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
    }

    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  } catch {
    return null;
  }

  return null;
}
