export interface HistoricalYearData {
  year: number | string; // e.g. 2024 or "FY2024"
  fiscalDate: string; // ISO date or "2024-09-30"
  revenue: number;
  revenueGrowth?: number; // % YoY (e.g. 12.5)
  ebit: number;
  ebitMargin: number; // % of revenue (e.g. 30.2)
  taxExpense: number;
  effectiveTaxRate: number; // % (e.g. 18.5)
  da: number; // Depreciation & Amortization
  daPercentRevenue: number; // % of revenue
  capex: number; // Capital Expenditures (positive magnitude)
  capexPercentRevenue: number; // % of revenue
  operatingCashFlow: number;
  fcf: number; // Free Cash Flow
  nwc: number; // Net Working Capital (Current Assets - Current Liabilities - Cash)
  nwcPercentRevenue: number; // % of revenue
  deltaNwc: number; // Change in NWC YoY
  source: string; // e.g. "SEC 10-K / Yahoo Finance"
}

export interface FinancialData {
  symbol: string;
  companyName: string;
  currency: string;
  currentPrice: number;
  marketCap: number;
  beta: number;
  dilutedShares: number;
  cash: number; // Cash and cash equivalents
  investments: number; // Short term + long term marketable securities
  debt: number; // Total Debt (Short-term + Long-term)
  otherClaims: number; // Preferred equity, minority interest, etc.
  riskFreeRate: number; // % e.g. 4.25
  equityRiskPremium: number; // % e.g. 5.5
  costOfDebt: number; // % e.g. 4.5
  
  // EPS & P/E Metrics
  trailingEps: number;
  forwardEps: number;
  trailingPE: number;
  forwardPE: number;
  historicalEpsGrowth: number;

  // Latest 12M / FY anchor values
  latestRevenue: number;
  latestEbit: number;
  latestFCF: number;
  latestOperatingCashFlow: number;

  // Normalized baseline averages over 5 years
  normalizedHistoricalGrowth: number;
  normalizedEbitMargin: number;
  normalizedTaxRate: number;
  normalizedDaPercent: number;
  normalizedCapexPercent: number;
  normalizedNwcPercent: number;

  // 5-Year Historical Financial Records
  historicalYears: HistoricalYearData[];

  // Data source attribution per field
  dataSources: Record<string, { source: string; period: string }>;

  // Data quality & validation flags
  flags: {
    negativeFCF: boolean;
    unusualMargins: boolean;
    missingData: boolean;
    warningMessages: string[];
  };
}

export interface EpsYearPoint {
  year: number;
  label: string;
  eps: number;
  projectedPrice: number;
}

export interface EpsDcfScenario {
  scenario: DCFScenarioType;
  epsGrowth: number; // % annual growth
  exitPE: number; // Terminal P/E multiple
  desiredReturn: number; // % annual desired return (CAGR)
  futureEps: number; // Projected EPS in year N
  futurePrice: number; // Projected Stock Price in year N = futureEps * exitPE
  fairBuyPrice: number; // Max Fair Buy Price Today = futurePrice / (1 + desiredReturn)^N
  marginOfSafety: number; // % (fairBuyPrice - purchasePrice) / purchasePrice
  expectedCagr: number; // % (futurePrice / purchasePrice)^(1/N) - 1
  totalReturnPercent: number; // % (futurePrice - purchasePrice) / purchasePrice
  totalReturnMultiple: number; // futurePrice / purchasePrice
  yearlySchedule: EpsYearPoint[];
}

export interface EpsDcfSensitivityGrid {
  growthRates: number[];
  peMultiples: number[];
  grid: {
    growth: number;
    pe: number;
    futurePrice: number;
    cagr: number;
    fairBuyPrice: number;
  }[][];
}

export interface EpsDcfValuationResult {
  symbol: string;
  companyName: string;
  purchasePrice: number;
  startingEps: number;
  currentPE: number;
  projectionYears: ProjectionHorizon;
  scenarios: {
    BEAR: EpsDcfScenario;
    BASE: EpsDcfScenario;
    BULL: EpsDcfScenario;
  };
  sensitivity: EpsDcfSensitivityGrid;
}

export type ProjectionHorizon = 3 | 5 | 10;

