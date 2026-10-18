import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateXIRR } from "../lib/xirr-calculator";
import { calculateTWR } from "../lib/twr-calculator";
import { computePortfolioSummary, detectSplitScale } from "../lib/portfolio-engine";
import { Transaction, StockQuote } from "../lib/types";
import { calculateWACC, calculateDCF } from "../lib/dcf-engine";
import { FinancialData, DCFAssumptions } from "../lib/dcf-types";
import { validateTransaction, validateTransactionsList } from "../lib/validation";
import {
  saveHistoricalPrices,
  getCachedHistoricalPrices,
  getCachedDateRange,
  getLatestCachedPrice,
  saveLatestStockPrice,
} from "../lib/historical-store";
import { getStockQuote } from "../lib/stock-api";
import { savePortfolio } from "../lib/storage";
import { GET as getPortfoliosApi } from "../app/api/portfolios/route";
import { NextRequest } from "next/server";

describe("XIRR Engine", () => {
  it("should calculate exact annual return for single 1-year investment", () => {
    // $10,000 invested on 2023-01-01, worth $11,000 on 2024-01-01 (10% return)
    const cashFlows = [
      { date: "2023-01-01", amount: -10000 },
      { date: "2024-01-01", amount: 11000 },
    ];
    const xirr = calculateXIRR(cashFlows);
    assert.ok(
      Math.abs(xirr - 10.0) < 0.25,
      `Expected ~10.0%, got ${xirr.toFixed(2)}%`
    );
  });

  it("should calculate multi-period cash flows accurately", () => {
    // $5,000 invested at t=0, $5,000 invested at t=6m, worth $11,500 at t=12m
    const cashFlows = [
      { date: "2023-01-01", amount: -5000 },
      { date: "2023-07-02", amount: -5000 },
      { date: "2024-01-01", amount: 11500 },
    ];
    const xirr = calculateXIRR(cashFlows);
    // Rough expected XIRR is ~20% annualized
    assert.ok(xirr > 18 && xirr < 23, `Expected ~20%, got ${xirr.toFixed(2)}%`);
  });

  it("should return 0 for degenerate or invalid cash flows", () => {
    assert.equal(calculateXIRR([]), 0);
    assert.equal(calculateXIRR([{ date: "2023-01-01", amount: -1000 }]), 0);
    assert.equal(
      calculateXIRR([
        { date: "2023-01-01", amount: -1000 },
        { date: "2023-06-01", amount: -2000 },
      ]),
      0
    );
  });
});

describe("TWR Engine (Time-Weighted Return)", () => {
  it("should isolate cash flows across sub-periods according to GIPS", () => {
    // Day 1: Deposit $1,000. Valuation is $1,000.
    // Day 50: Valuation grows to $1,100 (+10%). Deposit $1,000 brings value to $2,100.
    // Day 100: Valuation grows to $2,310 (+10% on $2,100).
    // Total compound return should be: (1.10 * 1.10 - 1) = 21.0%
    const initialDate = "2023-01-01";
    const eventDate = "2023-02-20";
    const finalDate = "2023-04-11";

    const cashFlows = [
      { date: initialDate, amount: 1000 },
      { date: eventDate, amount: 1000 },
    ];

    const dailyValuations = new Map<string, number>([
      [initialDate, 1000],
      [eventDate, 2100],
      [finalDate, 2310],
    ]);

    const result = calculateTWR(cashFlows, dailyValuations, initialDate, finalDate);
    assert.ok(
      Math.abs(result.cumulativeTwrPercent - 21.0) < 0.5,
      `Expected ~21.0%, got ${result.cumulativeTwrPercent.toFixed(2)}%`
    );
  });

  it("should handle deposits preceding stock purchases without negative distortion", () => {
    // Jan 1: Deposit $1,000 cash. Account value = $1,000.
    // Jan 15: Deposit $1,500 cash. Account value = $2,500. Cash sub-period return = 0%.
    // Feb 1: Buy $1,000 of AAPL with cash. Cash becomes $1,500, AAPL = $1,000. Total = $2,500.
    // Feb 15: AAPL appreciates by 20% to $1,200. Total value = $2,700 ($1,500 cash + $1,200 AAPL).
    // Sub-period return: ($2,700 - $2,500) / $2,500 = +8.0%.
    // Total compound TWR: 8.0%.
    const cashFlows = [
      { date: "2023-01-01", amount: 1000 },
      { date: "2023-01-15", amount: 1500 },
    ];

    const dailyValuations = new Map<string, number>([
      ["2023-01-01", 1000],
      ["2023-01-15", 2500],
      ["2023-02-01", 2500],
      ["2023-02-15", 2700],
    ]);

    const result = calculateTWR(cashFlows, dailyValuations, "2023-01-01", "2023-02-15");
    assert.ok(result.cumulativeTwrPercent > 0, `Expected positive TWR, got ${result.cumulativeTwrPercent}%`);
    assert.ok(
      Math.abs(result.cumulativeTwrPercent - 8.0) < 0.1,
      `Expected ~8.0%, got ${result.cumulativeTwrPercent.toFixed(2)}%`
    );
    assert.equal(result.subPeriods[0].periodReturn, 0);
  });
});

