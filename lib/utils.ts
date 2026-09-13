import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: number | undefined | null,
  options?: {
    currency?: "USD" | "INR";
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showPlusSign?: boolean;
    compact?: boolean;
  }
): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "$0.00";
  }

  const {
    currency = "USD",
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showPlusSign = false,
    compact = false,
  } = options || {};

  const prefix = currency === "INR" ? "₹" : "$";
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : showPlusSign && value > 0 ? "+" : "";

  if (compact && absValue >= 1_000_000_000) {
    return `${sign}${prefix}${(absValue / 1_000_000_000).toFixed(2)}B`;
  }
  if (compact && absValue >= 1_000_000) {
    return `${sign}${prefix}${(absValue / 1_000_000).toFixed(2)}M`;
  }
  if (compact && absValue >= 1_000) {
    return `${sign}${prefix}${(absValue / 1_000).toFixed(2)}K`;
  }

  const formattedNum = absValue.toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return `${sign}${prefix}${formattedNum}`;
}

export function formatLargeNumber(value: number | undefined | null, decimals = 2): string {
  if (value === undefined || value === null || isNaN(value)) return "0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) {
    return `${sign}${(abs / 1_000_000_000_000).toFixed(decimals)}T`;
  }
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(decimals)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(decimals)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(decimals)}K`;
  }
  return `${sign}${abs.toFixed(decimals)}`;
}

export function formatPercent(
  value: number | undefined | null,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showPlusSign?: boolean;
  }
): string {
  if (value === undefined || value === null || isNaN(value)) {
    return "0.00%";
  }

  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showPlusSign = true,
  } = options || {};

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : showPlusSign && value > 0 ? "+" : "";

  return `${sign}${absValue.toLocaleString("en-US", {
    minimumFractionDigits,
    maximumFractionDigits,
  })}%`;
}

export function formatDate(
  dateStr: string | Date | undefined,
  dateFormat = "MMM dd, yyyy"
): string {
  if (!dateStr) return "-";
  try {
    const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(d, dateFormat);
  } catch {
    return String(dateStr);
  }
}

export function getSectorColor(sector: string): string {
  const map: Record<string, string> = {
    Technology: "#3b82f6", // Blue
    "Information Technology": "#3b82f6",
    "Consumer Cyclical": "#ec4899", // Pink
    "Consumer Discretionary": "#ec4899",
    "Communication Services": "#8b5cf6", // Purple
    Financials: "#10b981", // Emerald
    "Financial Services": "#10b981",
    Healthcare: "#06b6d4", // Cyan
    "Health Care": "#06b6d4",
    Industrials: "#f59e0b", // Amber
    Energy: "#ef4444", // Red
    "Consumer Staples": "#84cc16", // Lime
    Utilities: "#14b8a6", // Teal
    "Real Estate": "#a855f7", // Violet
    Materials: "#eab308", // Yellow
    "Basic Materials": "#eab308",
    "Index / ETF": "#6366f1", // Indigo
    ETF: "#6366f1",
    Cash: "#64748b", // Slate
  };
  return map[sector] || "#94a3b8";
}

export function getTickerSector(symbol: string): {
  sector: string;
  name: string;
} {
  const lookup: Record<string, { sector: string; name: string }> = {
    // Technology & Semiconductors
    AAPL: { sector: "Technology", name: "Apple Inc." },
    MSFT: { sector: "Technology", name: "Microsoft Corporation" },
    NVDA: { sector: "Technology", name: "NVIDIA Corporation" },
    AMD: { sector: "Technology", name: "Advanced Micro Devices, Inc." },
    AVGO: { sector: "Technology", name: "Broadcom Inc." },
    CRM: { sector: "Technology", name: "Salesforce, Inc." },
    ADBE: { sector: "Technology", name: "Adobe Inc." },
    ORCL: { sector: "Technology", name: "Oracle Corporation" },
    INTC: { sector: "Technology", name: "Intel Corporation" },
    QCOM: { sector: "Technology", name: "QUALCOMM Incorporated" },
    TXN: { sector: "Technology", name: "Texas Instruments Incorporated" },
    CSCO: { sector: "Technology", name: "Cisco Systems, Inc." },
    NOW: { sector: "Technology", name: "ServiceNow, Inc." },
    PANW: { sector: "Technology", name: "Palo Alto Networks, Inc." },
    IBM: { sector: "Technology", name: "International Business Machines Corp." },
    PLTR: { sector: "Technology", name: "Palantir Technologies Inc." },
    ARM: { sector: "Technology", name: "Arm Holdings plc" },
    SMCI: { sector: "Technology", name: "Super Micro Computer, Inc." },
    UBER: { sector: "Technology", name: "Uber Technologies, Inc." },
    SNOW: { sector: "Technology", name: "Snowflake Inc." },
    CRWD: { sector: "Technology", name: "CrowdStrike Holdings, Inc." },
    SQ: { sector: "Technology", name: "Block, Inc." },
    SHOP: { sector: "Technology", name: "Shopify Inc." },
    INTU: { sector: "Technology", name: "Intuit Inc." },
    ADSK: { sector: "Technology", name: "Autodesk, Inc." },
    WDAY: { sector: "Technology", name: "Workday, Inc." },
    TEAM: { sector: "Technology", name: "Atlassian Corporation" },
    DDOG: { sector: "Technology", name: "Datadog, Inc." },
    MDB: { sector: "Technology", name: "MongoDB, Inc." },
    NET: { sector: "Technology", name: "Cloudflare, Inc." },
    ZS: { sector: "Technology", name: "Zscaler, Inc." },
    AMAT: { sector: "Technology", name: "Applied Materials, Inc." },
    LRCX: { sector: "Technology", name: "Lam Research Corporation" },
    KLAC: { sector: "Technology", name: "KLA Corporation" },
    CDNS: { sector: "Technology", name: "Cadence Design Systems, Inc." },
    SNPS: { sector: "Technology", name: "Synopsys, Inc." },
    LGCL: { sector: "Technology", name: "Lucas GC Limited" },

    // Communication Services
    GOOGL: { sector: "Communication Services", name: "Alphabet Inc. (Class A)" },
    GOOG: { sector: "Communication Services", name: "Alphabet Inc. (Class C)" },
    META: { sector: "Communication Services", name: "Meta Platforms, Inc." },
    NFLX: { sector: "Communication Services", name: "Netflix, Inc." },
    DIS: { sector: "Communication Services", name: "The Walt Disney Company" },
    TMUS: { sector: "Communication Services", name: "T-Mobile US, Inc." },
    VZ: { sector: "Communication Services", name: "Verizon Communications Inc." },
    CMCSA: { sector: "Communication Services", name: "Comcast Corporation" },
    SPOT: { sector: "Communication Services", name: "Spotify Technology S.A." },
    DASH: { sector: "Communication Services", name: "DoorDash, Inc." },
    PINS: { sector: "Communication Services", name: "Pinterest, Inc." },

    // Consumer Cyclical / Discretionary
    AMZN: { sector: "Consumer Cyclical", name: "Amazon.com, Inc." },
    TSLA: { sector: "Consumer Cyclical", name: "Tesla, Inc." },
    HD: { sector: "Consumer Cyclical", name: "The Home Depot, Inc." },
    MCD: { sector: "Consumer Cyclical", name: "McDonald's Corporation" },
    NKE: { sector: "Consumer Cyclical", name: "NIKE, Inc." },
    SBUX: { sector: "Consumer Cyclical", name: "Starbucks Corporation" },
    ABNB: { sector: "Consumer Cyclical", name: "Airbnb, Inc." },
    BKNG: { sector: "Consumer Cyclical", name: "Booking Holdings Inc." },
    LOW: { sector: "Consumer Cyclical", name: "Lowe's Companies, Inc." },
    TJX: { sector: "Consumer Cyclical", name: "The TJX Companies, Inc." },
    LULU: { sector: "Consumer Cyclical", name: "Lululemon Athletica Inc." },

    // Financials
    BRK_B: { sector: "Financials", name: "Berkshire Hathaway Inc." },
    "BRK.B": { sector: "Financials", name: "Berkshire Hathaway Inc." },
    JPM: { sector: "Financials", name: "JPMorgan Chase & Co." },
    V: { sector: "Financials", name: "Visa Inc." },
    MA: { sector: "Financials", name: "Mastercard Incorporated" },
    BAC: { sector: "Financials", name: "Bank of America Corporation" },
    WFC: { sector: "Financials", name: "Wells Fargo & Company" },
    GS: { sector: "Financials", name: "The Goldman Sachs Group, Inc." },
    MS: { sector: "Financials", name: "Morgan Stanley" },
    BLK: { sector: "Financials", name: "BlackRock, Inc." },
    SCHW: { sector: "Financials", name: "The Charles Schwab Corporation" },
    COIN: { sector: "Financials", name: "Coinbase Global, Inc." },
    AXP: { sector: "Financials", name: "American Express Company" },
    SPGI: { sector: "Financials", name: "S&P Global Inc." },
    MCO: { sector: "Financials", name: "Moody's Corporation" },
    CME: { sector: "Financials", name: "CME Group Inc." },
    PGR: { sector: "Financials", name: "The Progressive Corporation" },

    // Healthcare
    LLY: { sector: "Healthcare", name: "Eli Lilly and Company" },
    UNH: { sector: "Healthcare", name: "UnitedHealth Group Incorporated" },
    JNJ: { sector: "Healthcare", name: "Johnson & Johnson" },
    ABBV: { sector: "Healthcare", name: "AbbVie Inc." },
    MRK: { sector: "Healthcare", name: "Merck & Co., Inc." },
    PFE: { sector: "Healthcare", name: "Pfizer Inc." },
    TMO: { sector: "Healthcare", name: "Thermo Fisher Scientific Inc." },
    ABT: { sector: "Healthcare", name: "Abbott Laboratories" },
    ISRG: { sector: "Healthcare", name: "Intuitive Surgical, Inc." },
    DHR: { sector: "Healthcare", name: "Danaher Corporation" },
    SYK: { sector: "Healthcare", name: "Stryker Corporation" },
    BMY: { sector: "Healthcare", name: "Bristol-Myers Squibb Company" },
    GILD: { sector: "Healthcare", name: "Gilead Sciences, Inc." },
    VRTX: { sector: "Healthcare", name: "Vertex Pharmaceuticals Incorporated" },
    REGN: { sector: "Healthcare", name: "Regeneron Pharmaceuticals, Inc." },

    // Consumer Staples
    WMT: { sector: "Consumer Staples", name: "Walmart Inc." },
    PG: { sector: "Consumer Staples", name: "The Procter & Gamble Company" },
    COST: { sector: "Consumer Staples", name: "Costco Wholesale Corporation" },
    KO: { sector: "Consumer Staples", name: "The Coca-Cola Company" },
    PEP: { sector: "Consumer Staples", name: "PepsiCo, Inc." },
    MDLZ: { sector: "Consumer Staples", name: "Mondelez International, Inc." },
    PM: { sector: "Consumer Staples", name: "Philip Morris International Inc." },
    CL: { sector: "Consumer Staples", name: "Colgate-Palmolive Company" },
    TGT: { sector: "Consumer Staples", name: "Target Corporation" },

    // Energy
    XOM: { sector: "Energy", name: "Exxon Mobil Corporation" },
    CVX: { sector: "Energy", name: "Chevron Corporation" },
    COP: { sector: "Energy", name: "ConocoPhillips" },
    SLB: { sector: "Energy", name: "SLB" },
    EOG: { sector: "Energy", name: "EOG Resources, Inc." },
    MPC: { sector: "Energy", name: "Marathon Petroleum Corporation" },
    PSX: { sector: "Energy", name: "Phillips 66" },

    // Industrials
    CAT: { sector: "Industrials", name: "Caterpillar Inc." },
    BA: { sector: "Industrials", name: "The Boeing Company" },
    GE: { sector: "Industrials", name: "General Electric Company" },
    HON: { sector: "Industrials", name: "Honeywell International Inc." },
    UPS: { sector: "Industrials", name: "United Parcel Service, Inc." },
    RTX: { sector: "Industrials", name: "RTX Corporation" },
    LMT: { sector: "Industrials", name: "Lockheed Martin Corporation" },
    DE: { sector: "Industrials", name: "Deere & Company" },
    CISS: { sector: "Industrials", name: "C3is Inc." },

    // Real Estate
    PLD: { sector: "Real Estate", name: "Prologis, Inc." },
    AMT: { sector: "Real Estate", name: "American Tower Corporation" },
    EQIX: { sector: "Real Estate", name: "Equinix, Inc." },
    SPG: { sector: "Real Estate", name: "Simon Property Group, Inc." },
    O: { sector: "Real Estate", name: "Realty Income Corporation" },
    DLR: { sector: "Real Estate", name: "Digital Realty Trust, Inc." },

    // Utilities
    NEE: { sector: "Utilities", name: "NextEra Energy, Inc." },
    SO: { sector: "Utilities", name: "The Southern Company" },
    DUK: { sector: "Utilities", name: "Duke Energy Corporation" },
    CEG: { sector: "Utilities", name: "Constellation Energy Corporation" },

    // Materials
    LIN: { sector: "Materials", name: "Linde plc" },
    SHW: { sector: "Materials", name: "The Sherwin-Williams Company" },
    FCX: { sector: "Materials", name: "Freeport-McMoRan Inc." },
    APD: { sector: "Materials", name: "Air Products and Chemicals, Inc." },
    ECL: { sector: "Materials", name: "Ecolab Inc." },
    NEM: { sector: "Materials", name: "Newmont Corporation" },

    // ETFs & Indices
    VOO: { sector: "Index / ETF", name: "Vanguard S&P 500 ETF" },
    QQQ: { sector: "Index / ETF", name: "Invesco QQQ Trust" },
    QQQM: { sector: "Index / ETF", name: "Invesco NASDAQ 100 ETF" },
    SPY: { sector: "Index / ETF", name: "SPDR S&P 500 ETF Trust" },
    IVV: { sector: "Index / ETF", name: "iShares Core S&P 500 ETF" },
    VTI: { sector: "Index / ETF", name: "Vanguard Total Stock Market ETF" },
    VT: { sector: "Index / ETF", name: "Vanguard Total World Stock ETF" },
    VXUS: { sector: "Index / ETF", name: "Vanguard Total International Stock ETF" },
    SCHD: { sector: "Index / ETF", name: "Schwab U.S. Dividend Equity ETF" },
    SMH: { sector: "Index / ETF", name: "VanEck Semiconductor ETF" },
    SOXX: { sector: "Index / ETF", name: "iShares Semiconductor ETF" },
    XLK: { sector: "Index / ETF", name: "Technology Select Sector SPDR Fund" },
    XLF: { sector: "Index / ETF", name: "Financial Select Sector SPDR Fund" },
    XLE: { sector: "Index / ETF", name: "Energy Select Sector SPDR Fund" },
    XLV: { sector: "Index / ETF", name: "Health Care Select Sector SPDR Fund" },
    XLI: { sector: "Index / ETF", name: "Industrial Select Sector SPDR Fund" },
    XLY: { sector: "Index / ETF", name: "Consumer Discretionary Select Sector SPDR" },
    XLP: { sector: "Index / ETF", name: "Consumer Staples Select Sector SPDR" },
    XLU: { sector: "Index / ETF", name: "Utilities Select Sector SPDR Fund" },
    XLRE: { sector: "Index / ETF", name: "Real Estate Select Sector SPDR Fund" },
    XLB: { sector: "Index / ETF", name: "Materials Select Sector SPDR Fund" },
    ARKK: { sector: "Index / ETF", name: "ARK Innovation ETF" },
    IWM: { sector: "Index / ETF", name: "iShares Russell 2000 ETF" },
    BND: { sector: "Index / ETF", name: "Vanguard Total Bond Market ETF" },
    JEPI: { sector: "Index / ETF", name: "JPMorgan Equity Premium Income ETF" },
    JEPQ: { sector: "Index / ETF", name: "JPMorgan Nasdaq Equity Premium Income ETF" },
  };

  const key = symbol.toUpperCase().replace("/", ".");
  if (lookup[key]) {
    return lookup[key];
  }
  return { sector: "Other", name: symbol.toUpperCase() };
}
