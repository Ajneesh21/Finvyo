# Finvyo

> **Your wealth. In view.**
> Portfolio intelligence, Time-Weighted Return (TWR), Money-Weighted Return (XIRR), index benchmarking, and DCF valuation for **Vested** investors.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-green.svg)](LICENSE)

---

## About Finvyo

**Finvyo** transforms raw **Vested** brokerage reports (Account Statements, Activity Reports, and Trade Confirmations) into institutional-caliber portfolio intelligence.

While brokerage apps show basic balances and simple percentage gains, they do not provide true performance metrics unskewed by cash deposits, nor do they measure how your stock picks compare to investing in benchmark index funds. Finvyo solves this with local, privacy-first portfolio analytics.

### Key Capabilities

- 📄 **Vested Excel (.xlsx) Ingestion**: Drag-and-drop support for Vested Excel (`.xlsx`) statements and multi-sheet activity workbooks, or paste raw report text directly. Includes a 1-click **Sample Portfolio** loaded with 2+ years of realistic DCA history.
- ⏱️ **True Return Engine (TWR & XIRR)**:
  - **Time-Weighted Return (TWR)**: Daily cash-flow-adjusted TWR that eliminates the distortion of external deposits and withdrawals by splitting the measurement period at each capital event. See [METHODOLOGY.md](METHODOLOGY.md) for the full calculation specification.
  - **Money-Weighted Return (XIRR)**: Solves the internal rate of return based on the exact timing and size of your capital injections.
  - **Annualized TWR (CAGR)** shown after a minimum of 30 days of history.
- 🌐 **Global Index Benchmarking & DCA Replay**:
  - Head-to-head comparison against **S&P 500** (`SPY`), **Nasdaq 100** (`QQQ`), **Nifty 50** (`INDY`), **Dow Jones** (`DIA`), and **MSCI World** (`URTH`).
  - Risk metrics: **Alpha ($\alpha$)**, **Beta ($\beta$)**, **Sharpe Ratio**, **Correlation**, and **Max Drawdown**.
  - **Simulated DCA**: Replays your exact Vested deposit timeline into index funds to see what your money would have earned in the index.
- 🧮 **Intrinsic DCF Valuation Terminal**: Multi-horizon (3, 5, 10 years) EPS and Free Cash Flow forecasting, terminal P/E multiples, discount rate sensitivity matrix, and margin of safety targets.
- 🧾 **FIFO Capital Gains Tax Ledger**: Matches buy/sell lots on a First-In-First-Out basis, tracking holding durations in days and classifying trades into Short-Term (STCG) vs. Long-Term (LTCG).
- 💼 **Holdings & Allocation**: Live quotes from Yahoo Finance, fractional share tracking, cost basis, unrealized P&L, asset class donuts, and sector breakdown charts.
- 📁 **Multi-Portfolio Support**: Manage multiple accounts, switch between them instantly, rename, and persist your data locally.

---

## How to Use It

### Quick Start with Docker (Recommended)

Docker sets up both the web application and a persistent Redis cache container:

```bash
# Clone the repository
git clone https://github.com/Ajneesh21/stockStats.git
cd stockStats

# Start containers
docker compose up --build
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Local Development (Node.js)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```
   *(Redis is optional; Finvyo automatically falls back to an in-memory cache if Redis is not running.)*

3. **Open the app**:
   Navigate to **[http://localhost:3000](http://localhost:3000)**.

---

### User Walkthrough

1. **Export your statement from Vested (XLSX only)**:
   - Log into Vested and download your **Transactions / Account Activity** report in **Excel (`.xlsx`) format**.
   > [!IMPORTANT]
   > **Download `.xlsx` only**: Do not use CSV. Vested's `.xlsx` export contains separate, complete sheets (`Holdings`, `Trades`, `Transfers`, `Income/Dividends`) with exact transaction timestamps and lot metadata. Vested's CSV export is incomplete and lacks essential lot and transaction classifications, causing inaccurate performance and tax calculations. CSV upload is intentionally not supported.

2. **Import into Finvyo**:
   - Click **"Upload Statement"** in the top navigation bar.
   - Drag and drop your `.xlsx` file (or paste text, or click **"Load Sample Portfolio"** to explore).
   - Review the parsed transaction preview and click **"Apply to Portfolio"**.
3. **Explore your metrics**:
   - **Overview**: View your total portfolio value, cumulative TWR %, XIRR, and performance curve over time.
   - **Holdings**: Check real-time prices, fractional shares, cost basis, and day's gain/loss.
   - **Allocation**: View your portfolio distribution across asset classes and market sectors.
   - **Benchmarks**: See how your stock picks compare to the S&P 500, Nasdaq 100, or Nifty 50, and view the simulated DCA comparison.
   - **Ledger**: Search transaction history, add manual adjustments, view FIFO realized capital gains (STCG/LTCG), and export to CSV.
   - **DCF Valuation**: Run multi-year intrinsic value models on any US stock.

---

## License

This project is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

```
Required Notice: Copyright (c) 2026 Ajneesh
```

- **Permitted**: Personal use, research, hobby projects, private portfolio tracking, and use by noncommercial/educational organizations.
- **Prohibited**: Commercial use, monetization, or commercial distribution without a separate commercial license.

See the full legal terms in **[`LICENSE`](LICENSE)**.

---

## Disclaimer

> [!IMPORTANT]
> **Finvyo is an independent tool for informational and personal analytics purposes only.**

- **Not Financial Advice**: Nothing produced by this software constitutes investment, financial, trading, tax, or legal advice. Independently verify all calculations before making decisions.
- **Accuracy**: Financial calculations and market quotes may contain delays, assumptions, or errors.
- **Independence**: Finvyo is independent and **not affiliated with, sponsored by, or endorsed by Vested Finance, DriveWealth LLC, Yahoo Finance, or any broker**.
- **Privacy**: Statements are parsed locally/server-side in your private instance; your transaction data is not collected or sent to external servers.
- **No Liability**: Use of this software is entirely at your own risk.

For the complete disclaimer, see **[`DISCLAIMER.md`](DISCLAIMER.md)**.
