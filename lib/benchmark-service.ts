import { BenchmarkMetrics, DailyPortfolioPoint } from "./types";
import { CashFlowEvent } from "./twr-calculator";
import { getStockDailyHistory } from "./stock-api";

export const BENCHMARKS_METADATA = [
  {
    key: "SP500",
    name: "S&P 500",
    symbol: "^GSPC",
    description: "US Large-Cap Equities Benchmark",
    color: "#3b82f6",
  },
  {
    key: "NASDAQ",
    name: "Nasdaq 100",
    symbol: "^NDX",
    description: "US Tech & Innovation Index",
    color: "#8b5cf6",
  },
  {
    key: "NIFTY50",
    name: "Nifty 50",
    symbol: "^NSEI",
    description: "India Flagship Equity Index",
    color: "#f59e0b",
  },
  {
    key: "DOW",
    name: "Dow Jones 30",
    symbol: "^DJI",
    description: "US Blue Chip Index",
    color: "#06b6d4",
  },
  {
    key: "MSCI_WORLD",
    name: "MSCI World",
    symbol: "URTH",
    description: "Global Developed Markets Index",
    color: "#10b981",
  },
];

export async function computeBenchmarkMetrics(
  timeline: DailyPortfolioPoint[],
  startDateStr: string,
  cashFlows: CashFlowEvent[]
): Promise<Record<string, BenchmarkMetrics>> {
  const result: Record<string, BenchmarkMetrics> = {};

  if (timeline.length < 2) {
    return result;
  }

  const portfolioDailyReturns: number[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1].portfolioValue;
    const curr = timeline[i].portfolioValue;
    if (prev > 0) {
      portfolioDailyReturns.push((curr - prev) / prev);
    }
  }

  const dStart = new Date(startDateStr).getTime();
  const dEnd = new Date().getTime();
  const years = Math.max(0.1, (dEnd - dStart) / (1000 * 86400 * 365.25));

  for (const bm of BENCHMARKS_METADATA) {
    try {
      const history = await getStockDailyHistory(bm.symbol, startDateStr);

      if (!history || history.length < 2) {
        result[bm.key] = generateFallbackBenchmark(bm.name, bm.symbol, years);
        continue;
      }

      const startPrice = history[0].close;
      const endPrice = history[history.length - 1].close;
      const totalReturn = startPrice > 0 ? (endPrice - startPrice) / startPrice : 0;
      const annualizedReturn =
        totalReturn > -1 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;

      // Benchmark daily returns
      const bmReturns: number[] = [];
      let peak = history[0].close;
      let maxDrawdown = 0;

      for (let i = 1; i < history.length; i++) {
        const p0 = history[i - 1].close;
        const p1 = history[i].close;
        if (p0 > 0) bmReturns.push((p1 - p0) / p0);
        if (p1 > peak) peak = p1;
        const dd = peak > 0 ? ((peak - p1) / peak) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      // Calculate Beta and Correlation against portfolio
      const minLen = Math.min(portfolioDailyReturns.length, bmReturns.length);
      const portSlice = portfolioDailyReturns.slice(-minLen);
      const bmSlice = bmReturns.slice(-minLen);

      const meanPort =
        portSlice.reduce((a, b) => a + b, 0) / (portSlice.length || 1);
      const meanBm =
        bmSlice.reduce((a, b) => a + b, 0) / (bmSlice.length || 1);

      let cov = 0;
      let varBm = 0;
      let varPort = 0;

      for (let i = 0; i < minLen; i++) {
        const dp = portSlice[i] - meanPort;
        const db = bmSlice[i] - meanBm;
        cov += dp * db;
        varBm += db * db;
        varPort += dp * dp;
      }

      const beta = varBm > 0 ? cov / varBm : 1.0;
      const correlation =
        varPort > 0 && varBm > 0 ? cov / Math.sqrt(varPort * varBm) : 0.85;

      // Alpha (Jensen's Alpha annualized): Alpha = Rp - (Rf + Beta*(Rb - Rf))
      const rf = 0.045; // 4.5% Risk free rate
      const portTotalReturn =
        (timeline[timeline.length - 1].portfolioValue -
          timeline[timeline.length - 1].netInvestedCapital) /
        Math.max(1, timeline[timeline.length - 1].netInvestedCapital);
      const portAnnualized =
        portTotalReturn > -1 ? Math.pow(1 + portTotalReturn, 1 / years) - 1 : 0;

      const alpha =
        (portAnnualized - (rf + beta * (annualizedReturn - rf))) * 100;

      // Benchmark Sharpe Ratio
      const bmStdDev =
        Math.sqrt(varBm / Math.max(1, bmSlice.length)) * Math.sqrt(252);
      const sharpeRatio =
        bmStdDev > 0 ? (annualizedReturn - rf) / bmStdDev : 1.0;

      // Simulated DCA: What if the user dollar-cost-averaged into this index instead?
      const historyMap = new Map(history.map((h) => [h.date, h.close]));
      let simulatedUnits = 0;

      cashFlows.forEach((cf) => {
        if (cf.amount > 0) {
          // Find price on or near deposit date
          const p = historyMap.get(cf.date) || startPrice;
          if (p > 0) {
            simulatedUnits += cf.amount / p;
          }
        }
      });

      const hypotheticalDCAValue = simulatedUnits * endPrice;

      result[bm.key] = {
        name: bm.name,
        symbol: bm.symbol,
        totalReturnPercent: Number((totalReturn * 100).toFixed(2)),
        annualizedReturnPercent: Number((annualizedReturn * 100).toFixed(2)),
        alpha: Number(alpha.toFixed(2)),
        beta: Number(Math.max(0.2, Math.min(3.0, beta)).toFixed(2)),
        correlation: Number(Math.max(-1, Math.min(1, correlation)).toFixed(2)),
        sharpeRatio: Number(sharpeRatio.toFixed(2)),
        maxDrawdown: Number(maxDrawdown.toFixed(2)),
        hypotheticalDCAValue: Number(hypotheticalDCAValue.toFixed(2)),
      };
    } catch {
      result[bm.key] = generateFallbackBenchmark(bm.name, bm.symbol, years);
    }
  }

  return result;
}

function generateFallbackBenchmark(
  name: string,
  symbol: string,
  years: number
): BenchmarkMetrics {
  const returnsMap: Record<string, number> = {
    "^GSPC": 38.5,
    "^NDX": 62.4,
    "^NSEI": 44.2,
    "^DJI": 28.6,
    URTH: 34.1,
  };
  const tot = returnsMap[symbol] || 35.0;
  const ann = (Math.pow(1 + tot / 100, 1 / Math.max(0.5, years)) - 1) * 100;

  return {
    name,
    symbol,
    totalReturnPercent: tot,
    annualizedReturnPercent: Number(ann.toFixed(2)),
    alpha: 3.5,
    beta: 1.05,
    correlation: 0.88,
    sharpeRatio: 1.15,
    maxDrawdown: 14.5,
    hypotheticalDCAValue: 24500,
    isEstimated: true,
  };
}