describe("FIFO Tax Lots & Portfolio Accounting Engine", () => {
  it("should correctly classify LTCG (> 730 days) vs STCG (<= 730 days) and match lots FIFO", async () => {
    const transactions: Transaction[] = [
      {
        id: "tx-dep",
        date: "2022-01-01T10:00:00Z",
        type: "DEPOSIT",
        symbol: "CASH",
        shares: 1,
        price: 10000,
        amount: 10000,
      },
      // Lot 1: Bought 10 shares at $100 on 2022-01-02 (> 730 days / 24 months before sell date 2024-01-15)
      {
        id: "tx-buy-1",
        date: "2022-01-02T10:00:00Z",
        type: "BUY",
        symbol: "AAPL",
        shares: 10,
        price: 100,
        amount: 1000,
      },
      // Lot 2: Bought 10 shares at $150 on 2023-11-01 (< 730 days before sell date 2024-01-15)
      {
        id: "tx-buy-2",
        date: "2023-11-01T10:00:00Z",
        type: "BUY",
        symbol: "AAPL",
        shares: 10,
        price: 150,
        amount: 1500,
      },
      // Sell: Sell 15 shares at $200 on 2024-01-15
      // Expected FIFO match:
      // - 10 shares from Lot 1: Cost $1,000, Proceeds $2,000 -> LTCG = +$1,000 (> 730 days)
      // - 5 shares from Lot 2: Cost $750, Proceeds $1,000 -> STCG = +$250 (<= 730 days)
      // Remaining holding: 5 shares from Lot 2 at $150 cost basis ($750)
      {
        id: "tx-sell-1",
        date: "2024-01-15T10:00:00Z",
        type: "SELL",
        symbol: "AAPL",
        shares: 15,
        price: 200,
        amount: 3000,
      },
    ];

    const quotesOverride: Record<string, StockQuote> = {
      AAPL: {
        symbol: "AAPL",
        regularMarketPrice: 200,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        lastUpdated: new Date().toISOString(),
      },
    };

    const summary = await computePortfolioSummary(transactions, quotesOverride);

    assert.equal(summary.realizedTrades.length, 2);

    const ltcgTrade = summary.realizedTrades.find((t) => t.taxType === "LONG_TERM");
    const stcgTrade = summary.realizedTrades.find((t) => t.taxType === "SHORT_TERM");

    assert.ok(ltcgTrade, "Should have a Long Term trade");
    assert.ok(stcgTrade, "Should have a Short Term trade");

    assert.equal(ltcgTrade?.shares, 10);
    assert.equal(ltcgTrade?.costBasis, 1000);
    assert.equal(ltcgTrade?.realizedGain, 1000);
    assert.ok(ltcgTrade && ltcgTrade.holdingPeriodDays > 730);

    assert.equal(stcgTrade?.shares, 5);
    assert.equal(stcgTrade?.costBasis, 750);
    assert.equal(stcgTrade?.realizedGain, 250);
    assert.ok(stcgTrade && stcgTrade.holdingPeriodDays <= 730);

    // Remaining holding check
    const aaplHolding = summary.holdings.find((h) => h.symbol === "AAPL");
    assert.ok(aaplHolding);
    assert.equal(aaplHolding.shares, 5);
    assert.equal(aaplHolding.avgCostBasis, 150);
    assert.equal(aaplHolding.totalCostBasis, 750);
  });

  it("should not double-count tx.fee when standalone FEE/TAX transactions exist", async () => {
    const transactions: Transaction[] = [
      {
        id: "tx-dep",
        date: "2023-01-01T10:00:00Z",
        type: "DEPOSIT",
        symbol: "CASH",
        shares: 1,
        price: 5000,
        amount: 5000,
      },
      // BUY with an attached broker fee of $3
      {
        id: "tx-buy",
        date: "2023-01-02T10:00:00Z",
        type: "BUY",
        symbol: "MSFT",
        shares: 10,
        price: 200,
        amount: 2000,
        fee: 3,
      },
      // Standalone FEE transaction of $7
      {
        id: "tx-fee",
        date: "2023-02-01T10:00:00Z",
        type: "FEE",
        symbol: "CASH",
        shares: 1,
        price: 7,
        amount: 7,
      },
    ];

    const quotesOverride: Record<string, StockQuote> = {
      MSFT: {
        symbol: "MSFT",
        regularMarketPrice: 200,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        lastUpdated: new Date().toISOString(),
      },
    };

    const summary = await computePortfolioSummary(transactions, quotesOverride);
    // Total fees must be 3 + 7 = 10 (not 10 + 7 = 17)
    assert.equal(summary.totalFees, 10);
  });
});

