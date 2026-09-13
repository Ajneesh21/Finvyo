export type TransactionType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "FEE"
  | "TAX"
  | "STOCK_SPLIT";

export interface Transaction {
  id: string;
  date: string; // ISO date format YYYY-MM-DD
  symbol: string; // Ticker (e.g. AAPL, NVDA, or CASH for deposit/withdrawal)
  type: TransactionType;
  shares: number; // Positive number (e.g. 2.5)
  price: number; // Price per share in USD
  amount: number; // Net cash flow impact (positive = cash received, negative = cash spent)
  fee?: number;
  accountBalance?: number; // Exact cash / buying power after this transaction (e.g. 30.61)
  notes?: string;
  exchangeRate?: number; // USD to INR exchange rate if present
}

export interface Holding {
  symbol: string;
  companyName: string;
  sector: string;
  shares: number;
  avgCostBasis: number;
  totalCostBasis: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  dividendsReceived: number;
  dayChange: number;
  dayChangePercent: number;
  portfolioWeight: number; // e.g. 24.5%
}

export interface RealizedTrade {
  id: string;
  symbol: string;
  sellDate: string;
  shares: number;
  sellPrice: number;
  costBasis: number;
  realizedGain: number;
  realizedGainPercent: number;
  holdingPeriodDays: number;
  taxType: "SHORT_TERM" | "LONG_TERM";
}

export interface SubPeriodReturn {
  startDate: string;
  endDate: string;
  startValue: number;
  cashFlow: number;
  endValue: number;
  periodReturn: number; // e.g. 0.045 = +4.5%
  cumulativeTWR: number; // e.g. 0.182 = +18.2%
}

export interface DailyPortfolioPoint {
  date: string;
  portfolioValue: number;
  netInvestedCapital: number;
  cashBalance: number;
  holdingsValue: number;
  unrealizedPnL: number;
  cumulativeTWR: number; // Time weighted return % to date (e.g. 25.4)
  simpleReturn?: number; // Simple return % on invested capital to date (e.g. 14.2)
  // Benchmark values normalized to same starting basis %
  sp500TWR?: number;
  nasdaqTWR?: number;
  nifty50TWR?: number;
  dowTWR?: number;
  msciWorldTWR?: number;
}

export interface BenchmarkMetrics {
  name: string;
  symbol: string;
  totalReturnPercent: number;
  annualizedReturnPercent: number;
  alpha: number; // Excess return vs portfolio
  beta: number; // Portfolio volatility vs this benchmark
  correlation: number;
  sharpeRatio: number;
  maxDrawdown: number;
  hypotheticalDCAValue: number; // What if user DCA'd into this index instead
  isEstimated?: boolean; // True if calculated using fallback offline estimates
}

export interface PortfolioSummary {
  totalValue: number;
  netInvestedCapital: number;
  totalDeposits: number;
  totalWithdrawals: number;
  cashBalance: number;
  holdingsValue: number;
  totalReturnAmount: number;
  totalReturnPercent: number;
  simpleReturnPercent?: number; // Simple / Absolute Return %
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  totalDividends: number;
  totalFees: number;
  twrPercent: number; // Cumulative Time-Weighted Return %
  annualizedTwrPercent: number; // CAGR TWR %
  xirrPercent: number; // Money-Weighted Return / IRR %
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
  firstTransactionDate: string;
  lastTransactionDate: string;
  daysActive: number;
  holdings: Holding[];
  realizedTrades: RealizedTrade[];
  timeline: DailyPortfolioPoint[];
  twrSubPeriods: SubPeriodReturn[];
  benchmarks: Record<string, BenchmarkMetrics>;
}

export interface StockQuote {
  symbol: string;
  shortName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  currency?: string;
  marketCap?: number;
  lastUpdated: string;
}

export interface ParsedPdfResult {
  success: boolean;
  transactions: Transaction[];
  accountInfo?: {
    accountNumber?: string;
    statementPeriod?: string;
    brokerName?: string;
    investorName?: string;
    cashBalance?: number;
    totalAccountValue?: number;
  };
  totalTransactionsParsed: number;
  errors?: string[];
  rawTextPreview?: string;
}
