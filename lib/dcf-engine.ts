import {
  FinancialData,
  DCFAssumptions,
  DCFScenarioType,
  DCFProjectionYear,
  DCFWaccBreakdown,
  DCFValuation,
  DCFSensitivityMatrix,
  DCFSensitivityCell,
  ProjectionHorizon,
  MultiScenarioValuation,
  MonteCarloResult,
  MonteCarloBucket,
} from "./dcf-types";

/**
 * Calculate WACC and its components
 */
export function calculateWACC(
  financialData: FinancialData,
  assumptions: DCFAssumptions
): DCFWaccBreakdown {
  if (
    assumptions.waccOverride !== undefined &&
    assumptions.waccOverride > 0 &&
    !isNaN(assumptions.waccOverride)
  ) {
    const costOfEquity =
      assumptions.riskFreeRate +
      assumptions.beta * assumptions.equityRiskPremium;
    const afterTaxCostOfDebt =
      assumptions.costOfDebt * (1 - assumptions.taxRate / 100);
    const totalCapital = financialData.marketCap + financialData.debt;
    const weightEquity =
      totalCapital > 0 ? financialData.marketCap / totalCapital : 1;
    const weightDebt =
      totalCapital > 0 ? financialData.debt / totalCapital : 0;

    return {
      costOfEquity: Number(costOfEquity.toFixed(2)),
      costOfDebt: Number(assumptions.costOfDebt.toFixed(2)),
      afterTaxCostOfDebt: Number(afterTaxCostOfDebt.toFixed(2)),
      weightEquity: Number(weightEquity.toFixed(4)),
      weightDebt: Number(weightDebt.toFixed(4)),
      totalCapital,
      wacc: Number(assumptions.waccOverride.toFixed(2)),
      isOverridden: true,
    };
  }

  // Cost of Equity = Risk-Free Rate + Beta * Equity Risk Premium
  const costOfEquity =
    assumptions.riskFreeRate + assumptions.beta * assumptions.equityRiskPremium;

  // After-Tax Cost of Debt = Cost of Debt * (1 - Tax Rate)
  const afterTaxCostOfDebt =
    assumptions.costOfDebt * (1 - assumptions.taxRate / 100);

  const marketCap = Math.max(0, financialData.marketCap);
  const debt = Math.max(0, financialData.debt);
  const totalCapital = marketCap + debt;

  const weightEquity = totalCapital > 0 ? marketCap / totalCapital : 1;
  const weightDebt = totalCapital > 0 ? debt / totalCapital : 0;

  // WACC = Weight(Equity) * Cost(Equity) + Weight(Debt) * AfterTaxCost(Debt)
  const calculatedWacc =
    weightEquity * costOfEquity + weightDebt * afterTaxCostOfDebt;

  return {
    costOfEquity: Number(costOfEquity.toFixed(2)),
    costOfDebt: Number(assumptions.costOfDebt.toFixed(2)),
    afterTaxCostOfDebt: Number(afterTaxCostOfDebt.toFixed(2)),
    weightEquity: Number(weightEquity.toFixed(4)),
    weightDebt: Number(weightDebt.toFixed(4)),
    totalCapital,
    wacc: Number(Math.max(1.0, calculatedWacc).toFixed(2)),
    isOverridden: false,
  };
}

/**
 * Helper to get an array of rates for N years given assumptions array or single value
 */
function expandRateArray(
  input: number[] | number | undefined,
  years: ProjectionHorizon,
  fallbackRate: number
): number[] {
  if (Array.isArray(input) && input.length > 0) {
    if (input.length >= years) {
      return input.slice(0, years);
    }
    // Repeat last rate to fill projection horizon
    const result = [...input];
    const last = input[input.length - 1];
    while (result.length < years) {
      result.push(last);
    }
    return result;
  }
  if (typeof input === "number" && !isNaN(input)) {
    return Array(years).fill(input);
  }
  return Array(years).fill(fallbackRate);
}

/**
 * Pure DCF Calculation Function
 * Computes the full DCF model from FinancialData and DCFAssumptions
 */