export interface DCFAssumptions {
  projectionYears: ProjectionHorizon;
  revenueGrowth: number[]; // % per year [Y1, Y2, ...]
  ebitMargin: number[]; // % per year [Y1, Y2, ...]
  taxRate: number; // %
  daPercentRevenue: number; // %
  capexPercentRevenue: number; // %
  nwcPercentRevenue: number; // %
  riskFreeRate: number; // %
  beta: number;
  equityRiskPremium: number; // %
  costOfDebt: number; // %
  waccOverride?: number; // Optional direct WACC % override
  terminalGrowth: number; // %
  customOverrides?: Record<string, boolean>; // Tracks user overrides vs auto-defaults
}

export type DCFScenarioType = "BEAR" | "BASE" | "BULL";

export interface DCFProjectionYear {
  year: number; // 1..N
  label: string; // "Year 1 (2026)"
  revenue: number;
  revenueGrowth: number; // %
  ebit: number;
  ebitMargin: number; // %
  nopat: number;
  taxRate: number; // %
  da: number;
  daPercentRevenue: number; // %
  capex: number;
  capexPercentRevenue: number; // %
  nwc: number;
  nwcPercentRevenue: number; // %
  deltaNwc: number;
  ufcf: number; // Unlevered Free Cash Flow
  discountPeriod: number; // t (1, 2, ...)
  discountFactor: number; // 1 / (1 + WACC)^t
  pvUfcf: number; // UFCF * discountFactor
}

export interface DCFWaccBreakdown {
  costOfEquity: number; // %
  costOfDebt: number; // %
  afterTaxCostOfDebt: number; // %
  weightEquity: number; // e.g. 0.85
  weightDebt: number; // e.g. 0.15
  totalCapital: number;
  wacc: number; // %
  isOverridden: boolean;
}

export interface DCFValuation {
  scenario: DCFScenarioType;
  projectionYears: ProjectionHorizon;
  projections: DCFProjectionYear[];
  sumPvUfcf: number;
  terminalUfcf: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  cash: number;
  investments: number;
  debt: number;
  otherClaims: number;
  equityValue: number;
  dilutedShares: number;
  intrinsicValuePerShare: number;
  currentPrice: number;
  upsidePercent: number; // %
  wacc: DCFWaccBreakdown;
  terminalGrowth: number; // %
  validation: {
    isValid: boolean;
    waccGreaterThanGrowth: boolean;
    terminalGrowthBelowGdp: boolean;
    warnings: string[];
    errors: string[];
  };
}

export interface DCFSensitivityCell {
  wacc: number; // %
  terminalGrowth: number; // %
  intrinsicValue: number;
  upsidePercent: number;
  isValid: boolean;
}

export interface DCFSensitivityMatrix {
  waccRange: number[]; // e.g. [7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0]
  terminalGrowthRange: number[]; // e.g. [1.5, 2.0, 2.5, 3.0, 3.5]
  grid: DCFSensitivityCell[][];
  baseWacc: number;
  baseTerminalGrowth: number;
}

export interface MonteCarloBucket {
  priceRange: string;
  min: number;
  max: number;
  count: number;
  frequencyPercent: number;
}

export interface MonteCarloResult {
  simulations: number;
  meanIntrinsicValue: number;
  medianIntrinsicValue: number;
  p10IntrinsicValue: number;
  p25IntrinsicValue: number;
  p75IntrinsicValue: number;
  p90IntrinsicValue: number;
  minIntrinsicValue: number;
  maxIntrinsicValue: number;
  probabilityOfUndervaluation: number; // %
  distributionBuckets: MonteCarloBucket[];
}

export interface MultiScenarioValuation {
  financialData: FinancialData;
  projectionYears: ProjectionHorizon;
  scenarios: {
    BEAR: {
      assumptions: DCFAssumptions;
      valuation: DCFValuation;
    };
    BASE: {
      assumptions: DCFAssumptions;
      valuation: DCFValuation;
    };
    BULL: {
      assumptions: DCFAssumptions;
      valuation: DCFValuation;
    };
  };
  sensitivity: DCFSensitivityMatrix;
  monteCarlo?: MonteCarloResult;
}
