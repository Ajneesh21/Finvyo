import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateXIRR } from "../lib/xirr-calculator";
import { calculateTWR } from "../lib/twr-calculator";
import { computePortfolioSummary } from "../lib/portfolio-engine";
import { Transaction, StockQuote } from "../lib/types";
import { calculateWACC, calculateDCF } from "../lib/dcf-engine";
import { FinancialData, DCFAssumptions } from "../lib/dcf-types";
import { validateTransaction, validateTransactionsList } from "../lib/validation";

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
  });
});