export function calculateDCF(
  financialData: FinancialData,
  assumptions: DCFAssumptions,
  projectionYears: ProjectionHorizon = 5,
  scenario: DCFScenarioType = "BASE"
): DCFValuation {
  const currentYear = new Date().getFullYear();
  const N = projectionYears;

  const waccBreakdown = calculateWACC(financialData, assumptions);
  const waccRate = waccBreakdown.wacc / 100;
  const terminalGrowthRate = assumptions.terminalGrowth / 100;
  const taxRate = assumptions.taxRate / 100;
  const daRate = assumptions.daPercentRevenue / 100;
  const capexRate = assumptions.capexPercentRevenue / 100;
  const nwcRate = assumptions.nwcPercentRevenue / 100;

  const growthRates = expandRateArray(
    assumptions.revenueGrowth,
    N,
    financialData.normalizedHistoricalGrowth || 8.0
  );
  const ebitMargins = expandRateArray(
    assumptions.ebitMargin,
    N,
    financialData.normalizedEbitMargin || 20.0
  );

  const warnings: string[] = [];
  const errors: string[] = [];

  // Validation checks
  const waccGreaterThanGrowth = waccBreakdown.wacc > assumptions.terminalGrowth;
  if (!waccGreaterThanGrowth) {
    errors.push(
      `WACC (${waccBreakdown.wacc}%) must be strictly greater than Terminal Growth (${assumptions.terminalGrowth}%).`
    );
  }

  const terminalGrowthBelowGdp = assumptions.terminalGrowth <= 4.0;
  if (!terminalGrowthBelowGdp) {
    warnings.push(
      `Terminal Growth (${assumptions.terminalGrowth}%) exceeds typical long-term GDP growth (~2.5% - 3.5%).`
    );
  }

  if (financialData.latestFCF <= 0) {
    warnings.push("Latest historical Free Cash Flow is zero or negative.");
  }

  // Base starting revenue (Period 0)
  const baseRevenue =
    financialData.latestRevenue > 0 ? financialData.latestRevenue : 1000000000;
  let prevRevenue = baseRevenue;
  let prevNwc = baseRevenue * nwcRate;

  const projections: DCFProjectionYear[] = [];
  let sumPvUfcf = 0;

  for (let t = 1; t <= N; t++) {
    const revGrowth = growthRates[t - 1]; // e.g. 10.5 (%)
    const revGrowthFactor = 1 + revGrowth / 100;
    const revenue = prevRevenue * revGrowthFactor;

    const ebitMargin = ebitMargins[t - 1]; // e.g. 28.5 (%)
    const ebit = revenue * (ebitMargin / 100);

    const nopat = ebit * (1 - taxRate);
    const da = revenue * daRate;
    const capex = revenue * capexRate;
    const nwc = revenue * nwcRate;
    const deltaNwc = nwc - prevNwc;

    // UFCF[t] = NOPAT[t] + D&A[t] - CapEx[t] - DeltaNWC[t]
    const ufcf = nopat + da - capex - deltaNwc;

    // Discounting
    const discountPeriod = t;
    const discountFactor = 1 / Math.pow(1 + waccRate, t);
    const pvUfcf = ufcf * discountFactor;

    sumPvUfcf += pvUfcf;

    projections.push({
      year: t,
      label: `FY${currentYear + t}`,
      revenue: Math.round(revenue),
      revenueGrowth: Number(revGrowth.toFixed(2)),
      ebit: Math.round(ebit),
      ebitMargin: Number(ebitMargin.toFixed(2)),
      nopat: Math.round(nopat),
      taxRate: Number((taxRate * 100).toFixed(2)),
      da: Math.round(da),
      daPercentRevenue: Number((daRate * 100).toFixed(2)),
      capex: Math.round(capex),
      capexPercentRevenue: Number((capexRate * 100).toFixed(2)),
      nwc: Math.round(nwc),
      nwcPercentRevenue: Number((nwcRate * 100).toFixed(2)),
      deltaNwc: Math.round(deltaNwc),
      ufcf: Math.round(ufcf),
      discountPeriod,
      discountFactor: Number(discountFactor.toFixed(4)),
      pvUfcf: Math.round(pvUfcf),
    });

    prevRevenue = revenue;
    prevNwc = nwc;
  }

  // Terminal Value (Gordon Growth Model)
  const lastUfcf = projections[projections.length - 1].ufcf;
  let terminalValue = 0;
  let pvTerminalValue = 0;

  if (waccGreaterThanGrowth) {
    terminalValue =
      (lastUfcf * (1 + terminalGrowthRate)) / (waccRate - terminalGrowthRate);
    pvTerminalValue = terminalValue / Math.pow(1 + waccRate, N);
  }

  // Enterprise Value = sum(PV(UFCF)) + PV(TerminalValue)
  const enterpriseValue = sumPvUfcf + pvTerminalValue;

  // Equity Value = Enterprise Value + Cash + Investments - Debt - Other Claims
  const cash = Math.max(0, financialData.cash);
  const investments = Math.max(0, financialData.investments);
  const debt = Math.max(0, financialData.debt);
  const otherClaims = Math.max(0, financialData.otherClaims || 0);

  const equityValue = enterpriseValue + cash + investments - debt - otherClaims;

  const shares =
    financialData.dilutedShares > 0 ? financialData.dilutedShares : 1;
  const rawIntrinsic = equityValue / shares;
  const intrinsicValuePerShare = Math.max(0, Number(rawIntrinsic.toFixed(2)));

  const currentPrice = financialData.currentPrice || 1.0;
  const upsidePercent =
    currentPrice > 0
      ? Number((((intrinsicValuePerShare - currentPrice) / currentPrice) * 100).toFixed(2))
      : 0;

  return {
    scenario,
    projectionYears,
    projections,
    sumPvUfcf: Math.round(sumPvUfcf),
    terminalUfcf: Math.round(lastUfcf),
    terminalValue: Math.round(terminalValue),
    pvTerminalValue: Math.round(pvTerminalValue),
    enterpriseValue: Math.round(enterpriseValue),
    cash,
    investments,
    debt,
    otherClaims,
    equityValue: Math.round(equityValue),
    dilutedShares: shares,
    intrinsicValuePerShare,
    currentPrice,
    upsidePercent,
    wacc: waccBreakdown,
    terminalGrowth: assumptions.terminalGrowth,
    validation: {
      isValid: errors.length === 0,
      waccGreaterThanGrowth,
      terminalGrowthBelowGdp,
      warnings,
      errors,
    },
  };
}

