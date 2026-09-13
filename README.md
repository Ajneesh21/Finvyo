# Finvyo

> **Your wealth. In view.**

A modern, high-performance **Next.js** web application designed to analyze US stock investing transaction reports and account statements, compute **Time-Weighted Return (TWR)** and **Money-Weighted Return (XIRR)**, benchmark portfolio performance against **major global indices** (S&P 500, Nasdaq 100, Nifty 50, Dow Jones, MSCI World), and track **real-time stock prices** with Redis caching and Docker support.

---

## Features

- **Spreadsheet & Statement Parser**:
  - Drag-and-drop parser supporting Account Statements, Trade Confirmations, and Activity Reports (Excel, Numbers, CSV, and PDF).
  - Automatically extracts dates, tickers, action types (`BUY`, `SELL`, `DIVIDEND`, `DEPOSIT`, `WITHDRAWAL`, `FEE`), shares, prices, and amounts.
  - Interactive validation table with raw text inspector and manual edit support.
  - 1-click **"Load Sample Portfolio"** button pre-populated with 2+ years of realistic DCA history (AAPL, NVDA, MSFT, TSLA, VOO, GOOGL, AMZN).

- **Time-Weighted Return (TWR) Engine**:
  - Eliminates the distorting effect of external cash deposits/withdrawals to reflect true investment performance according to Global Investment Performance Standards (GIPS).
  - Sub-period compounding breakdown table: \(R_{TWR} = \prod (1 + R_i) - 1\).
  - Annualized TWR (CAGR) and comparison against Money-Weighted Return (XIRR).

- **Global Indices Benchmarking**:
  - Head-to-head comparison against:
    - **S&P 500** (`^GSPC` / `SPY`)
    - **Nasdaq 100** (`^NDX` / `QQQ`)
    - **Nifty 50** (`^NSEI` / `INDY`)
    - **Dow Jones** (`^DJI` / `DIA`)
    - **MSCI World** (`URTH` / `VT`)
  - Calculates **Alpha (\(\alpha\))**, **Beta (\(\beta\))**, **Sharpe Ratio**, **Correlation**, and **Max Drawdown**.
  - **Simulated Dollar-Cost-Averaging (DCA)**: Compares what your exact deposits would be worth if invested into S&P 500 or Nasdaq instead.

- **Real-Time Stock Prices & Redis Caching**:
  - Fetches live quotes and day change percentage from Yahoo Finance.
  - Dual caching layer (Redis with in-memory LRU fallback) to prevent rate limits.
  - Real-time price pulse badges, day's gain/loss, and manual / automated price refreshes.

- **Professional Financial Terminal Dashboard**:
  - Performance Chart with valuation growth and TWR % vs benchmark curves.
  - Holdings table with sorting, fractional share support, and cost basis tracking.
  - Asset Allocation donut chart and sector diversification breakdown.
  - Transaction ledger with search, filtering, adding custom transactions, and CSV export.
  - Capital Gains tax ledger (short-term vs long-term FIFO matching).

---

## Getting Started

### Option 1: Running with Docker (Recommended for Docker + Redis)

Ensure Docker and Docker Compose are installed:

```bash
docker compose up --build
```

The web app will be available at [http://localhost:3000](http://localhost:3000). Redis cache runs automatically on port 6379 with persistent volume storage.

---

### Option 2: Running Locally with Node.js

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Tests

Run the financial engine and PDF parser verification suite:

```bash
npx tsx scripts/verify.ts
```

Build production bundle:

```bash
npm run build
```

---

## License & Disclaimer

This project is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE).

For financial calculations, investment advice exclusions, and third-party data notices, please refer to the [Disclaimer](DISCLAIMER.md).