describe("DCF Valuation Engine", () => {
  const dummyFinancialData: FinancialData = {
    symbol: "TEST",
    companyName: "Test Corp",
    currency: "USD",
    currentPrice: 150.0,
    marketCap: 150000000000, // $150B
    beta: 1.1,
    dilutedShares: 1000000000, // 1B shares
    cash: 20000000000, // $20B
    investments: 10000000000, // $10B
    debt: 15000000000, // $15B
    otherClaims: 0,
    riskFreeRate: 4.25,
    equityRiskPremium: 5.5,
    costOfDebt: 5.0,
    trailingEps: 6.0,
    forwardEps: 6.6,
    trailingPE: 25.0,
    forwardPE: 22.7,
    historicalEpsGrowth: 12.0,
    latestRevenue: 50000000000, // $50B
    latestEbit: 15000000000, // $15B (30% margin)
    latestFCF: 12000000000,
    latestOperatingCashFlow: 14000000000,
    normalizedHistoricalGrowth: 10.0,
    normalizedEbitMargin: 30.0,
    normalizedTaxRate: 21.0,
    normalizedDaPercent: 3.5,
    normalizedCapexPercent: 4.0,
    normalizedNwcPercent: 1.0,
    historicalYears: [],
    dataSources: {},
    flags: {
      negativeFCF: false,
      unusualMargins: false,
      missingData: false,
      warningMessages: [],
    },
  };

  const dummyAssumptions: DCFAssumptions = {
    projectionYears: 5,
    revenueGrowth: [10.0, 10.0, 10.0, 10.0, 10.0],
    ebitMargin: [30.0, 30.0, 30.0, 30.0, 30.0],
    taxRate: 21.0,
    terminalGrowth: 2.5,
    riskFreeRate: 4.25,
    equityRiskPremium: 5.5,
    beta: 1.1,
    costOfDebt: 5.0,
    daPercentRevenue: 3.5,
    capexPercentRevenue: 4.0,
    nwcPercentRevenue: 1.0,
  };

  it("should correctly calculate CAPM Cost of Equity and WACC", () => {
    const wacc = calculateWACC(dummyFinancialData, dummyAssumptions);
    // Cost of Equity = 4.25 + 1.1 * 5.5 = 10.30%
    assert.equal(wacc.costOfEquity, 10.3);
    // After-tax cost of debt = 5.0 * (1 - 0.21) = 3.95%
    assert.equal(wacc.afterTaxCostOfDebt, 3.95);
    // WACC should be between after-tax cost of debt (3.95%) and cost of equity (10.30%)
    assert.ok(wacc.wacc > 3.95 && wacc.wacc < 10.3);
  });

  it("should correctly bridge Enterprise Value to Equity Value and share price", () => {
    const dcf = calculateDCF(dummyFinancialData, dummyAssumptions, 5, "BASE");

    assert.ok(dcf.enterpriseValue > 0);
    assert.ok(dcf.pvTerminalValue > 0);

    // Equity Value = Enterprise Value + Cash + Investments - Debt - Other Claims
    // For our data: EV + 20B + 10B - 15B = EV + 15B
    const expectedEquityValue =
      dcf.enterpriseValue +
      dummyFinancialData.cash +
      dummyFinancialData.investments -
      dummyFinancialData.debt;

    assert.equal(dcf.equityValue, Math.round(expectedEquityValue));

    // Fair value per share = Equity Value / Diluted Shares
    const expectedSharePrice = Number(
      (dcf.equityValue / dummyFinancialData.dilutedShares).toFixed(2)
    );
    assert.equal(dcf.intrinsicValuePerShare, expectedSharePrice);
  });
});

