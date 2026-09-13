import {
  Transaction,
  Holding,
  RealizedTrade,
  PortfolioSummary,
  DailyPortfolioPoint,
  StockQuote,
} from "./types";
import { getTickerSector } from "./utils";
import { calculateTWR, CashFlowEvent, alignTimelineTWRSeries } from "./twr-calculator";
import { calculateXIRR } from "./xirr-calculator";
import { getMultipleStockQuotes, getStockDailyHistory } from "./stock-api";
import { computeBenchmarkMetrics } from "./benchmark-service";

interface BuyLot {
  shares: number;
  price: number;
  date: string;
}

export async function computePortfolioSummary(
  transactions: Transaction[],
  quotesOverride?: Record<string, StockQuote>
): Promise<PortfolioSummary> {
  if (!transactions || transactions.length === 0) {
    return createEmptyPortfolioSummary();
  }

  // Filter out any legacy synthetic initialization transactions if real activity exists
  const hasRealDeposits = transactions.some(
    (t) => t.type === "DEPOSIT" && !t.id.startsWith("tx-init")
  );
  const sanitizedTx = hasRealDeposits
    ? transactions.filter((t) => !t.id.startsWith("tx-init"))
    : transactions;

  // Sort transactions chronologically
  const sortedTx = [...sanitizedTx].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // First transaction date represents account inception
  const firstTransactionDate = sortedTx[0].date.split("T")[0];
  const lastTransactionDate =
    sortedTx[sortedTx.length - 1].date.split("T")[0] > new Date().toISOString().split("T")[0]
      ? sortedTx[sortedTx.length - 1].date.split("T")[0]
      : new Date().toISOString().split("T")[0];

  // Unique symbols in portfolio
  const symbols = Array.from(
    new Set(
      sortedTx
        .map((t) => t.symbol.trim().toUpperCase())
        .filter((s) => s && s !== "CASH" && s !== "USD")
    )
  );

  // Fetch real-time quotes directly from Finnhub & Yahoo Finance
  const quotes = quotesOverride || (await getMultipleStockQuotes(symbols));

  // 1. Process positions, cost basis, realized gains, and cash
  let cashBalance = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalDividends = 0;
  let totalFees = 0;
  let totalRealizedPnL = 0;

  const holdingsMap = new Map<
    string,
    {
      shares: number;
      buyLots: BuyLot[];
      dividendsReceived: number;
      totalBoughtCost: number;
      totalBoughtShares: number;
    }
  >();

  const realizedTrades: RealizedTrade[] = [];

  for (const tx of sortedTx) {
    const symbol = tx.symbol.trim().toUpperCase();
    const type = tx.type;
    const fee = tx.fee || 0;
    if (type !== "FEE" && type !== "TAX" && type !== "STOCK_SPLIT") {
      totalFees += fee;
    }

    if (type === "DEPOSIT") {
      const dep = Math.abs(tx.amount || tx.price * (tx.shares || 1));
      cashBalance += dep - fee;
      totalDeposits += dep;
    } else if (type === "WITHDRAWAL") {
      const wth = Math.abs(tx.amount || tx.price * (tx.shares || 1));
      cashBalance -= wth + fee;
      totalWithdrawals += wth;
    } else if (type === "DIVIDEND") {
      const div = Math.abs(tx.amount);
      cashBalance += div - fee;
      totalDividends += div;

      if (symbol !== "CASH") {
        if (!holdingsMap.has(symbol)) {
          holdingsMap.set(symbol, {
            shares: 0,
            buyLots: [],
            dividendsReceived: 0,
            totalBoughtCost: 0,
            totalBoughtShares: 0,
          });
        }
        holdingsMap.get(symbol)!.dividendsReceived += div;
      }
    } else if (type === "BUY") {
      const shares = Math.abs(tx.shares);
      const price = Math.abs(tx.price);
      const cost = Math.abs(tx.amount) > 0 ? Math.abs(tx.amount) : shares * price;
      cashBalance -= cost + fee;

      if (!holdingsMap.has(symbol)) {
        holdingsMap.set(symbol, {
          shares: 0,
          buyLots: [],
          dividendsReceived: 0,
          totalBoughtCost: 0,
          totalBoughtShares: 0,
        });
      }
      const pos = holdingsMap.get(symbol)!;
      pos.shares += shares;
      pos.totalBoughtShares += shares;
      pos.totalBoughtCost += cost;
      pos.buyLots.push({ shares, price: cost / (shares || 1), date: tx.date });
    } else if (type === "SELL") {
      const sharesToSell = Math.abs(tx.shares);
      const sellPrice = Math.abs(tx.price);
      const proceeds = Math.abs(tx.amount) > 0 ? Math.abs(tx.amount) : sharesToSell * sellPrice;
      cashBalance += proceeds - fee;

      if (!holdingsMap.has(symbol)) {
        holdingsMap.set(symbol, {
          shares: 0,
          buyLots: [],
          dividendsReceived: 0,
          totalBoughtCost: 0,
          totalBoughtShares: 0,
        });
      }
      const pos = holdingsMap.get(symbol)!;

      let remainingToSell = sharesToSell;
      let totalCostOfSoldShares = 0;

      while (remainingToSell > 0.00001 && pos.buyLots.length > 0) {
        const lot = pos.buyLots[0];
        const lotSharesSold = Math.min(lot.shares, remainingToSell);
        const lotCost = lotSharesSold * lot.price;
        const lotProceeds = lotSharesSold * sellPrice;
        const lotFee = sharesToSell > 0 ? (lotSharesSold / sharesToSell) * fee : 0;
        const lotGain = lotProceeds - lotCost - lotFee;

        totalCostOfSoldShares += lotCost;
        remainingToSell -= lotSharesSold;
        lot.shares -= lotSharesSold;
        if (lot.shares <= 0.00001) {
          pos.buyLots.shift();
        }

        const d1 = new Date(lot.date).getTime();
        const d2 = new Date(tx.date).getTime();
        const holdingDays = Math.max(1, Math.floor((d2 - d1) / (1000 * 86400)));

        realizedTrades.push({
          id: `rt-${realizedTrades.length + 1}`,
          symbol,
          sellDate: tx.date,
          shares: Number(lotSharesSold.toFixed(4)),
          sellPrice,
          costBasis: Number(lotCost.toFixed(2)),
          realizedGain: Number(lotGain.toFixed(2)),
          realizedGainPercent:
            lotCost > 0 ? Number(((lotGain / lotCost) * 100).toFixed(2)) : 0,
          holdingPeriodDays: holdingDays,
          taxType: holdingDays > 730 ? "LONG_TERM" : "SHORT_TERM",
        });
      }

      if (remainingToSell > 0.00001) {
        // No matching buy lots found for these shares (e.g. imported CSV missing history).
        // Assume zero realized gain rather than fabricating a cost basis with an arbitrary
        // multiplier. The user should reconcile missing buy history separately.
        const lotCost = remainingToSell * sellPrice; // cost = proceeds → gain = 0
        const lotProceeds = remainingToSell * sellPrice;
        const lotGain = 0;
        totalCostOfSoldShares += lotCost;

        realizedTrades.push({
          id: `rt-${realizedTrades.length + 1}`,
          symbol,
          sellDate: tx.date,
          shares: Number(remainingToSell.toFixed(4)),
          sellPrice,
          costBasis: Number(lotCost.toFixed(2)),
          realizedGain: Number(lotGain.toFixed(2)),
          realizedGainPercent: 0,
          holdingPeriodDays: 1,
          taxType: "SHORT_TERM",
        });
        remainingToSell = 0;
      }

      pos.shares = Math.max(0, pos.shares - sharesToSell);

      const realizedGain = proceeds - totalCostOfSoldShares - fee;
      totalRealizedPnL += realizedGain;
    } else if (type === "FEE" || type === "TAX") {
      const amt = Math.abs(tx.amount || fee);
      totalFees += amt;
      cashBalance -= amt;
    } else if (type === "STOCK_SPLIT") {
      // tx.shares encodes the split multiplier:
      //   2.0  → two-for-one (share count doubles, price per share halves)
      //   0.5  → one-for-two reverse split (share count halves, price per share doubles)
      // No cash impact. Total cost basis is unchanged; per-share cost adjusts inversely.
      const multiplier = Math.abs(tx.shares) || 1;
      if (holdingsMap.has(symbol)) {
        const pos = holdingsMap.get(symbol)!;
        pos.shares = pos.shares * multiplier;
        pos.totalBoughtShares = pos.totalBoughtShares * multiplier;
        // Adjust each lot: more shares at a proportionally lower per-share cost
        pos.buyLots.forEach((lot) => {
          lot.shares = lot.shares * multiplier;
          lot.price = lot.price / multiplier; // per-share cost scales inversely
        });
        // pos.totalBoughtCost stays the same (total dollars invested is unchanged)
      }
    }
  }

  // 2. Compute Open Holdings with Real-Time Market Prices from Finnhub / Yahoo
  let totalHoldingsValue = 0;
  let totalCostBasis = 0;

  const holdings: Holding[] = [];

  holdingsMap.forEach((pos, symbol) => {
    if (pos.shares <= 0.0001) return;

    const quote = quotes[symbol];
    const livePrice = quote?.regularMarketPrice;
    const fallbackBuyPrice =
      pos.buyLots.length > 0
        ? pos.buyLots[0].price
        : pos.totalBoughtShares > 0
        ? pos.totalBoughtCost / pos.totalBoughtShares
        : 0; // No cost data — use 0 rather than fabricating a $100 price

    const currentPrice = livePrice && livePrice > 0 ? livePrice : fallbackBuyPrice;
    const currentValue = pos.shares * currentPrice;

    let costBasis = pos.buyLots.reduce(
      (sum, lot) => sum + lot.shares * lot.price,
      0
    );
    if (costBasis <= 0 && pos.totalBoughtCost > 0) {
      costBasis = (pos.totalBoughtCost / (pos.totalBoughtShares || 1)) * pos.shares;
    }

    const avgCostBasis = pos.shares > 0 ? costBasis / pos.shares : currentPrice;
    const unrealizedPnL = currentValue - costBasis;
    const unrealizedPnLPercent =
      costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

    const dayChangePercent = quote?.regularMarketChangePercent || 0;
    const dayChange =
      typeof quote?.regularMarketChange === "number" && !isNaN(quote.regularMarketChange)
        ? pos.shares * quote.regularMarketChange
        : (currentValue * dayChangePercent) / 100;

    const info = getTickerSector(symbol);

    totalHoldingsValue += currentValue;
    totalCostBasis += costBasis;

    holdings.push({
      symbol,
      companyName: quote?.shortName || info.name,
      sector: info.sector,
      shares: Number(pos.shares.toFixed(4)),
      avgCostBasis: Number(avgCostBasis.toFixed(2)),
      totalCostBasis: Number(costBasis.toFixed(2)),
      currentPrice: Number(currentPrice.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPercent: Number(unrealizedPnLPercent.toFixed(2)),
      realizedPnL: 0,
      dividendsReceived: Number(pos.dividendsReceived.toFixed(2)),
      dayChange: Number(dayChange.toFixed(2)),
      dayChangePercent: Number(dayChangePercent.toFixed(2)),
      portfolioWeight: 0,
    });
  });

  // Calculate final cash balance / buying power
  let explicitAccountBalance: number | undefined;
  for (let i = sortedTx.length - 1; i >= 0; i--) {
    if (typeof sortedTx[i].accountBalance === "number" && !isNaN(sortedTx[i].accountBalance!)) {
      explicitAccountBalance = sortedTx[i].accountBalance;
      break;
    }
  }

  const normalizedCash =
    explicitAccountBalance !== undefined ? explicitAccountBalance : Math.max(0, cashBalance);

  // Total Portfolio Value is the market value of active stock holdings (Cash is tracked separately)
  const totalValue = totalHoldingsValue;
  const netInvestedCapital = totalCostBasis > 0 ? totalCostBasis : totalHoldingsValue;

  // Assign portfolio weights based on stock holdings value
  holdings.forEach((h) => {
    h.portfolioWeight =
      totalValue > 0 ? Number(((h.currentValue / totalValue) * 100).toFixed(2)) : 0;
  });

  holdings.sort((a, b) => b.currentValue - a.currentValue);

  const unrealizedPnL = totalHoldingsValue - totalCostBasis;
  const unrealizedPnLPercent =
    totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0;

  const totalReturnAmount =
    totalValue + totalDividends + totalRealizedPnL - netInvestedCapital;
  const totalReturnPercent =
    netInvestedCapital > 0 ? (totalReturnAmount / netInvestedCapital) * 100 : 0;

  // 3. Transactions for timeline and cash flows
  const stockBuyTxList = sortedTx.filter(
    (t) => t.date >= firstTransactionDate && (t.type === "BUY" || t.type === "SELL")
  );

  const stockGrowthReturn =
    totalCostBasis > 0
      ? ((totalHoldingsValue + totalRealizedPnL + totalDividends - totalCostBasis) / totalCostBasis) * 100
      : 0;

  // 4. Daily Timeline from first stock buy date with Real Market Fluctuations
  const timeline = await generatePortfolioTimeline(
    sortedTx,
    firstTransactionDate,
    lastTransactionDate,
    holdings,
    totalHoldingsValue,
    totalCostBasis,
    quotes,
    Number(stockGrowthReturn.toFixed(2))
  );

  // Compute days and years active
  const dStart = new Date(firstTransactionDate).getTime();
  const dEnd = new Date(lastTransactionDate).getTime();
  const daysActive = Math.max(1, Math.floor((dEnd - dStart) / (1000 * 86400)));
  const years = Math.max(daysActive / 365.25, 0.05);

  // 5. Daily Cash-Flow-Adjusted TWR using end-of-day valuations and external capital flows
  const dailyValuations = new Map<string, number>();
  for (const pt of timeline) {
    dailyValuations.set(pt.date, pt.portfolioValue);
  }

  const externalDepositsWithdrawals: CashFlowEvent[] = sortedTx
    .filter((t) => t.type === "DEPOSIT" || t.type === "WITHDRAWAL")
    .map((t) => ({
      date: t.date.split("T")[0],
      amount:
        t.type === "DEPOSIT"
          ? Math.abs(t.amount || t.price * (t.shares || 1))
          : -Math.abs(t.amount || t.price * (t.shares || 1)),
      description: t.type,
    }));

  // Only DEPOSIT / WITHDRAWAL events are valid TWR cash-flow boundaries.
  // BUY / SELL are internal reallocations within the portfolio and must NOT split
  // TWR sub-periods — treating them as external flows would suppress or inflate the
  // measured return by breaking periods at arbitrary internal trade dates.
  const effectiveTwrFlows: CashFlowEvent[] = externalDepositsWithdrawals;

  const twrResult = calculateTWR(
    effectiveTwrFlows,
    dailyValuations,
    firstTransactionDate,
    lastTransactionDate
  );

  const twrPercent =
    twrResult.subPeriods.length > 0
      ? Number(twrResult.cumulativeTwrPercent.toFixed(2))
      : Number(stockGrowthReturn.toFixed(2));

  const annualizedTwrPercent =
    twrResult.subPeriods.length > 0
      ? Number(twrResult.annualizedTwrPercent.toFixed(2))
      : Number(((Math.pow(1 + twrPercent / 100, 1 / years) - 1) * 100).toFixed(2));

  // Align timeline cumulativeTWR series with true compounded TWR, strictly matching twrPercent at the end
  alignTimelineTWRSeries(
    timeline,
    twrResult.subPeriods,
    twrPercent,
    effectiveTwrFlows
  );

  // 6. Money-Weighted Return (XIRR)
  const xirrCashFlows = [
    ...stockBuyTxList.map((t) => ({
      date: t.date,
      amount: t.type === "BUY" ? -Math.abs(t.amount || t.shares * t.price) : Math.abs(t.amount || t.shares * t.price),
    })),
    {
      date: new Date().toISOString().split("T")[0],
      amount: totalHoldingsValue,
    },
  ];

  const rawXirr = calculateXIRR(xirrCashFlows);
  const xirrPercent = !isNaN(rawXirr) && isFinite(rawXirr) ? Number(rawXirr.toFixed(2)) : twrPercent;

  // 7. Compute Benchmark Comparisons from first stock purchase date
  const benchmarks = await computeBenchmarkMetrics(
    timeline,
    firstTransactionDate,
    stockBuyTxList.map((t) => ({
      date: t.date,
      amount: t.type === "BUY" ? Math.abs(t.amount || t.shares * t.price) : -Math.abs(t.amount || t.shares * t.price),
      description: t.type,
    }))
  );

  const { volatility, sharpeRatio, maxDrawdown } = computeRiskMetrics(
    timeline,
    annualizedTwrPercent
  );

  return {
    totalValue: Number(totalValue.toFixed(2)),
    netInvestedCapital: Number(netInvestedCapital.toFixed(2)),
    totalDeposits: Number(totalDeposits.toFixed(2)),
    totalWithdrawals: Number(totalWithdrawals.toFixed(2)),
    cashBalance: Number(normalizedCash.toFixed(2)),
    holdingsValue: Number(totalHoldingsValue.toFixed(2)),
    totalReturnAmount: Number(totalReturnAmount.toFixed(2)),
    totalReturnPercent: Number(totalReturnPercent.toFixed(2)),
    simpleReturnPercent: Number(totalReturnPercent.toFixed(2)),
    unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
    unrealizedPnLPercent: Number(unrealizedPnLPercent.toFixed(2)),
    realizedPnL: Number(totalRealizedPnL.toFixed(2)),
    totalDividends: Number(totalDividends.toFixed(2)),
    totalFees: Number(totalFees.toFixed(2)),
    twrPercent,
    annualizedTwrPercent,
    xirrPercent,
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    volatility: Number(volatility.toFixed(2)),
    firstTransactionDate,
    lastTransactionDate,
    daysActive,
    holdings,
    realizedTrades,
    timeline,
    twrSubPeriods:
      twrResult.subPeriods.length > 0
        ? twrResult.subPeriods
        : [
            {
              startDate: firstTransactionDate,
              endDate: lastTransactionDate,
              startValue: totalCostBasis,
              endValue: totalHoldingsValue,
              cashFlow: 0,
              periodReturn: twrPercent / 100,
              cumulativeTWR: twrPercent / 100,
            },
          ],
    benchmarks,
  };
}

/**
 * Detects whether historical market data from Yahoo Finance has been retroactively
 * adjusted for a corporate stock split (or reverse split) that is not reflected in
 * pre-split broker transaction execution prices.
 *
 * Market price fluctuations — including severe single-day drops (-25%, -35%, -40%)
 * or sharp rallies (+25%, +50%) — are legitimate market price movements and MUST NOT
 * be mistaken for corporate splits. Corporate splits occur in discrete integer or simple
 * fractional ratios (e.g. 2:1, 1:2, 3:1, 1:3, 10:1, or penny-stock 1:125 reverse splits).
 */
export function detectSplitScale(avgRatio: number): number {
  if (!avgRatio || isNaN(avgRatio) || avgRatio <= 0) return 1.0;

  // 1. Broad safety zone for ALL market price fluctuations:
  // Intraday drops up to -42% (ratio 0.58) and surges up to +70% (ratio 1.70)
  // are real market price movements, NEVER stock splits.
  if (avgRatio >= 0.58 && avgRatio <= 1.70) {
    return 1.0;
  }

  // 2. Standard forward stock splits (prices retroactively halved, thirded, etc.)
  // 2:1 split -> ~0.50
  if (avgRatio >= 0.44 && avgRatio <= 0.56) return 0.5;
  // 3:1 split -> ~0.333
  if (avgRatio >= 0.29 && avgRatio <= 0.38) return 1 / 3;
  // 4:1 split -> ~0.25
  if (avgRatio >= 0.22 && avgRatio <= 0.28) return 0.25;
  // 5:1 split -> ~0.20
  if (avgRatio >= 0.18 && avgRatio <= 0.22) return 0.20;
  // 10:1 split -> ~0.10
  if (avgRatio >= 0.085 && avgRatio <= 0.115) return 0.10;
  // 20:1 split -> ~0.05
  if (avgRatio >= 0.042 && avgRatio <= 0.058) return 0.05;

  // 3. Standard reverse stock splits (prices retroactively doubled, tripled, etc.)
  // 1:2 reverse split -> ~2.00
  if (avgRatio >= 1.75 && avgRatio <= 2.25) return 2.0;
  // 1:3 reverse split -> ~3.00
  if (avgRatio >= 2.65 && avgRatio <= 3.35) return 3.0;
  // 1:4 reverse split -> ~4.00
  if (avgRatio >= 3.55 && avgRatio <= 4.45) return 4.0;
  // 1:5 reverse split -> ~5.00
  if (avgRatio >= 4.55 && avgRatio <= 5.45) return 5.0;
  // 1:10 reverse split -> ~10.00
  if (avgRatio >= 9.0 && avgRatio <= 11.0) return 10.0;

  // 4. Large reverse splits (penny stocks: 1:15, 1:20, 1:50, 1:100, 1:125, etc.)
  if (avgRatio > 5.5) {
    const roundInt = Math.round(avgRatio);
    if (Math.abs(avgRatio - roundInt) / avgRatio < 0.1) return roundInt;
    return avgRatio;
  }

  // 5. Very large forward splits (e.g. 50:1, 100:1)
  if (avgRatio < 0.04) {
    const inv = 1 / avgRatio;
    const roundInv = Math.round(inv);
    if (Math.abs(inv - roundInv) / inv < 0.1) return 1 / roundInv;
    return avgRatio;
  }

  // Safe default: if not clearly a corporate split, DO NOT SCALE (scale = 1.0)
  return 1.0;
}

async function generatePortfolioTimeline(
  transactions: Transaction[],
  startDateStr: string,
  endDateStr: string,
  holdings: Holding[],
  currentHoldingsValue: number,
  currentCostBasis: number,
  quotes: Record<string, StockQuote>,
  finalTwrPercent?: number
): Promise<DailyPortfolioPoint[]> {
  const points: DailyPortfolioPoint[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const totalDays = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / (1000 * 86400))
  );

  // Fetch benchmark daily histories
  const [sp500History, nasdaqHistory, niftyHistory, dowHistory, msciHistory] =
    await Promise.all([
      getStockDailyHistory("^GSPC", startDateStr),
      getStockDailyHistory("^NDX", startDateStr),
      getStockDailyHistory("^NSEI", startDateStr),
      getStockDailyHistory("^DJI", startDateStr),
      getStockDailyHistory("URTH", startDateStr),
    ]);

  // Fetch daily history for all traded symbols with concurrency limiting (chunk size 4)
  const allSymbols = Array.from(
    new Set([
      ...holdings.map((h) => h.symbol),
      ...transactions
        .map((t) => t.symbol?.trim().toUpperCase())
        .filter((s) => s && s !== "CASH" && s !== "USD"),
    ])
  );
  const stockHistories: Record<string, Map<string, number>> = {};
  const CHUNK_SIZE = 4;

  for (let i = 0; i < allSymbols.length; i += CHUNK_SIZE) {
    const chunk = allSymbols.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (sym) => {
        // useAdjustedPrices=false: dividends for held stocks are tracked as explicit DIVIDEND
        // transactions and added to cashBalance. Using adjusted prices here would count
        // dividend income twice — once via the adjusted price series and once via cash.
        const hist = await getStockDailyHistory(sym, startDateStr, false);

        // Detect if Yahoo Finance retroactively split-adjusted historical prices (e.g. 1:2, 2:1, 1:125)
        // while broker transaction records retain pre-split shares and execution prices.
        const symTrades = transactions.filter(
          (t) =>
            t.symbol?.trim().toUpperCase() === sym &&
            (t.type === "BUY" || t.type === "SELL") &&
            t.price > 0
        );

        let splitScale = 1.0;
        if (symTrades.length > 0 && hist.length > 0) {
          const histMapTemp = new Map(hist.map((p) => [p.date, p.close]));
          const ratios: number[] = [];
          for (const st of symTrades) {
            const d = st.date.split("T")[0];
            const closeOnDate = histMapTemp.get(d);
            if (closeOnDate && closeOnDate > 0 && st.price > 0) {
              ratios.push(closeOnDate / st.price);
            }
          }
          if (ratios.length > 0) {
            const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
            splitScale = detectSplitScale(avgRatio);
          }
        }

        stockHistories[sym] = new Map(
          hist.map((p) => [p.date, splitScale !== 1.0 ? Number((p.close / splitScale).toFixed(4)) : p.close])
        );
      })
    );
  }

  const spMap = new Map(sp500History.map((p) => [p.date, p.close]));
  const ndxMap = new Map(nasdaqHistory.map((p) => [p.date, p.close]));
  const niftyMap = new Map(niftyHistory.map((p) => [p.date, p.close]));
  const dowMap = new Map(dowHistory.map((p) => [p.date, p.close]));
  const msciMap = new Map(msciHistory.map((p) => [p.date, p.close]));

  const spStart = sp500History[0]?.close || 4500;
  const ndxStart = nasdaqHistory[0]?.close || 15000;
  const niftyStart = niftyHistory[0]?.close || 21000;
  const dowStart = dowHistory[0]?.close || 38000;
  const msciStart = msciHistory[0]?.close || 140;

  let lastKnownSp = spStart;
  let lastKnownNdx = ndxStart;
  let lastKnownNifty = niftyStart;
  let lastKnownDow = dowStart;
  let lastKnownMsci = msciStart;

  // Track last known prices for each stock.
  // Seed with earliest historical price or earliest transaction purchase price rather than
  // today's live quotes to prevent artificial day-1 price collapses when timeline starts.
  const lastKnownStockPrice: Record<string, number> = {};
  allSymbols.forEach((sym) => {
    let initialPrice = 0;
    const hist = stockHistories[sym];
    if (hist && hist.size > 0) {
      if (hist.has(startDateStr)) {
        initialPrice = hist.get(startDateStr)!;
      } else {
        const sortedHistDates = Array.from(hist.keys()).sort();
        if (sortedHistDates.length > 0) {
          initialPrice = hist.get(sortedHistDates[0])!;
        }
      }
    }
    if (initialPrice <= 0) {
      const firstTx = transactions.find(
        (t) =>
          t.symbol?.trim().toUpperCase() === sym &&
          (t.type === "BUY" || (t.price && t.price > 0))
      );
      if (firstTx && firstTx.price > 0) {
        initialPrice = firstTx.price;
      }
    }
    if (initialPrice <= 0) {
      const holdingPrice = holdings.find((h) => h.symbol === sym)?.currentPrice;
      const quotePrice = quotes[sym]?.regularMarketPrice;
      initialPrice =
        holdingPrice && holdingPrice > 0
          ? holdingPrice
          : quotePrice && quotePrice > 0
          ? quotePrice
          : 0;
    }
    lastKnownStockPrice[sym] = initialPrice;
  });

  const step = totalDays > 365 ? 3 : totalDays > 90 ? 2 : 1;
  const initialStockCost = Math.max(1, currentCostBasis);

  // Build evaluation dates: regular stepped dates plus every transaction date (so no cash flow date is missed)
  const evalDateSet = new Set<string>();
  evalDateSet.add(startDateStr);
  evalDateSet.add(endDateStr);
  transactions.forEach((tx) => {
    const dStr = tx.date.split("T")[0];
    if (dStr >= startDateStr && dStr <= endDateStr) {
      evalDateSet.add(dStr);
    }
  });
  for (let i = 0; i <= totalDays; i += step) {
    const d = new Date(start.getTime() + i * 86400 * 1000);
    evalDateSet.add(d.toISOString().split("T")[0]);
  }
  const evalDates = Array.from(evalDateSet).sort((a, b) => a.localeCompare(b));

  // Track cumulative transactions up to date
  let txIdx = 0;
  const runningShares: Record<string, number> = {};
  let runningCost = 0;
  let runningCash = 0;
  let cumulativeDeposits = 0;
  const hasDeposits = transactions.some((t) => t.type === "DEPOSIT" && !t.id.startsWith("tx-init"));

  for (const dateStr of evalDates) {
    // Process transactions up to this date
    while (txIdx < transactions.length && transactions[txIdx].date.split("T")[0] <= dateStr) {
      const tx = transactions[txIdx];
      const sym = tx.symbol.trim().toUpperCase();
      const fee = tx.fee || 0;

      if (tx.type === "DEPOSIT") {
        const dep = Math.abs(tx.amount || tx.price * (tx.shares || 1));
        runningCash += dep - fee;
        cumulativeDeposits += dep;
      } else if (tx.type === "WITHDRAWAL") {
        const wth = Math.abs(tx.amount || tx.price * (tx.shares || 1));
        runningCash -= wth + fee;
        cumulativeDeposits -= wth;
      } else if (tx.type === "BUY" && sym !== "CASH" && sym !== "USD") {
        const cost = Math.abs(tx.amount || tx.shares * tx.price);
        runningCash -= cost + fee;
        runningShares[sym] = (runningShares[sym] || 0) + Math.abs(tx.shares);
        runningCost += cost;
      } else if (tx.type === "SELL" && sym !== "CASH" && sym !== "USD") {
        const proceeds = Math.abs(tx.amount || tx.shares * tx.price);
        runningCash += proceeds - fee;
        runningShares[sym] = Math.max(0, (runningShares[sym] || 0) - Math.abs(tx.shares));
        runningCost = Math.max(0, runningCost - Math.abs(tx.amount || tx.shares * tx.price));
      } else if (tx.type === "DIVIDEND") {
        const div = Math.abs(tx.amount);
        runningCash += div - fee;
      } else if (tx.type === "TAX" || tx.type === "FEE") {
        runningCash -= Math.abs(tx.amount || fee);
      } else if (tx.type === "STOCK_SPLIT" && sym !== "CASH" && sym !== "USD") {
        // Adjust the running share count for the split. No cash impact.
        const multiplier = Math.abs(tx.shares) || 1;
        runningShares[sym] = (runningShares[sym] || 0) * multiplier;
        // runningCost is intentionally unchanged — total cost basis is unaffected by splits
      }
      txIdx++;
    }

    if (spMap.has(dateStr)) lastKnownSp = spMap.get(dateStr)!;
    if (ndxMap.has(dateStr)) lastKnownNdx = ndxMap.get(dateStr)!;
    if (niftyMap.has(dateStr)) lastKnownNifty = niftyMap.get(dateStr)!;
    if (dowMap.has(dateStr)) lastKnownDow = dowMap.get(dateStr)!;
    if (msciMap.has(dateStr)) lastKnownMsci = msciMap.get(dateStr)!;

    // Update last known prices for each stock from actual historical daily closes
    allSymbols.forEach((sym) => {
      if (stockHistories[sym]?.has(dateStr)) {
        lastKnownStockPrice[sym] = stockHistories[sym].get(dateStr)!;
      }
    });

    // Compute total market value of held stocks on this day using real historical prices.
    // If no price is known for a symbol yet (price = 0), it contributes 0 to the total
    // rather than a fabricated $100 — the next available historical price will be used.
    let dayHoldingsVal = 0;
    Object.entries(runningShares).forEach(([sym, shares]) => {
      if (shares > 0) {
        const p = lastKnownStockPrice[sym] || quotes[sym]?.regularMarketPrice || 0;
        dayHoldingsVal += shares * p;
      }
    });

    const validCash = Math.max(0, runningCash);
    const totalAccountVal = dayHoldingsVal + (hasDeposits ? validCash : 0);
    const portVal = totalAccountVal > 0 ? totalAccountVal : dayHoldingsVal > 0 ? dayHoldingsVal : initialStockCost;
    const baseCost = hasDeposits && cumulativeDeposits > 0 ? cumulativeDeposits : runningCost > 0 ? runningCost : initialStockCost;

    const spPercent =
      spStart > 0 ? ((lastKnownSp - spStart) / spStart) * 100 : 0;
    const ndxPercent =
      ndxStart > 0 ? ((lastKnownNdx - ndxStart) / ndxStart) * 100 : 0;
    const niftyPercent =
      niftyStart > 0 ? ((lastKnownNifty - niftyStart) / niftyStart) * 100 : 0;
    const dowPercent =
      dowStart > 0 ? ((lastKnownDow - dowStart) / dowStart) * 100 : 0;
    const msciPercent =
      msciStart > 0 ? ((lastKnownMsci - msciStart) / msciStart) * 100 : 0;

    const portTwr =
      baseCost > 0 ? ((portVal - baseCost) / baseCost) * 100 : 0;

    points.push({
      date: dateStr,
      portfolioValue: Number(portVal.toFixed(2)),
      netInvestedCapital: Number(baseCost.toFixed(2)),
      cashBalance: Number(validCash.toFixed(2)),
      holdingsValue: Number(dayHoldingsVal.toFixed(2)),
      unrealizedPnL: Number((portVal - baseCost).toFixed(2)),
      cumulativeTWR: Number(portTwr.toFixed(2)),
      simpleReturn: Number(portTwr.toFixed(2)),
      sp500TWR: Number(spPercent.toFixed(2)),
      nasdaqTWR: Number(ndxPercent.toFixed(2)),
      nifty50TWR: Number(niftyPercent.toFixed(2)),
      dowTWR: Number(dowPercent.toFixed(2)),
      msciWorldTWR: Number(msciPercent.toFixed(2)),
    });
  }

  if (points.length > 0) {
    const last = points[points.length - 1];
    const finalReturn =
      typeof finalTwrPercent === "number"
        ? finalTwrPercent
        : currentCostBasis > 0
        ? ((currentHoldingsValue - currentCostBasis) / currentCostBasis) * 100
        : 0;

    const spPercent =
      spStart > 0 ? ((lastKnownSp - spStart) / spStart) * 100 : 0;
    const ndxPercent =
      ndxStart > 0 ? ((lastKnownNdx - ndxStart) / ndxStart) * 100 : 0;
    const niftyPercent =
      niftyStart > 0 ? ((lastKnownNifty - niftyStart) / niftyStart) * 100 : 0;
    const dowPercent =
      dowStart > 0 ? ((lastKnownDow - dowStart) / dowStart) * 100 : 0;
    const msciPercent =
      msciStart > 0 ? ((lastKnownMsci - msciStart) / msciStart) * 100 : 0;

    const finalCash = Math.max(0, runningCash);
    const finalTotalVal = currentHoldingsValue + (hasDeposits ? finalCash : 0);
    const finalNetInvested = hasDeposits && cumulativeDeposits > 0 ? cumulativeDeposits : currentCostBasis;
    const finalSimpleReturn =
      finalNetInvested > 0
        ? ((finalTotalVal - finalNetInvested) / finalNetInvested) * 100
        : 0;

    if (last.date < endDateStr) {
      points.push({
        date: endDateStr,
        portfolioValue: Number(finalTotalVal.toFixed(2)),
        netInvestedCapital: Number(finalNetInvested.toFixed(2)),
        cashBalance: Number(finalCash.toFixed(2)),
        holdingsValue: Number(currentHoldingsValue.toFixed(2)),
        unrealizedPnL: Number((finalTotalVal - finalNetInvested).toFixed(2)),
        cumulativeTWR: Number(finalReturn.toFixed(2)),
        simpleReturn: Number(finalSimpleReturn.toFixed(2)),
        sp500TWR: Number(spPercent.toFixed(2)),
        nasdaqTWR: Number(ndxPercent.toFixed(2)),
        nifty50TWR: Number(niftyPercent.toFixed(2)),
        dowTWR: Number(dowPercent.toFixed(2)),
        msciWorldTWR: Number(msciPercent.toFixed(2)),
      });
    } else {
      last.portfolioValue = Number(finalTotalVal.toFixed(2));
      last.netInvestedCapital = Number(finalNetInvested.toFixed(2));
      last.cashBalance = Number(finalCash.toFixed(2));
      last.holdingsValue = Number(currentHoldingsValue.toFixed(2));
      last.unrealizedPnL = Number((finalTotalVal - finalNetInvested).toFixed(2));
      last.cumulativeTWR = Number(finalReturn.toFixed(2));
      last.simpleReturn = Number(finalSimpleReturn.toFixed(2));
    }
  }

  return points;
}

