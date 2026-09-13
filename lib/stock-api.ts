import { StockQuote } from "./types";
import { getCachedData, setCachedData } from "./redis";
import { getTickerSector } from "./utils";

const QUOTE_CACHE_TTL = 30; // 30 seconds cache for live quotes
const HISTORY_CACHE_TTL = 12 * 3600; // 12 hours cache for historical close data

const FINNHUB_TOKEN = (process.env.FINNHUB_API_KEY || "").trim();

export const BENCHMARK_SYMBOLS = {
  SP500: { symbol: "^GSPC", altSymbol: "SPY", name: "S&P 500 (US Large Cap)" },
  NASDAQ: { symbol: "^NDX", altSymbol: "QQQ", name: "Nasdaq 100 (Tech & Growth)" },
  DOW: { symbol: "^DJI", altSymbol: "DIA", name: "Dow Jones Industrial Average" },
  NIFTY50: { symbol: "^NSEI", altSymbol: "INDY", name: "Nifty 50 (India Market)" },
  MSCI_WORLD: { symbol: "URTH", altSymbol: "VT", name: "MSCI World / Global Equities" },
};

/**
 * Fetch real-time quote for a single symbol.
 * Queries live Finnhub API (if FINNHUB_API_KEY is configured) or Yahoo Finance.
 */
export async function getStockQuote(symbol: string): Promise<StockQuote> {
  const cleanSymbol = symbol.trim().toUpperCase();
  if (cleanSymbol === "CASH" || cleanSymbol === "USD") {
    return {
      symbol: "CASH",
      shortName: "USD Cash",
      regularMarketPrice: 1.0,
      regularMarketChange: 0,
      regularMarketChangePercent: 0,
      currency: "USD",
      lastUpdated: new Date().toISOString(),
    };
  }

  const cacheKey = `quote:${cleanSymbol}`;

  // Check cache first
  const cached = await getCachedData<StockQuote>(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. For US Equities -> Fetch live from Finnhub API if token is configured
  if (!cleanSymbol.startsWith("^") && FINNHUB_TOKEN) {
    try {
      const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
        cleanSymbol
      )}&token=${encodeURIComponent(FINNHUB_TOKEN)}`;

      const res = await fetch(finnhubUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        // data.c = current price, data.d = change, data.dp = % change, data.h = high, data.l = low, data.pc = prev close
        if (typeof data.c === "number" && data.c > 0) {
          const regularMarketPrice = Number(data.c.toFixed(2));
          const regularMarketChange = Number((data.d || 0).toFixed(2));
          const regularMarketChangePercent = Number((data.dp || 0).toFixed(2));
          const info = getTickerSector(cleanSymbol);

          const quote: StockQuote = {
            symbol: cleanSymbol,
            shortName: info.name,
            regularMarketPrice,
            regularMarketChange,
            regularMarketChangePercent,
            regularMarketDayHigh: data.h ? Number(data.h.toFixed(2)) : regularMarketPrice,
            regularMarketDayLow: data.l ? Number(data.l.toFixed(2)) : regularMarketPrice,
            currency: "USD",
            lastUpdated: new Date().toISOString(),
          };

          await setCachedData(cacheKey, quote, QUOTE_CACHE_TTL);
          return quote;
        }
      }
    } catch (err) {
      console.error(`[Finnhub Error for ${cleanSymbol}]:`, err);
    }
  }

  // 2. Query Yahoo Finance live chart API (for indices like ^GSPC, ^NDX, ^NSEI or fallback)
  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      cleanSymbol
    )}?interval=1d&range=1d`;

    const res = await fetch(yfUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === "number" && meta.regularMarketPrice > 0) {
        const regularMarketPrice = meta.regularMarketPrice;
        const prevClose =
          meta.chartPreviousClose || meta.previousClose || regularMarketPrice;
        const change =
          typeof meta.fulldayChange === "number"
            ? meta.fulldayChange
            : regularMarketPrice - prevClose;
        const changePercent =
          typeof meta.regularMarketChangePercent === "number"
            ? meta.regularMarketChangePercent
            : typeof meta.fulldayChangePercent === "number"
            ? meta.fulldayChangePercent
            : prevClose > 0
            ? (change / prevClose) * 100
            : 0;

        const info = getTickerSector(cleanSymbol);

        const quote: StockQuote = {
          symbol: cleanSymbol,
          shortName: meta.shortName || meta.symbol || info.name,
          regularMarketPrice: Number(regularMarketPrice.toFixed(2)),
          regularMarketChange: Number(change.toFixed(2)),
          regularMarketChangePercent: Number(changePercent.toFixed(2)),
          regularMarketDayHigh: meta.regularMarketDayHigh
            ? Number(meta.regularMarketDayHigh.toFixed(2))
            : regularMarketPrice,
          regularMarketDayLow: meta.regularMarketDayLow
            ? Number(meta.regularMarketDayLow.toFixed(2))
            : regularMarketPrice,
          currency: meta.currency || "USD",
          lastUpdated: new Date().toISOString(),
        };

        await setCachedData(cacheKey, quote, QUOTE_CACHE_TTL);
        return quote;
      }
    }
  } catch (err) {
    console.error(`[Yahoo Finance Error for ${cleanSymbol}]:`, err);
  }

  // All price sources failed. Return 0 so callers can detect the failure and use
  // their own fallback (e.g., per-lot cost basis). Never fabricate a $100 price.
  const info = getTickerSector(cleanSymbol);
  console.warn(`[StockAPI] No price available for ${cleanSymbol} — returning 0`);
  return {
    symbol: cleanSymbol,
    shortName: info.name,
    regularMarketPrice: 0,
    regularMarketChange: 0,
    regularMarketChangePercent: 0,
    currency: "USD",
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Fetch real-time quotes for multiple symbols in parallel
 */
export async function getMultipleStockQuotes(
  symbols: string[]
): Promise<Record<string, StockQuote>> {
  const uniqueSymbols = Array.from(
    new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  );

  const results: Record<string, StockQuote> = {};
  const chunkSize = 4;
  for (let i = 0; i < uniqueSymbols.length; i += chunkSize) {
    const chunk = uniqueSymbols.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (symbol) => {
        if (symbol === "CASH" || symbol === "USD") return;
        results[symbol] = await getStockQuote(symbol);
      })
    );
  }

  return results;
}