/**
 * Generate default scenario assumptions based on normalized historical fundamentals
 */
export function generateScenarioAssumptions(
  financialData: FinancialData,
  projectionYears: ProjectionHorizon = 5
): {
  BEAR: DCFAssumptions;
  BASE: DCFAssumptions;
  BULL: DCFAssumptions;
} {
  const normGrowth = financialData.normalizedHistoricalGrowth || 10.0;
  const normEbitMargin = financialData.normalizedEbitMargin || 25.0;
  const normTaxRate = financialData.normalizedTaxRate || 21.0;
  const normDa = financialData.normalizedDaPercent || 3.5;
  const normCapex = financialData.normalizedCapexPercent || 4.0;
  const normNwc = financialData.normalizedNwcPercent || 0.0;
  const riskFreeRate = financialData.riskFreeRate || 4.25;
  const beta = financialData.beta || 1.0;
  const erp = financialData.equityRiskPremium || 5.5;
  const costOfDebt = financialData.costOfDebt || 5.0;

  // Base Growth Curve (linear fade towards terminal rate for 10Y, steady for 3Y/5Y)
  const baseGrowth: number[] = [];
  const bearGrowth: number[] = [];
  const bullGrowth: number[] = [];

  const baseEbit: number[] = [];
  const bearEbit: number[] = [];
  const bullEbit: number[] = [];

  for (let i = 0; i < projectionYears; i++) {
    const fade = projectionYears === 10 && i >= 5 ? 0.85 : 1.0;
    
    // Base Case
    const bG = Math.max(2.5, normGrowth * fade);
    baseGrowth.push(Number(bG.toFixed(1)));
    baseEbit.push(Number(normEbitMargin.toFixed(1)));

    // Bear Case: lower revenue growth, lower margin
    const bearG = Math.max(1.0, bG * 0.6);
    const bearM = Math.max(3.0, normEbitMargin - 3.5);
    bearGrowth.push(Number(bearG.toFixed(1)));
    bearEbit.push(Number(bearM.toFixed(1)));

    // Bull Case: higher revenue growth, expanding margin
    const bullG = Math.min(45.0, bG * 1.4);
    const bullM = Math.min(65.0, normEbitMargin + 3.5);
    bullGrowth.push(Number(bullG.toFixed(1)));
    bullEbit.push(Number(bullM.toFixed(1)));
  }

  const BASE: DCFAssumptions = {
    projectionYears,
    revenueGrowth: baseGrowth,
    ebitMargin: baseEbit,
    taxRate: Number(normTaxRate.toFixed(1)),
    daPercentRevenue: Number(normDa.toFixed(1)),
    capexPercentRevenue: Number(normCapex.toFixed(1)),
    nwcPercentRevenue: Number(normNwc.toFixed(1)),
    riskFreeRate: Number(riskFreeRate.toFixed(2)),
    beta: Number(beta.toFixed(2)),
    equityRiskPremium: Number(erp.toFixed(2)),
    costOfDebt: Number(costOfDebt.toFixed(2)),
    terminalGrowth: 2.5,
  };

  const BEAR: DCFAssumptions = {
    projectionYears,
    revenueGrowth: bearGrowth,
    ebitMargin: bearEbit,
    taxRate: Number((normTaxRate + 1.0).toFixed(1)),
    daPercentRevenue: Number(normDa.toFixed(1)),
    capexPercentRevenue: Number((normCapex + 1.0).toFixed(1)), // higher capex intensity
    nwcPercentRevenue: Number((normNwc + 1.0).toFixed(1)), // higher working cap requirement
    riskFreeRate: Number(riskFreeRate.toFixed(2)),
    beta: Number((beta * 1.15).toFixed(2)), // higher beta / volatility
    equityRiskPremium: Number((erp + 0.75).toFixed(2)), // higher risk premium
    costOfDebt: Number((costOfDebt + 1.0).toFixed(2)),
    terminalGrowth: 1.75, // lower terminal growth
  };

  const BULL: DCFAssumptions = {
    projectionYears,
    revenueGrowth: bullGrowth,
    ebitMargin: bullEbit,
    taxRate: Number(Math.max(15.0, normTaxRate - 1.0).toFixed(1)),
    daPercentRevenue: Number(normDa.toFixed(1)),
    capexPercentRevenue: Number(Math.max(1.0, normCapex - 0.75).toFixed(1)), // capital efficient
    nwcPercentRevenue: Number((normNwc - 0.5).toFixed(1)),
    riskFreeRate: Number(riskFreeRate.toFixed(2)),
    beta: Number(Math.max(0.7, beta * 0.9).toFixed(2)),
    equityRiskPremium: Number(Math.max(4.5, erp - 0.5).toFixed(2)),
    costOfDebt: Number(Math.max(3.5, costOfDebt - 0.5).toFixed(2)),
    terminalGrowth: 3.25, // higher terminal growth
  };

  return { BEAR, BASE, BULL };
}