describe("Input Validation Engine", () => {
  it("should accept valid transactions with ISO datetime and standard date", () => {
    const validTx = {
      id: "tx-1",
      date: "2026-01-23T10:26:22",
      type: "BUY",
      symbol: "AAPL",
      shares: 10,
      price: 150,
      amount: 1500,
    };
    const res = validateTransaction(validTx, 0);
    assert.equal(res.valid, true);
  });

  it("should reject malformed date strings", () => {
    const invalidTx = {
      date: "invalid-date-string",
      type: "BUY",
      symbol: "AAPL",
      shares: 10,
      price: 150,
    };
    const res = validateTransaction(invalidTx, 0);
    assert.equal(res.valid, false);
    assert.match(res.error || "", /invalid date/i);
  });

  it("should reject negative shares or prices", () => {
    const negShares = {
      date: "2026-01-01",
      type: "BUY",
      symbol: "AAPL",
      shares: -5,
      price: 150,
    };
    const res1 = validateTransaction(negShares, 0);
    assert.equal(res1.valid, false);
    assert.match(res1.error || "", /invalid shares/i);

    const negPrice = {
      date: "2026-01-01",
      type: "BUY",
      symbol: "AAPL",
      shares: 5,
      price: -150,
    };
    const res2 = validateTransaction(negPrice, 0);
    assert.equal(res2.valid, false);
    assert.match(res2.error || "", /invalid price/i);
  });

  it("should reject unknown transaction types", () => {
    const invalidTx = {
      date: "2026-01-01",
      type: "GAMBLE",
      symbol: "AAPL",
      shares: 5,
      price: 100,
    };
    const res = validateTransaction(invalidTx, 0);
    assert.equal(res.valid, false);
    assert.match(res.error || "", /unknown type/i);
  });

  it("should reject missing or empty symbols", () => {
    const invalidTx = {
      date: "2026-01-01",
      type: "BUY",
      symbol: "   ",
      shares: 5,
      price: 100,
    };
    const res = validateTransaction(invalidTx, 0);
    assert.equal(res.valid, false);
    assert.match(res.error || "", /missing or empty symbol/i);
  });

  it("should validate a list of transactions and reject if exceeding max limit", () => {
    const validList = [
      {
        id: "tx-1",
        date: "2026-01-01",
        type: "BUY",
        symbol: "AAPL",
        shares: 1,
        price: 100,
        amount: 100,
      },
    ];
    const okRes = validateTransactionsList(validList, 10);
    assert.equal(okRes.valid, true);
    assert.equal(okRes.validatedList?.length, 1);

    const overLimit = validateTransactionsList(validList, 0);
    assert.equal(overLimit.valid, false);
    assert.match(overLimit.error || "", /maximum .* allowed/i);

    const nonArr = validateTransactionsList("not-an-array", 10);
    assert.equal(nonArr.valid, false);
    assert.match(nonArr.error || "", /must contain an array/i);
  });
});

describe("Portfolio Accounting Edge Cases", () => {
  it("should compute portfolio summary correctly for a no-deposit portfolio (pure stock trades)", async () => {
    const transactions: Transaction[] = [
      {
        id: "tx-buy-1",
        date: "2024-01-01T10:00:00Z",
        type: "BUY",
        symbol: "MSFT",
        shares: 10,
        price: 300,
        amount: 3000,
      },
      {
        id: "tx-buy-2",
        date: "2024-02-01T10:00:00Z",
        type: "BUY",
        symbol: "MSFT",
        shares: 5,
        price: 350,
        amount: 1750,
      },
    ];

    const quotesOverride: Record<string, StockQuote> = {
      MSFT: {
        symbol: "MSFT",
        regularMarketPrice: 400,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        lastUpdated: new Date().toISOString(),
      },
    };

    const summary = await computePortfolioSummary(transactions, quotesOverride);
    assert.equal(summary.holdings.length, 1);
    assert.equal(summary.holdings[0].shares, 15);
    assert.equal(summary.holdings[0].totalCostBasis, 4750);
    assert.equal(summary.netInvestedCapital, 4750);
    assert.equal(summary.holdingsValue, 6000);
    assert.equal(summary.unrealizedPnL, 1250);
    assert.ok(summary.twrPercent > 0);
    assert.ok(typeof summary.simpleReturnPercent === "number");
    assert.ok(summary.simpleReturnPercent > 0);
    assert.equal(
      summary.timeline[summary.timeline.length - 1].cumulativeTWR,
      summary.twrPercent,
      "Final point in timeline must match summary.twrPercent"
    );
  });

  it("should ensure timeline final point cumulativeTWR strictly matches summary.twrPercent across multiple cash deposits", async () => {
    const transactions: Transaction[] = [
      {
        id: "tx-dep-1",
        date: "2024-01-01T10:00:00Z",
        type: "DEPOSIT",
        symbol: "CASH",
        shares: 1,
        price: 5000,
        amount: 5000,
      },
      {
        id: "tx-buy-1",
        date: "2024-01-02T10:00:00Z",
        type: "BUY",
        symbol: "AAPL",
        shares: 20,
        price: 150,
        amount: 3000,
      },
      {
        id: "tx-dep-2",
        date: "2024-03-01T10:00:00Z",
        type: "DEPOSIT",
        symbol: "CASH",
        shares: 1,
        price: 2000,
        amount: 2000,
      },
      {
        id: "tx-buy-2",
        date: "2024-03-05T10:00:00Z",
        type: "BUY",
        symbol: "AAPL",
        shares: 10,
        price: 180,
        amount: 1800,
      },
    ];

    const quotesOverride: Record<string, StockQuote> = {
      AAPL: {
        symbol: "AAPL",
        regularMarketPrice: 220,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        lastUpdated: new Date().toISOString(),
      },
    };

    const summary = await computePortfolioSummary(transactions, quotesOverride);
    assert.ok(summary.timeline.length > 0);
    assert.equal(
      summary.timeline[summary.timeline.length - 1].cumulativeTWR,
      summary.twrPercent,
      `Expected graph end ${summary.timeline[summary.timeline.length - 1].cumulativeTWR} to equal summary TWR ${summary.twrPercent}`
    );
    assert.equal(summary.totalDeposits, 7000);
    assert.ok(typeof summary.simpleReturnPercent === "number");
    assert.equal(summary.timeline[0].cumulativeTWR, 0);
  });
});

