# Finvyo — Calculation Methodology

This document defines the exact methods Finvyo uses to calculate portfolio performance,
risk metrics, and returns. It is intended for users who want to verify or reproduce
results, and for contributors who want to understand the engine before modifying it.

---

## Table of Contents

1. [Return Engine Overview](#1-return-engine-overview)
2. [Time-Weighted Return (TWR)](#2-time-weighted-return-twr)
3. [Annualized TWR (CAGR)](#3-annualized-twr-cagr)
4. [Money-Weighted Return (XIRR)](#4-money-weighted-return-xirr)
5. [Portfolio Valuation](#5-portfolio-valuation)
6. [Cost Basis — FIFO](#6-cost-basis--fifo)
7. [Dividend Handling](#7-dividend-handling)
8. [Price Sourcing — Raw vs Adjusted](#8-price-sourcing--raw-vs-adjusted)
9. [Stock Splits](#9-stock-splits)
10. [Fees and Taxes](#10-fees-and-taxes)
11. [Risk Metrics](#11-risk-metrics)
12. [Benchmark Comparison](#12-benchmark-comparison)
13. [Known Limitations and Approximations](#13-known-limitations-and-approximations)

---

## 1. Return Engine Overview

Finvyo computes **two independent return metrics** for every portfolio:

| Metric | What it measures | Sensitive to timing? |
|---|---|---|
| **TWR** | Investment manager skill — how well capital was deployed | No |
| **XIRR** | Investor outcome — how much capital grew, including when you added it | Yes |

They answer different questions. A skilled investor can have low XIRR if they deposited
large amounts right before a market drop. TWR filters that out. XIRR captures it.

---

## 2. Time-Weighted Return (TWR)

### What it is

Finvyo computes **Daily Cash-Flow-Adjusted TWR** — a standard method used by consumer
portfolio trackers (Sharesight, INDmoney, Personal Capital). It eliminates the distortion
caused by the timing and size of external deposits and withdrawals.

> **Important**: This is NOT a GIPS-certified composite calculation. GIPS is an
> institutional compliance framework requiring composite construction, third-party
> verification, documented valuation policies, record retention, and more. Finvyo
> satisfies none of those requirements — it computes the *same underlying formula*
> on a single portfolio, which is what consumer apps do.

### Which transactions count as cash flows

Only **external capital events** create TWR sub-period boundaries:

| Transaction type | Counts as cash flow? |
|---|---|
| `DEPOSIT` | ✅ Yes |
| `WITHDRAWAL` | ✅ Yes |
| `BUY` | ❌ No — internal reallocation |
| `SELL` | ❌ No — internal reallocation |
| `DIVIDEND` | ❌ No — tracked as income separately |
| `FEE` / `TAX` | ❌ No — internal expense |
| `STOCK_SPLIT` | ❌ No — corporate action, no cash |

BUY and SELL must never be treated as external flows. If they were, breaking a
sub-period at every trade date would suppress or inflate TWR depending on whether
prices moved up or down on trade days.

### Formula

For each sub-period *i* between two consecutive external cash-flow dates:

```
V_end_pre  = V_end_post − C_end
R_i        = (V_end_pre − V_start) / V_start
```

Where:
- `V_end_post` — end-of-day portfolio valuation on the end date (after cash flow is settled)
- `C_end` — net external cash flow on the end date (positive = deposit, negative = withdrawal)
- `V_end_pre` — estimated portfolio value just before the cash flow arrived
- `V_start` — portfolio value at the start of this sub-period (= end of previous sub-period, post-flow)

### Geometric linking

Sub-period returns are geometrically linked (compounded):

```
TWR = ∏(1 + R_i) − 1
```

### Total-loss handling

If any sub-period return equals −100% (compound factor = 0), compounding terminates.
Further sub-periods after a total portfolio loss are undefined (division by zero start
value) and are not computed.

### Portfolio liquidation handling

If the post-flow portfolio value falls below **₹1 / $1**, the sub-period loop
terminates. The near-zero value is not carried forward as a denominator for the
next period.

### Minimum starting value

If the inception date has no valuation greater than ₹1 / $1 in either the timeline
or the initial deposit, TWR returns 0 rather than dividing by a phantom value.

### Implementation

- **File**: [`lib/twr-calculator.ts`](lib/twr-calculator.ts) — `calculateTWR()`
- **Sub-period inputs**: built in [`lib/portfolio-engine.ts`](lib/portfolio-engine.ts) — `computePortfolioSummary()`

---

## 3. Annualized TWR (CAGR)

Annualized TWR is only computed when the portfolio has **at least 30 days** of history.
Annualizing shorter periods produces astronomically large numbers that are technically
valid but practically meaningless (e.g., annualizing a 10% gain over 2 days gives
~48,000%).

```
Annualized TWR = (1 + TWR)^(365.25 / days) − 1
```

If the portfolio is younger than 30 days, the UI shows the raw cumulative TWR instead.

---

## 4. Money-Weighted Return (XIRR)

XIRR (Extended Internal Rate of Return) solves for the discount rate `r` that makes
the net present value of all cash flows equal to zero:

```
Σ [ CF_i / (1 + r)^t_i ] = 0
```

Where:
- `CF_i` — cash flow amount (negative = money out of pocket to buy, positive = proceeds or current value)
- `t_i` — time in years from the first flow date

The terminal cash flow is the **current market value of all open holdings** as of today.

XIRR captures investor timing. If you deposited a large amount one week before a crash,
your XIRR will be much lower than your TWR for the same period.

**Implementation**: [`lib/xirr-calculator.ts`](lib/xirr-calculator.ts)

---

## 5. Portfolio Valuation

### Daily timeline

For each date in the evaluation range, portfolio value is:

```
V_date = Σ (shares_sym × P_sym_date)  +  cash_date
```

Where `P_sym_date` is the **last known historical raw close price** for the symbol
on or before that date (see [§8 Price Sourcing](#8-price-sourcing--raw-vs-adjusted)).

Cash is the running balance of all deposits, withdrawals, buy costs, sell proceeds,
dividends received, and fees paid up to that date.

### Missing price handling

If no historical price is available for a symbol on a given date, the symbol contributes
**0** to the portfolio value for that date rather than a fabricated placeholder.
The next available historical price will be used on subsequent dates. A `console.warn`
is emitted when the live quote API also returns no price.

---

## 6. Cost Basis — FIFO

Finvyo uses **First-In, First-Out (FIFO)** matching for all cost basis and realized
gain calculations.

- Buy transactions are added to a per-symbol lot queue in chronological order.
- Sell transactions consume lots from the front of the queue.
- Each matched lot records: shares sold, cost per share, proceeds, realized gain,
  and holding duration in days.
- **Holding period ≥ 730 days** → classified as `LONG_TERM`; otherwise `SHORT_TERM`.

### Orphaned sells (no matching buy lots)

If a sell has no corresponding buy lots (e.g., the import is missing older buy history),
the matched cost basis defaults to the **sell proceeds** — meaning realized gain is
recorded as **₹0 / $0** for those shares. This is conservative: it avoids fabricating
a gain or loss on unreconciled history. The user should manually add missing buy records.

---

## 7. Dividend Handling

Dividends are treated as **cash income**, not as reinvestment events:

1. The dividend amount is added to the portfolio's cash balance on the dividend date.
2. `dividendsReceived` is tracked per holding for display purposes.
3. Dividends do **not** add to cost basis or share count.
4. Dividends do **not** create TWR sub-period boundaries (they are not external capital events).

This requires using **unadjusted (raw) historical prices** for held stocks. See §8.

---

## 8. Price Sourcing — Raw vs Adjusted

Yahoo Finance provides two price series for every security:

| Series | What it is | Used for |
|---|---|---|
| `close` (raw) | Actual traded price on that day | Portfolio holdings |
| `adjclose` (adjusted) | Price retroactively reduced on ex-dividend dates so total return appears as price-only return | Benchmark indices |

### Why this matters

Yahoo's `adjclose` bakes dividend income into the historical price series by reducing
past prices on ex-dividend dates. If you use `adjclose` for a holding *and* also credit
the dividend as cash, you count the same income twice:
- Once via the higher-than-actual adjusted price (the price drop on ex-date is erased)
- Once via the cash balance increase from the `DIVIDEND` transaction

**Finvyo's rule:**
- **Held stocks** → always use raw `close` prices
- **Benchmark indices** (S&P 500, Nasdaq 100, Nifty 50, etc.) → use `adjclose` to
  capture their total return (price + reinvested dividends), the correct apples-to-apples
  comparison

This is enforced in [`lib/stock-api.ts`](lib/stock-api.ts) via the `useAdjustedPrices`
parameter on `getStockDailyHistory()`.

---

## 9. Stock Splits

Stock splits are a **corporate action** — they are not a return event and carry no cash
impact.

The `STOCK_SPLIT` transaction type uses the `shares` field as a **split multiplier**:

| `shares` value | Meaning |
|---|---|
| `2.0` | Two-for-one forward split — share count doubles, per-share price halves |
| `0.5` | One-for-two reverse split — share count halves, per-share price doubles |
| `3.0` | Three-for-one split |

On processing a split:
- Running share count is multiplied by the ratio
- Each buy lot's **per-share cost** is divided by the ratio (shares in the lot multiply by the ratio)
- **Total cost basis is unchanged** — the same dollars were invested
- Cash balance is unchanged
- TWR is unaffected — splits do not create sub-period boundaries

---

## 10. Fees and Taxes

| Transaction type | Cash effect | Cost basis effect | TWR impact |
|---|---|---|---|
| Brokerage `fee` on `BUY` | Deducted from cash | Added to cost of acquired shares | None (internal) |
| Brokerage `fee` on `SELL` | Deducted from proceeds | Reduces realized gain | None (internal) |
| `FEE` (standalone) | Deducted from cash | None | None (internal) |
| `TAX` | Deducted from cash | None | None (internal) |

Fees and taxes reduce portfolio value and are therefore reflected in TWR indirectly
through the daily valuation — they are not excluded from performance.

---

## 11. Risk Metrics

All risk metrics are derived from the daily portfolio value timeline.

### Annualized Volatility

```
σ_annual = σ_daily × √252
```

Where `σ_daily` is the standard deviation of daily portfolio returns
`(V_t − V_{t-1}) / V_{t-1}` across all timeline points.

252 is the standard number of US trading days per year.

### Sharpe Ratio

```
Sharpe = (R_annualized − R_f) / σ_annual
```

Where `R_f = 4.5%` (approximate 10-year US Treasury rate, used as the risk-free rate).

### Maximum Drawdown

```
MaxDrawdown = max_t [ (Peak_t − V_t) / Peak_t ] × 100
```

Where `Peak_t` is the highest portfolio value seen on any date up to and including `t`.

---

## 12. Benchmark Comparison

Benchmark returns (S&P 500, Nasdaq 100, Nifty 50, Dow Jones, MSCI World) are computed
using **adjusted close prices** (`adjclose`) to capture total return including dividends
reinvested — the standard basis for comparing a self-managed portfolio to index funds.

All benchmarks are indexed to **0% on the first transaction date** so the comparison
starts from the same point in time.

### Simulated DCA

For each benchmark, Finvyo replays your exact deposit timeline as if you had invested
each deposit into the index instead of individual stocks. The final value of this
simulated DCA portfolio is what you would have had if you had bought the index.

---

## 13. Known Limitations and Approximations

| Limitation | Impact | Status |
|---|---|---|
| **Daily granularity only** — no intraday timestamps | A morning deposit invested immediately before a price move is indistinguishable from an end-of-day deposit. `V_end_pre = V_end_post − C` is a daily-close approximation. | By design — intraday data not available |
| **Same-day multiple flows are netted** | Two flows on the same day (e.g., deposit in morning, withdrawal at noon) are summed into one net flow. Returns between them are not captured. | Acceptable for consumer use |
| **No multi-currency FX conversion** | All amounts are assumed to be in a single base currency. The `exchangeRate` field on `Transaction` is stored but not applied to monetary amounts. | Known gap — future enhancement |
| **Annualized TWR not shown under 30 days** | Raw cumulative TWR is shown instead for new portfolios. | By design |
| **Missing price → 0 contribution** | Holdings with no available price contribute 0 to portfolio value. A `console.warn` is logged. | Explicit — honest over fabricated |
| **No margin, shorts, or options** | Negative portfolio values are not supported. Portfolio value is floored at 0. | Out of scope for v1 |
| **No GIPS composite** | Returns are for a single portfolio, not a composite of similar portfolios. Not third-party verified. | Out of scope for a personal tracker |