/**
 * Generate Sensitivity Matrix of WACC vs Terminal Growth
 */
export function generateSensitivityMatrix(
  financialData: FinancialData,
  baseAssumptions: DCFAssumptions,
  projectionYears: ProjectionHorizon = 5
): DCFSensitivityMatrix {
  const baseWacc = calculateWACC(financialData, baseAssumptions).wacc;
  const baseTerminalGrowth = baseAssumptions.terminalGrowth;

  // WACC range: baseWacc +/- 2.0% in steps of 0.5% (9 steps: -2.0 to +2.0)
  const waccOffsets = [-2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0];
  const waccRange = waccOffsets
    .map((o) => Number((baseWacc + o).toFixed(2)))
    .filter((w) => w > 1.0);

  // Terminal growth range: base +/- 1.0% in steps of 0.5% (5 steps: -1.0, -0.5, 0, +0.5, +1.0)
  const tgOffsets = [-1.0, -0.5, 0.0, 0.5, 1.0];
  const terminalGrowthRange = tgOffsets
    .map((o) => Number((baseTerminalGrowth + o).toFixed(2)))
    .filter((tg) => tg >= 0.5 && tg <= 4.5);

  const grid: DCFSensitivityCell[][] = [];

  for (const wacc of waccRange) {
    const row: DCFSensitivityCell[] = [];
    for (const tg of terminalGrowthRange) {
      if (wacc <= tg) {
        row.push({
          wacc,
          terminalGrowth: tg,
          intrinsicValue: 0,
          upsidePercent: -100,
          isValid: false,
        });
      } else {
        const testAssumptions: DCFAssumptions = {
          ...baseAssumptions,
          waccOverride: wacc,
          terminalGrowth: tg,
        };
        const val = calculateDCF(
          financialData,
          testAssumptions,
          projectionYears,
          "BASE"
        );
        row.push({
          wacc,
          terminalGrowth: tg,
          intrinsicValue: val.intrinsicValuePerShare,
          upsidePercent: val.upsidePercent,
          isValid: val.validation.isValid,
        });
      }
    }
    grid.push(row);
  }

  return {
    waccRange,
    terminalGrowthRange,
    grid,
    baseWacc,
    baseTerminalGrowth,
  };
}