describe("Stock Split Detection & Normalization", () => {
  it("should never scale market price fluctuations, including 25%, 30%, or 40% drops", () => {
    // Exact 25% drop (ratio 0.75)
    assert.equal(detectSplitScale(0.75), 1.0);
    // Severe 30% drop (ratio 0.70)
    assert.equal(detectSplitScale(0.70), 1.0);
    // Severe 35% drop (ratio 0.65)
    assert.equal(detectSplitScale(0.65), 1.0);
    // Severe 40% drop (ratio 0.60)
    assert.equal(detectSplitScale(0.60), 1.0);
    // Moderate variations and gains
    assert.equal(detectSplitScale(1.0), 1.0);
    assert.equal(detectSplitScale(1.05), 1.0);
    assert.equal(detectSplitScale(0.92), 1.0);
    assert.equal(detectSplitScale(1.25), 1.0);
    assert.equal(detectSplitScale(1.50), 1.0);
  });

  it("should accurately detect and scale 1:2 reverse splits (~2.0x)", () => {
    assert.equal(detectSplitScale(2.0), 2.0);
    assert.equal(detectSplitScale(1.95), 2.0);
    assert.equal(detectSplitScale(2.08), 2.0);
  });

  it("should accurately detect and scale 2:1 forward splits (~0.5x)", () => {
    assert.equal(detectSplitScale(0.5), 0.5);
    assert.equal(detectSplitScale(0.48), 0.5);
    assert.equal(detectSplitScale(0.52), 0.5);
  });

  it("should accurately detect standard integer splits (3:1, 4:1, 1:3, 1:4, 10:1)", () => {
    assert.ok(Math.abs(detectSplitScale(0.33) - 1 / 3) < 0.001);
    assert.equal(detectSplitScale(0.25), 0.25);
    assert.equal(detectSplitScale(3.0), 3.0);
    assert.equal(detectSplitScale(4.0), 4.0);
    assert.equal(detectSplitScale(10.0), 10.0);
  });

  it("should accurately scale large penny stock reverse splits (e.g. 1:125, 1:46, 1:200)", () => {
    assert.equal(detectSplitScale(124.8), 125);
    assert.equal(detectSplitScale(125.0), 125);
    assert.equal(detectSplitScale(46.1), 46);
    assert.equal(detectSplitScale(200.0), 200);
  });

  it("should safely default to 1.0 for unconfirmed ratios", () => {
    assert.equal(detectSplitScale(1.72), 1.0);
    assert.equal(detectSplitScale(0.57), 1.0);
    assert.equal(detectSplitScale(2.40), 1.0);
  });
});

describe("Portfolio Risk Metrics (Volatility, Sharpe, Max Drawdown)", () => {
  it("should not inflate annualized volatility when large cash deposits occur", async () => {
    // Portfolio with steady 0% stock movement but massive cash deposits ($1,000 -> $5,000 -> $10,000)
    const transactions: Transaction[] = [
      { id: "d1", date: "2024-01-01T10:00:00Z", type: "DEPOSIT", symbol: "CASH", shares: 0, price: 1, amount: 1000 },
      { id: "b1", date: "2024-01-02T10:00:00Z", type: "BUY", symbol: "AAPL", shares: 10, price: 100, amount: 1000 },
      { id: "d2", date: "2024-01-05T10:00:00Z", type: "DEPOSIT", symbol: "CASH", shares: 0, price: 1, amount: 5000 },
      { id: "b2", date: "2024-01-08T10:00:00Z", type: "BUY", symbol: "AAPL", shares: 50, price: 100, amount: 5000 },
      { id: "d3", date: "2024-01-10T10:00:00Z", type: "DEPOSIT", symbol: "CASH", shares: 0, price: 1, amount: 10000 },
    ];

    const quotesOverride: Record<string, StockQuote> = {
      AAPL: {
        symbol: "AAPL",
        regularMarketPrice: 100,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        lastUpdated: new Date().toISOString(),
      },
    };

    const summary = await computePortfolioSummary(transactions, quotesOverride);
    // Because underlying asset price is flat ($100), pure volatility should be ~0%, NOT hundreds of percent
    assert.ok(
      summary.volatility < 10.0,
      `Expected low volatility (<10%) for flat asset despite deposits, got ${summary.volatility}%`
    );
    // Drawdown should be 0% since no asset loss occurred
    assert.equal(summary.maxDrawdown, 0);
  });
});