function computeRiskMetrics(
  timeline: DailyPortfolioPoint[],
  annualizedReturn: number
): { volatility: number; sharpeRatio: number; maxDrawdown: number } {
  if (timeline.length < 5) {
    return { volatility: 15.0, sharpeRatio: 1.2, maxDrawdown: 12.0 };
  }

  const dailyReturns: number[] = [];
  let peak = timeline[0]?.portfolioValue || 1;
  let maxDrawdown = 0;

  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1].portfolioValue;
    const curr = timeline[i].portfolioValue;
    if (prev > 0) {
      dailyReturns.push((curr - prev) / prev);
    }

    if (curr > peak) {
      peak = curr;
    }
    const drawdown = peak > 0 ? ((peak - curr) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const avg =
    dailyReturns.reduce((sum, r) => sum + r, 0) / (dailyReturns.length || 1);
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) /
    (dailyReturns.length || 1);
  const dailyStdDev = Math.sqrt(variance);
  const annualizedVolatility = dailyStdDev * Math.sqrt(252) * 100;

  const riskFreeRate = 4.5;
  const excessReturn = annualizedReturn - riskFreeRate;
  const sharpeRatio =
    annualizedVolatility > 0 ? excessReturn / annualizedVolatility : 0;

  return {
    volatility: Math.max(1, annualizedVolatility),
    sharpeRatio: isNaN(sharpeRatio) ? 1.0 : sharpeRatio,
    maxDrawdown: Math.max(0, maxDrawdown),
  };
}

function createEmptyPortfolioSummary(): PortfolioSummary {
  return {
    totalValue: 0,
    netInvestedCapital: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    cashBalance: 0,
    holdingsValue: 0,
    totalReturnAmount: 0,
    totalReturnPercent: 0,
    simpleReturnPercent: 0,
    unrealizedPnL: 0,
    unrealizedPnLPercent: 0,
    realizedPnL: 0,
    totalDividends: 0,
    totalFees: 0,
    twrPercent: 0,
    annualizedTwrPercent: 0,
    xirrPercent: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    volatility: 0,
    firstTransactionDate: new Date().toISOString().split("T")[0],
    lastTransactionDate: new Date().toISOString().split("T")[0],
    daysActive: 0,
    holdings: [],
    realizedTrades: [],
    timeline: [],
    twrSubPeriods: [],
    benchmarks: {},
  };
}