/**
 * Run Monte Carlo Simulation across randomized parameter distributions
 */
export function runMonteCarloSimulation(
  financialData: FinancialData,
  baseAssumptions: DCFAssumptions,
  projectionYears: ProjectionHorizon = 5,
  simulationsCount = 500
): MonteCarloResult {
  const values: number[] = [];
  const baseWacc = calculateWACC(financialData, baseAssumptions).wacc;
  const currentPrice = financialData.currentPrice || 1.0;

  // Box-Muller normal distribution sampler
  function sampleGaussian(mean: number, stdDev: number): number {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdDev;
  }

  const baseGrowthAvg =
    baseAssumptions.revenueGrowth.reduce((a, b) => a + b, 0) /
    baseAssumptions.revenueGrowth.length;
  const baseEbitAvg =
    baseAssumptions.ebitMargin.reduce((a, b) => a + b, 0) /
    baseAssumptions.ebitMargin.length;

  for (let i = 0; i < simulationsCount; i++) {
    // Perturb growth, margin, WACC, and terminal growth
    const sampledGrowth = sampleGaussian(baseGrowthAvg, 3.0);
    const sampledMargin = sampleGaussian(baseEbitAvg, 2.5);
    const sampledWacc = Math.max(3.0, sampleGaussian(baseWacc, 0.8));
    const sampledTg = Math.min(
      sampledWacc - 0.5,
      Math.max(1.0, sampleGaussian(baseAssumptions.terminalGrowth, 0.4))
    );

    const testGrowth = Array(projectionYears).fill(sampledGrowth);
    const testEbit = Array(projectionYears).fill(sampledMargin);

    const simAssumptions: DCFAssumptions = {
      ...baseAssumptions,
      revenueGrowth: testGrowth,
      ebitMargin: testEbit,
      waccOverride: sampledWacc,
      terminalGrowth: sampledTg,
    };

    const val = calculateDCF(
      financialData,
      simAssumptions,
      projectionYears,
      "BASE"
    );
    if (val.intrinsicValuePerShare > 0 && !isNaN(val.intrinsicValuePerShare)) {
      values.push(val.intrinsicValuePerShare);
    }
  }

  if (values.length === 0) {
    values.push(currentPrice);
  }

  values.sort((a, b) => a - b);

  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const meanIntrinsicValue = Number((sum / n).toFixed(2));
  const medianIntrinsicValue = Number(values[Math.floor(n * 0.5)].toFixed(2));
  const p10IntrinsicValue = Number(values[Math.floor(n * 0.1)].toFixed(2));
  const p25IntrinsicValue = Number(values[Math.floor(n * 0.25)].toFixed(2));
  const p75IntrinsicValue = Number(values[Math.floor(n * 0.75)].toFixed(2));
  const p90IntrinsicValue = Number(values[Math.floor(n * 0.9)].toFixed(2));
  const minIntrinsicValue = Number(values[0].toFixed(2));
  const maxIntrinsicValue = Number(values[n - 1].toFixed(2));

  const undervaluedCount = values.filter((v) => v > currentPrice).length;
  const probabilityOfUndervaluation = Number(
    ((undervaluedCount / n) * 100).toFixed(1)
  );

  // Group into 12 histogram buckets
  const numBuckets = 12;
  const bucketWidth = (maxIntrinsicValue - minIntrinsicValue) / numBuckets || 1;
  const distributionBuckets: MonteCarloBucket[] = [];

  for (let b = 0; b < numBuckets; b++) {
    const bMin = minIntrinsicValue + b * bucketWidth;
    const bMax = b === numBuckets - 1 ? maxIntrinsicValue : bMin + bucketWidth;
    const count = values.filter(
      (v) => (b === numBuckets - 1 ? v >= bMin && v <= bMax : v >= bMin && v < bMax)
    ).length;

    distributionBuckets.push({
      priceRange: `$${bMin.toFixed(0)}-$${bMax.toFixed(0)}`,
      min: Number(bMin.toFixed(1)),
      max: Number(bMax.toFixed(1)),
      count,
      frequencyPercent: Number(((count / n) * 100).toFixed(1)),
    });
  }

  return {
    simulations: n,
    meanIntrinsicValue,
    medianIntrinsicValue,
    p10IntrinsicValue,
    p25IntrinsicValue,
    p75IntrinsicValue,
    p90IntrinsicValue,
    minIntrinsicValue,
    maxIntrinsicValue,
    probabilityOfUndervaluation,
    distributionBuckets,
  };
}