describe("Portfolio Timeline Continuity & Weekend Handling", () => {
  it("should generate continuous daily points including Friday and Sunday over a multi-month period", async () => {
    // 120-day span (previously caused step = 2 to skip alternate days like Friday and Sunday)
    const transactions: Transaction[] = [
      {
        id: "d-start",
        date: "2026-05-01T10:00:00Z",
        type: "DEPOSIT",
        symbol: "CASH",
        shares: 0,
        price: 1,
        amount: 5000,
      },
      {
        id: "b-start",
        date: "2026-05-02T10:00:00Z",
        type: "BUY",
        symbol: "AAPL",
        shares: 25,
        price: 180,
        amount: 4500,
      },
    ];

    const quotesOverride: Record<string, StockQuote> = {
      AAPL: {
        symbol: "AAPL",
        regularMarketPrice: 200,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        lastUpdated: new Date().toISOString(),
      },
    };

    const summary = await computePortfolioSummary(transactions, quotesOverride);
    assert.ok(summary.timeline.length >= 100, `Expected at least 100 timeline points, got ${summary.timeline.length}`);

    // Verify all consecutive days exist with step = 1 (no gaps)
    for (let i = 1; i < summary.timeline.length; i++) {
      const prevDate = new Date(`${summary.timeline[i - 1].date}T00:00:00Z`);
      const currDate = new Date(`${summary.timeline[i].date}T00:00:00Z`);
      const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (86400 * 1000));
      assert.equal(
        diffDays,
        1,
        `Expected exactly 1 day step between ${summary.timeline[i - 1].date} and ${summary.timeline[i].date}, got ${diffDays}`
      );
    }

    // Verify Friday and Sunday explicitly exist in the recent days of the timeline
    const daysOfWeek = summary.timeline.map((pt) =>
      new Date(`${pt.date}T00:00:00Z`).getUTCDay()
    );
    // 0 = Sunday, 5 = Friday
    assert.ok(daysOfWeek.includes(5), "Timeline must include Friday (day 5)");
    assert.ok(daysOfWeek.includes(0), "Timeline must include Sunday (day 0)");
    assert.ok(daysOfWeek.includes(6), "Timeline must include Saturday (day 6)");
  });
});

describe("Persistent Historical Price Store & Caching", () => {
  it("should persist and retrieve immutable historical stock prices", async () => {
    const testSymbol = "TEST_MSFT";
    const points = [
      { date: "2026-01-15", close: 420.5 },
      { date: "2026-01-16", close: 425.0 },
      { date: "2026-01-17", close: 422.3 },
    ];

    await saveHistoricalPrices(testSymbol, points, false);

    const cached = getCachedHistoricalPrices(testSymbol, "2026-01-15", false);
    assert.ok(cached !== null, "Expected cached record to exist");
    assert.equal(cached.points.length, 3);
    assert.equal(cached.points[0].close, 420.5);
    assert.equal(cached.points[1].close, 425.0);
    assert.equal(cached.points[2].close, 422.3);

    const range = getCachedDateRange(testSymbol, false);
    assert.ok(range !== null);
    assert.equal(range.earliestDate, "2026-01-15");
    assert.equal(range.latestDate, "2026-01-17");
    assert.equal(range.count, 3);
  });

  it("should merge new dates without overwriting past immutable prices", async () => {
    const testSymbol = "TEST_AAPL";
    const initialPoints = [
      { date: "2026-01-10", close: 180.0 },
      { date: "2026-01-11", close: 182.5 },
    ];
    await saveHistoricalPrices(testSymbol, initialPoints, true);

    const newPoints = [
      { date: "2026-01-12", close: 185.0 },
      { date: "2026-01-13", close: 184.2 },
    ];
    await saveHistoricalPrices(testSymbol, newPoints, true);

    const cached = getCachedHistoricalPrices(testSymbol, "2026-01-10", true);
    assert.ok(cached !== null);
    assert.equal(cached.points.length, 4);
    assert.equal(cached.points[0].date, "2026-01-10");
    assert.equal(cached.points[0].close, 180.0);
    assert.equal(cached.points[3].date, "2026-01-13");
    assert.equal(cached.points[3].close, 184.2);
  });
});