export interface HistoricalPricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

/**
 * Fetch daily historical close prices for a symbol from Yahoo Finance.
 *
 * @param useAdjustedPrices - When true (default), returns dividend-adjusted close
 *   prices, which bakes dividend income into the price series (total-return basis).
 *   Use true for benchmark indices (^GSPC, ^NDX, etc.) where you want total return.
 *   Use false for portfolio holdings where dividends are tracked as separate DIVIDEND
 *   transactions — using adjusted prices there would double-count dividend income.
 */
export async function getStockDailyHistory(
  symbol: string,
  startDateStr: string,
  useAdjustedPrices: boolean = true
): Promise<HistoricalPricePoint[]> {
  const cleanSymbol = symbol.trim().toUpperCase();
  // Scope the cache key by adjustment mode so the two variants are stored separately
  const cacheKey = `history:${cleanSymbol}:${startDateStr}:${useAdjustedPrices ? "adj" : "raw"}`;

  const cached = await getCachedData<HistoricalPricePoint[]>(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const period1 =
      Math.floor(new Date(startDateStr).getTime() / 1000) - 86400 * 7;
    const period2 = Math.floor(Date.now() / 1000) + 86400;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      cleanSymbol
    )}?period1=${period1}&period2=${period2}&interval=1d`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
      },
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const closes = result?.indicators?.quote?.[0]?.close || [];
      const adjCloses =
        result?.indicators?.adjclose?.[0]?.adjclose || closes;

      const points: HistoricalPricePoint[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const d = new Date(timestamps[i] * 1000).toISOString().split("T")[0];
        // For portfolio holdings (useAdjustedPrices=false) always use the raw close
        // so dividend income is not baked into the price. For benchmarks, use adjclose
        // to capture total return (price appreciation + reinvested dividends).
        const close = useAdjustedPrices
          ? (adjCloses[i] ?? closes[i])
          : closes[i];
        if (close !== null && typeof close === "number" && !isNaN(close) && close > 0) {
          points.push({ date: d, close: Number(close.toFixed(2)) });
        }
      }

      if (points.length > 0) {
        points.sort((a, b) => a.date.localeCompare(b.date));
        await setCachedData(cacheKey, points, HISTORY_CACHE_TTL);
        return points;
      }
    }
  } catch (err) {
    console.error(`[Stock History Error for ${cleanSymbol}]:`, err);
  }

  return [];
}