/**
 * Calculate all scenarios (Bear, Base, Bull), sensitivity matrix, and Monte Carlo distribution
 */
export function calculateAllScenarios(
  financialData: FinancialData,
  assumptions: {
    BEAR?: DCFAssumptions;
    BASE?: DCFAssumptions;
    BULL?: DCFAssumptions;
  },
  projectionYears: ProjectionHorizon = 5
): MultiScenarioValuation {
  const defaults = generateScenarioAssumptions(financialData, projectionYears);

  const bearAssumptions = assumptions.BEAR || defaults.BEAR;
  const baseAssumptions = assumptions.BASE || defaults.BASE;
  const bullAssumptions = assumptions.BULL || defaults.BULL;

  const bearValuation = calculateDCF(
    financialData,
    bearAssumptions,
    projectionYears,
    "BEAR"
  );
  const baseValuation = calculateDCF(
    financialData,
    baseAssumptions,
    projectionYears,
    "BASE"
  );
  const bullValuation = calculateDCF(
    financialData,
    bullAssumptions,
    projectionYears,
    "BULL"
  );

  const sensitivity = generateSensitivityMatrix(
    financialData,
    baseAssumptions,
    projectionYears
  );

  const monteCarlo = runMonteCarloSimulation(
    financialData,
    baseAssumptions,
    projectionYears,
    400
  );

  return {
    financialData,
    projectionYears,
    scenarios: {
      BEAR: {
        assumptions: bearAssumptions,
        valuation: bearValuation,
      },
      BASE: {
        assumptions: baseAssumptions,
        valuation: baseValuation,
      },
      BULL: {
        assumptions: bullAssumptions,
        valuation: bullValuation,
      },
    },
    sensitivity,
    monteCarlo,
  };
}

export interface MultiHorizonScenarioItem {
  epsGrowth: number;
  exitPE: number;
  desiredReturn: number;
  horizons: Record<
    3 | 5 | 10,
    {
      years: 3 | 5 | 10;
      futureEps: number;
      finalPrice: number;
      fairBuyPrice: number;
      marginOfSafety: number;
      expectedCagr: number;
      totalGainPercent: number;
      totalGainMultiple: number;
      schedule: { year: number; label: string; eps: number; projectedPrice: number }[];
    }
  >;
}

export interface MultiHorizonEpsValuation {
  symbol: string;
  companyName: string;
  purchasePrice: number;
  startingEps: number;
  currentPE: number;
  scenarios: {
    BEAR: MultiHorizonScenarioItem;
    BASE: MultiHorizonScenarioItem;
    BULL: MultiHorizonScenarioItem;
  };
  sensitivityMatrix: {
    growthRates: number[];
    peMultiples: number[];
    grid: {
      growth: number;
      pe: number;
      finalPrice3Y: number;
      finalPrice5Y: number;
      finalPrice10Y: number;
      cagr3Y: number;
      cagr5Y: number;
      cagr10Y: number;
      fairBuyPrice5Y: number;
    }[][];
  };
}

/**
 * Calculate multi-horizon EPS-P/E Desired Return valuation for 3, 5, and 10 years
 */