describe("Table Pagination Engine", () => {
  it("should correctly compute pages and slice lists within boundary ranges", () => {
    const items = Array.from({ length: 95 }, (_, i) => ({ id: `item-${i + 1}`, value: i + 1 }));
    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

    assert.equal(totalPages, 4);

    // Page 1
    const p1Start = (1 - 1) * pageSize;
    const p1Items = items.slice(p1Start, p1Start + pageSize);
    assert.equal(p1Items.length, 25);
    assert.equal(p1Items[0].id, "item-1");
    assert.equal(p1Items[24].id, "item-25");

    // Page 4 (last page, partial)
    const p4Start = (4 - 1) * pageSize;
    const p4Items = items.slice(p4Start, p4Start + pageSize);
    assert.equal(p4Items.length, 20);
    assert.equal(p4Items[0].id, "item-76");
    assert.equal(p4Items[19].id, "item-95");
  });

  it("should handle empty or single-item lists safely", () => {
    const empty: number[] = [];
    const totalPagesEmpty = Math.max(1, Math.ceil(empty.length / 10));
    assert.equal(totalPagesEmpty, 1);
    assert.equal(empty.slice(0, 10).length, 0);

    const single = [{ id: "tx-1" }];
    const totalPagesSingle = Math.max(1, Math.ceil(single.length / 10));
    assert.equal(totalPagesSingle, 1);
    assert.equal(single.slice(0, 10).length, 1);
  });
});

describe("Server-Side Pagination API (/api/portfolios)", () => {
  const testPortfolioId = "test-pagination-port-1";

  it("should setup test portfolio with transactions, twr sub-periods, and trades", async () => {
    const txs: Transaction[] = Array.from({ length: 35 }, (_, i) => ({
      id: `tx-${i + 1}`,
      date: `2025-01-${String((i % 28) + 1).padStart(2, "0")}`,
      type: i % 2 === 0 ? "BUY" : "SELL",
      symbol: i % 3 === 0 ? "NVDA" : "AAPL",
      shares: 10,
      price: 150 + i,
      amount: (150 + i) * 10,
      fee: 1.5,
    }));

    const twrSubPeriods = Array.from({ length: 25 }, (_, i) => ({
      startDate: `2025-01-${String((i % 28) + 1).padStart(2, "0")}`,
      endDate: `2025-01-${String((i % 28) + 2).padStart(2, "0")}`,
      startValue: 1000 + i * 50,
      endValue: 1050 + i * 50,
      cashFlow: 0,
      periodReturn: 0.05,
      cumulativeTWR: 0.05 * (i + 1),
    }));

    const realizedTrades = Array.from({ length: 22 }, (_, i) => ({
      id: `trade-${i + 1}`,
      symbol: i % 2 === 0 ? "AAPL" : "MSFT",
      shares: 5,
      buyDate: "2024-01-01",
      sellDate: "2025-01-01",
      buyPrice: 100,
      sellPrice: 120 + i,
      costBasis: 500,
      proceeds: (120 + i) * 5,
      realizedGain: (120 + i) * 5 - 500,
      realizedGainPercent: (((120 + i) * 5 - 500) / 500) * 100,
      holdingPeriodDays: i % 2 === 0 ? 800 : 180,
      taxType: (i % 2 === 0 ? "LONG_TERM" : "SHORT_TERM") as "LONG_TERM" | "SHORT_TERM",
    }));

    await savePortfolio({
      id: testPortfolioId,
      name: "Pagination Test Portfolio",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions: txs,
      lastComputedSummary: {
        twrSubPeriods,
        realizedTrades,
      } as any,
    });
  });

  it("should paginate transactions on-demand from the server", async () => {
    // Request page 1 with pageSize=10
    const req1 = new NextRequest(
      `http://localhost:3000/api/portfolios?id=${testPortfolioId}&resource=transactions&page=1&pageSize=10`
    );
    const res1 = await getPortfoliosApi(req1);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.pagination.page, 1);
    assert.equal(data1.pagination.pageSize, 10);
    assert.equal(data1.pagination.total, 35);
    assert.equal(data1.pagination.totalPages, 4);
    assert.equal(data1.transactions.length, 10);

    // Request page 4 (last page) with pageSize=10
    const req4 = new NextRequest(
      `http://localhost:3000/api/portfolios?id=${testPortfolioId}&resource=transactions&page=4&pageSize=10`
    );
    const res4 = await getPortfoliosApi(req4);
    const data4 = await res4.json();
    assert.equal(data4.pagination.page, 4);
    assert.equal(data4.transactions.length, 5);
  });

  it("should paginate and filter TWR sub-periods from the server", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/portfolios?id=${testPortfolioId}&resource=twr&page=2&pageSize=10`
    );
    const res = await getPortfoliosApi(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.pagination.page, 2);
    assert.equal(data.pagination.pageSize, 10);
    assert.equal(data.pagination.total, 25);
    assert.equal(data.pagination.totalPages, 3);
    assert.equal(data.twrSubPeriods.length, 10);
  });

  it("should paginate and filter Realized Trades by tax category from the server", async () => {
    // Filter SHORT_TERM trades (11 total)
    const req = new NextRequest(
      `http://localhost:3000/api/portfolios?id=${testPortfolioId}&resource=trades&page=1&pageSize=5&taxType=SHORT_TERM`
    );
    const res = await getPortfoliosApi(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.pagination.page, 1);
    assert.equal(data.pagination.pageSize, 5);
    assert.equal(data.pagination.total, 11);
    assert.equal(data.pagination.totalPages, 3);
    assert.equal(data.realizedTrades.length, 5);
    assert.ok(data.realizedTrades.every((t: any) => t.taxType === "SHORT_TERM"));
  });
});