export function calculateMultiHorizonEpsValuation(
  financialData: FinancialData,
  inputs?: {
    purchasePrice?: number;
    startingEps?: number;
    desiredReturn?: number;
    scenarios?: {
      BEAR?: { epsGrowth?: number; exitPE?: number; desiredReturn?: number };
      BASE?: { epsGrowth?: number; exitPE?: number; desiredReturn?: number };
      BULL?: { epsGrowth?: number; exitPE?: number; desiredReturn?: number };
    };
  }
): MultiHorizonEpsValuation {
  const purchasePrice =
    inputs?.purchasePrice !== undefined && inputs.purchasePrice > 0
      ? inputs.purchasePrice
      : financialData.currentPrice || 100.0;

  const actualMarketPrice = financialData.currentPrice || 100.0;
  const startingEps =
    typeof inputs?.startingEps === "number" && inputs.startingEps > 0
      ? inputs.startingEps
      : typeof financialData.trailingEps === "number" && financialData.trailingEps > 0
      ? financialData.trailingEps
      : Number((actualMarketPrice / (financialData.trailingPE || 25)).toFixed(2));

  const currentPE =
    startingEps > 0 ? Number((actualMarketPrice / startingEps).toFixed(1)) : 25.0;

  const defaultDesiredReturn = inputs?.desiredReturn || 15.0;

  const defaultGrowth =
    financialData.historicalEpsGrowth > 0
      ? Math.min(30, Math.max(6, financialData.historicalEpsGrowth))
      : 12.0;

  const defaultExitPE =
    financialData.trailingPE > 0
      ? Math.min(45, Math.max(12, financialData.trailingPE))
      : 22.0;

  // Compute single scenario across 3, 5, 10 years
  function computeScenarioHorizons(
    epsGrowth: number,
    exitPE: number,
    desiredReturn: number
  ): MultiHorizonScenarioItem {
    const curYear = new Date().getFullYear();
    const horizons: any = {};

    for (const N of [3, 5, 10] as const) {
      const g = epsGrowth / 100;
      const r = desiredReturn / 100;

      // Final EPS after N years: EPS_N = EPS_0 * (1 + g)^N
      const futureEps = startingEps * Math.pow(1 + g, N);

      // Final Stock Price after N years: FinalPrice_N = EPS_N * ExitPE
      const finalPrice = futureEps * exitPE;

      // Fair Buy Price Today for desired return: FairBuyPrice = FinalPrice_N / (1 + r)^N
      const fairBuyPrice = finalPrice / Math.pow(1 + r, N);

      // Margin of safety vs purchase price
      const marginOfSafety =
        purchasePrice > 0
          ? ((fairBuyPrice - purchasePrice) / purchasePrice) * 100
          : 0;

      // Expected annual return (CAGR) from purchase price to final price
      const expectedCagr =
        purchasePrice > 0
          ? (Math.pow(finalPrice / purchasePrice, 1 / N) - 1) * 100
          : 0;

      // Total gain %
      const totalGainPercent =
        purchasePrice > 0
          ? ((finalPrice - purchasePrice) / purchasePrice) * 100
          : 0;

      const totalGainMultiple = purchasePrice > 0 ? finalPrice / purchasePrice : 1;

      // Year-by-year schedule
      const schedule: { year: number; label: string; eps: number; projectedPrice: number }[] = [];
      for (let t = 1; t <= N; t++) {
        const tEps = startingEps * Math.pow(1 + g, t);
        // Linear transition of P/E multiple from currentPE to exitPE
        const tPe = currentPE + (exitPE - currentPE) * (t / N);
        const tPrice = tEps * tPe;
        schedule.push({
          year: t,
          label: `Year ${t} (${curYear + t})`,
          eps: Number(tEps.toFixed(2)),
          projectedPrice: Number(tPrice.toFixed(2)),
        });
      }

      horizons[N] = {
        years: N,
        futureEps: Number(futureEps.toFixed(2)),
        finalPrice: Number(finalPrice.toFixed(2)),
        fairBuyPrice: Number(fairBuyPrice.toFixed(2)),
        marginOfSafety: Number(marginOfSafety.toFixed(1)),
        expectedCagr: Number(expectedCagr.toFixed(1)),
        totalGainPercent: Number(totalGainPercent.toFixed(1)),
        totalGainMultiple: Number(totalGainMultiple.toFixed(2)),
        schedule,
      };
    }

    return {
      epsGrowth: Number(epsGrowth.toFixed(1)),
      exitPE: Number(exitPE.toFixed(1)),
      desiredReturn: Number(desiredReturn.toFixed(1)),
      horizons,
    };
  }

  // Bear: Lower growth, lower multiple
  const bearGrowth =
    inputs?.scenarios?.BEAR?.epsGrowth !== undefined
      ? inputs.scenarios.BEAR.epsGrowth
      : Math.max(3.0, Number((defaultGrowth * 0.6).toFixed(1)));
  const bearPE =
    inputs?.scenarios?.BEAR?.exitPE !== undefined
      ? inputs.scenarios.BEAR.exitPE
      : Math.max(10.0, Number((defaultExitPE * 0.75).toFixed(1)));
  const bearDesired =
    inputs?.scenarios?.BEAR?.desiredReturn !== undefined
      ? inputs.scenarios.BEAR.desiredReturn
      : defaultDesiredReturn;

  // Base: Normalized growth, realistic multiple
  const baseGrowth =
    inputs?.scenarios?.BASE?.epsGrowth !== undefined
      ? inputs.scenarios.BASE.epsGrowth
      : Number(defaultGrowth.toFixed(1));
  const basePE =
    inputs?.scenarios?.BASE?.exitPE !== undefined
      ? inputs.scenarios.BASE.exitPE
      : Number(defaultExitPE.toFixed(1));
  const baseDesired =
    inputs?.scenarios?.BASE?.desiredReturn !== undefined
      ? inputs.scenarios.BASE.desiredReturn
      : defaultDesiredReturn;

  // Bull: High growth, premium multiple
  const bullGrowth =
    inputs?.scenarios?.BULL?.epsGrowth !== undefined
      ? inputs.scenarios.BULL.epsGrowth
      : Number(Math.min(45.0, defaultGrowth * 1.4).toFixed(1));
  const bullPE =
    inputs?.scenarios?.BULL?.exitPE !== undefined
      ? inputs.scenarios.BULL.exitPE
      : Number((defaultExitPE * 1.25).toFixed(1));
  const bullDesired =
    inputs?.scenarios?.BULL?.desiredReturn !== undefined
      ? inputs.scenarios.BULL.desiredReturn
      : defaultDesiredReturn;

  const bearScenario = computeScenarioHorizons(bearGrowth, bearPE, bearDesired);
  const baseScenario = computeScenarioHorizons(baseGrowth, basePE, baseDesired);
  const bullScenario = computeScenarioHorizons(bullGrowth, bullPE, bullDesired);

  // Generate 2D Sensitivity Grid of EPS Growth (columns) vs Exit P/E (rows)
  const growthRates = [
    Math.max(2, baseGrowth - 6),
    Math.max(4, baseGrowth - 3),
    baseGrowth,
    baseGrowth + 3,
    baseGrowth + 6,
  ].map((g) => Number(g.toFixed(1)));

  const peMultiples = [
    Math.max(8, basePE - 8),
    Math.max(10, basePE - 4),
    basePE,
    basePE + 4,
    basePE + 8,
  ].map((p) => Number(p.toFixed(1)));

  const grid: any[][] = [];
  const r = baseDesired / 100;

  for (const pe of peMultiples) {
    const row: any[] = [];
    for (const gVal of growthRates) {
      const g = gVal / 100;
      const f3 = startingEps * Math.pow(1 + g, 3) * pe;
      const f5 = startingEps * Math.pow(1 + g, 5) * pe;
      const f10 = startingEps * Math.pow(1 + g, 10) * pe;

      const cagr3 = purchasePrice > 0 ? (Math.pow(f3 / purchasePrice, 1 / 3) - 1) * 100 : 0;
      const cagr5 = purchasePrice > 0 ? (Math.pow(f5 / purchasePrice, 1 / 5) - 1) * 100 : 0;
      const cagr10 = purchasePrice > 0 ? (Math.pow(f10 / purchasePrice, 1 / 10) - 1) * 100 : 0;
      const fair5 = f5 / Math.pow(1 + r, 5);

      row.push({
        growth: gVal,
        pe,
        finalPrice3Y: Number(f3.toFixed(2)),
        finalPrice5Y: Number(f5.toFixed(2)),
        finalPrice10Y: Number(f10.toFixed(2)),
        cagr3Y: Number(cagr3.toFixed(1)),
        cagr5Y: Number(cagr5.toFixed(1)),
        cagr10Y: Number(cagr10.toFixed(1)),
        fairBuyPrice5Y: Number(fair5.toFixed(2)),
      });
    }
    grid.push(row);
  }

  return {
    symbol: financialData.symbol,
    companyName: financialData.companyName,
    purchasePrice: Number(purchasePrice.toFixed(2)),
    startingEps: Number(startingEps.toFixed(2)),
    currentPE: Number(currentPE.toFixed(1)),
    scenarios: {
      BEAR: bearScenario,
      BASE: baseScenario,
      BULL: bullScenario,
    },
    sensitivityMatrix: {
      growthRates,
      peMultiples,
      grid,
    },
  };
}