describe("Offline Resilience & Price Persistence Engine", () => {
  const offlineSym = "TEST_OFFLINE_TECH";

  it("should retrieve latest cached market price when external API is unreachable", async () => {
    await saveHistoricalPrices(offlineSym, [
      { date: "2026-09-01", close: 100.0 },
      { date: "2026-09-15", close: 145.5 },
      { date: "2026-10-12", close: 185.75 },
    ], false);

    const latest = getLatestCachedPrice(offlineSym);
    assert.ok(latest !== null, "Expected cached price to exist");
    assert.equal(latest.date, "2026-10-12");
    assert.equal(latest.price, 185.75);

    // Verify getStockQuote returns the cached price without crashing or returning 0
    const quote = await getStockQuote(offlineSym);
    assert.equal(quote.regularMarketPrice, 185.75);
    assert.equal(quote.symbol, offlineSym);
  });

  it("should prevent portfolio valuation from collapsing to purchase cost basis when offline", async () => {
    // Stock bought months ago at $100, but market price reached $185.75
    const txs: Transaction[] = [
      {
        id: "tx-test-off-1",
        date: "2026-01-15T10:00:00",
        type: "BUY",
        symbol: offlineSym,
        shares: 10,
        price: 100.0,
        amount: -1000.0,
      },
    ];

    // Compute portfolio summary without external network quotes (simulating no internet)
    const summary = await computePortfolioSummary(txs);

    // Verify holdings are valued at market close ($185.75 * 10 = $1,857.50), NOT purchase price ($1,000)
    assert.equal(summary.holdings.length, 1);
    assert.equal(summary.holdings[0].currentPrice, 185.75);
    assert.equal(summary.holdings[0].currentValue, 1857.5);
    assert.equal(summary.holdingsValue, 1857.5);
    assert.equal(summary.unrealizedPnL, 857.5);
    assert.ok(summary.twrPercent > 80, `Expected TWR ~85.75%, got ${summary.twrPercent}%`);

    // Verify timeline doesn't drop off a cliff on the last day
    const tl = summary.timeline;
    assert.ok(tl.length >= 2, "Expected multiple timeline points");
    const lastPoint = tl[tl.length - 1];
    const prevPoint = tl[tl.length - 2];
    assert.ok(
      Math.abs(lastPoint.portfolioValue - prevPoint.portfolioValue) < 50,
      `Expected smooth portfolio value between ${prevPoint.date} and ${lastPoint.date}`
    );
  });

  it("should accurately calculate dayChange using regular market prices and previous close", async () => {
    const sym = "TEST_DAY_CHANGE";
    await saveHistoricalPrices(sym, [
      { date: "2026-10-14", close: 500.0 },
      { date: "2026-10-15", close: 539.44 },
    ], false);

    const txs: Transaction[] = [
      {
        id: "tx-dc-1",
        date: "2026-08-01T10:00:00",
        type: "BUY",
        symbol: sym,
        shares: 10,
        price: 400.0,
        amount: -4000.0,
      },
    ];

    // Simulate regular market quote with regularMarketPrice = 529.05, previousClose = 539.44
    // (change = -10.39, NOT fulldayChange = -12.608)
    const mockQuote: Record<string, import("../lib/types").StockQuote> = {
      [sym]: {
        symbol: sym,
        regularMarketPrice: 529.05,
        regularMarketChange: -10.39,
        regularMarketChangePercent: -1.93,
        regularMarketPreviousClose: 539.44,
        lastUpdated: new Date().toISOString(),
      },
    };

    const summary = await computePortfolioSummary(txs, mockQuote);
    assert.equal(summary.holdings.length, 1);
    const h = summary.holdings[0];

    // Day change should be 10 shares * (529.05 - 539.44) = -103.90, exactly matching broker statement
    assert.equal(h.dayChange, -103.9);
    assert.ok(Math.abs(h.dayChangePercent - (-1.93)) < 0.05);
  });
});




