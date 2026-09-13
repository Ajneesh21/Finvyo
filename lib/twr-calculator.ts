import { SubPeriodReturn, DailyPortfolioPoint } from "./types";

export interface CashFlowEvent {
  date: string;
  amount: number; // Positive = Deposit/Inflow, Negative = Withdrawal/Outflow
  description?: string;
}

export interface TwrCalculationResult {
  cumulativeTwrPercent: number; // e.g. 45.2%
  annualizedTwrPercent: number; // CAGR e.g. 15.4%
  subPeriods: SubPeriodReturn[];
}

/**
 * Calculates Daily Cash-Flow-Adjusted Time-Weighted Return (TWR) using end-of-day
 * portfolio valuations and EXTERNAL cash flow events (DEPOSIT / WITHDRAWAL only).
 *
 * Formula per sub-period:
 *   V_end_pre  = V_end_post − net_external_flow_on_end_date
 *   R_i        = (V_end_pre − V_start) / V_start
 *   TWR        = ∏(1 + R_i) − 1
 *
 * IMPORTANT: This is a daily-granularity approximation. Because we only have end-of-day
 * valuations, cash flows that are deployed intraday (e.g. a morning deposit that is
 * immediately invested before the close) are not distinguished from flows that arrive
 * at the close. For exact sub-period returns you would need intraday timestamps and
 * valuations at the moment of each flow.
 *
 * @param cashFlows DEPOSIT/WITHDRAWAL events only — BUY/SELL must NOT be passed here
 * @param dailyValuations Map of date (YYYY-MM-DD) -> end-of-day portfolio valuation
 * @param initialDate First transaction date
 * @param finalDate Current / last date
 */
export function calculateTWR(
  cashFlows: CashFlowEvent[],
  dailyValuations: Map<string, number>,
  initialDate: string,
  finalDate: string
): TwrCalculationResult {
  if (!initialDate || !finalDate || dailyValuations.size === 0) {
    return { cumulativeTwrPercent: 0, annualizedTwrPercent: 0, subPeriods: [] };
  }

  // Net same-day cash flows into a single value per date
  const cashFlowsByDate = new Map<string, number>();
  cashFlows.forEach((cf) => {
    const current = cashFlowsByDate.get(cf.date) || 0;
    cashFlowsByDate.set(cf.date, current + cf.amount);
  });

  // Sub-period boundaries: inception, each external-flow date, and the final date
  const eventDateSet = new Set<string>();
  eventDateSet.add(initialDate);
  eventDateSet.add(finalDate);
  cashFlows.forEach((cf) => eventDateSet.add(cf.date));

  const subPeriodDates = Array.from(eventDateSet).sort((a, b) =>
    a.localeCompare(b)
  );

  if (subPeriodDates.length < 2) {
    return { cumulativeTwrPercent: 0, annualizedTwrPercent: 0, subPeriods: [] };
  }

  const subPeriods: SubPeriodReturn[] = [];
  let compoundFactor = 1.0;

  // Starting value for the first sub-period: prefer the timeline's EOD valuation on
  // inception date; fall back to the net deposit on that date (i.e. the initial funding).
  const baseDate = subPeriodDates[0];
  let currentStartVal =
    dailyValuations.get(baseDate) ||
    cashFlowsByDate.get(baseDate) ||
    0;
  if (currentStartVal <= 0) {
    currentStartVal = cashFlowsByDate.get(baseDate) || 0;
  }

  // If we still have no meaningful starting value we cannot compute TWR
  if (currentStartVal < 1.0) {
    return { cumulativeTwrPercent: 0, annualizedTwrPercent: 0, subPeriods: [] };
  }

  for (let i = 0; i < subPeriodDates.length - 1; i++) {
    const startDate = subPeriodDates[i];
    const endDate = subPeriodDates[i + 1];

    const flowsOnEnd = cashFlowsByDate.get(endDate) || 0;
    const endValFromMap = dailyValuations.get(endDate);

    // If we have no valuation for this date, estimate from previous value + flows.
    // This is a rough approximation — prefer having a complete valuation map.
    const endValPost =
      endValFromMap !== undefined
        ? endValFromMap
        : Math.max(0, currentStartVal + flowsOnEnd);

    // Portfolio value immediately BEFORE the end-date external cash flow.
    // Approximation: assumes the flow arrived at end-of-day (not intraday).
    const endValPre = endValPost - flowsOnEnd;

    // Sub-period return: skip if the starting value is below ₹1 / $1
    // (e.g., after a full liquidation — we should not divide by a phantom value).
    let periodReturn = 0;
    if (currentStartVal >= 1.0) {
      periodReturn = (endValPre - currentStartVal) / currentStartVal;
    }

    if (isNaN(periodReturn) || !isFinite(periodReturn)) {
      periodReturn = 0;
    }

    const factorMultiplier = 1 + periodReturn;

    // Record the sub-period before deciding whether to terminate
    subPeriods.push({
      startDate,
      endDate,
      startValue: currentStartVal,
      cashFlow: flowsOnEnd,
      endValue: endValPre,
      periodReturn: periodReturn * 100,
      // Use the updated cumulative TWR for this entry
      cumulativeTWR:
        factorMultiplier > 0
          ? (compoundFactor * factorMultiplier - 1) * 100
          : -100,
    });

    if (factorMultiplier <= 0) {
      // Complete portfolio loss — compound factor reaches zero.
      // Further sub-periods are mathematically undefined (divide-by-zero start value).
      compoundFactor = 0;
      break;
    }

    compoundFactor *= factorMultiplier;

    // If the portfolio is fully liquidated after flows, stop rather than carrying a
    // near-zero value as the denominator for the next period.
    if (endValPost < 1.0) {
      break;
    }

    currentStartVal = endValPost;
  }

  const cumulativeTwrPercent = (compoundFactor - 1) * 100;

  // Annualized return (CAGR). Only meaningful after at least 30 days — annualizing
  // very short holding periods produces astronomically large numbers that mislead users.
  const dStart = new Date(initialDate).getTime();
  const dEnd = new Date(finalDate).getTime();
  const daysDiff = Math.max(1, (dEnd - dStart) / (1000 * 60 * 60 * 24));
  const years = daysDiff / 365.25;

  let annualizedTwrPercent = 0;
  if (daysDiff >= 30 && years > 0 && compoundFactor > 0) {
    annualizedTwrPercent = (Math.pow(compoundFactor, 1 / years) - 1) * 100;
  } else {
    // Portfolio is too young to annualize — return the raw cumulative figure instead
    annualizedTwrPercent = cumulativeTwrPercent;
  }

  return {
    cumulativeTwrPercent,
    annualizedTwrPercent,
    subPeriods,
  };
}

/**
 * Calculates daily compounded TWR series from daily valuation and daily cash flows.
 * Each day's return = (V_today_before_flows − V_yesterday) / V_yesterday.
 */
export function calculateDailyTWRSeries(
  dailyData: { date: string; value: number; cashFlow: number }[]
): { date: string; twrPercent: number }[] {
  if (dailyData.length === 0) return [];

  let compoundFactor = 1.0;
  let prevValue = dailyData[0].value;

  return dailyData.map((d, index) => {
    if (index === 0) {
      prevValue = d.value;
      return { date: d.date, twrPercent: 0 };
    }

    const valueBeforeTodayFlow = d.value - d.cashFlow;
    let dayReturn = 0;

    // Skip division when the previous value is below a meaningful threshold
    // (e.g., after a full liquidation that was followed by a new deposit)
    if (prevValue >= 1.0) {
      dayReturn = (valueBeforeTodayFlow - prevValue) / prevValue;
    }

    if (!isNaN(dayReturn) && isFinite(dayReturn)) {
      const factor = 1 + dayReturn;
      // A factor ≤ 0 means complete loss — stop compounding rather than going negative
      if (factor > 0) {
        compoundFactor *= factor;
      } else {
        compoundFactor = 0;
      }
    }

    // Do not floor prevValue — use the actual portfolio value so the next day's
    // denominator is honest (a zero means we had a full liquidation).
    prevValue = d.value;

    return {
      date: d.date,
      twrPercent: (compoundFactor - 1) * 100,
    };
  });
}

/**
 * Maps sub-period TWR compounding onto the timeline so that every intermediate point
 * represents the true cumulative TWR up to that day, and the final point strictly
 * matches the portfolio's total twrPercent.
 */
export function alignTimelineTWRSeries(
  timeline: DailyPortfolioPoint[],
  subPeriods: SubPeriodReturn[],
  finalTwrPercent: number,
  cashFlows: CashFlowEvent[] = []
): void {
  if (!timeline || timeline.length === 0) return;

  if (timeline.length === 1) {
    timeline[0].cumulativeTWR = Number(finalTwrPercent.toFixed(2));
    return;
  }

  // If there are no sub-periods, compute simple growth relative to starting value
  if (!subPeriods || subPeriods.length === 0) {
    const startVal =
      timeline[0].portfolioValue > 0
        ? timeline[0].portfolioValue
        : timeline[0].netInvestedCapital;

    for (let i = 0; i < timeline.length - 1; i++) {
      if (i === 0) {
        timeline[i].cumulativeTWR = 0;
      } else {
        const val = timeline[i].portfolioValue;
        const ret = startVal > 0 ? ((val - startVal) / startVal) * 100 : 0;
        timeline[i].cumulativeTWR = Number(ret.toFixed(2));
      }
    }
    timeline[timeline.length - 1].cumulativeTWR = Number(finalTwrPercent.toFixed(2));
    return;
  }

  const cashFlowsByDate = new Map<string, number>();
  cashFlows.forEach((cf) => {
    const cur = cashFlowsByDate.get(cf.date) || 0;
    cashFlowsByDate.set(cf.date, cur + cf.amount);
  });

  // Calculate compound factors at the start of each sub-period
  // Sub-period 0 starts with CF = 1.0
  const subPeriodStartCF: number[] = [1.0];
  let curCF = 1.0;
  for (let s = 0; s < subPeriods.length; s++) {
    const pRet = subPeriods[s].periodReturn / 100;
    curCF *= Math.max(0, 1 + pRet);
    subPeriodStartCF.push(curCF);
  }

  // For each timeline point, find which sub-period it falls in
  timeline[0].cumulativeTWR = 0;

  for (let i = 1; i < timeline.length - 1; i++) {
    const pt = timeline[i];
    const dateStr = pt.date;

    // Find active sub-period: where dateStr <= subPeriods[s].endDate
    let subIdx = -1;
    for (let s = 0; s < subPeriods.length; s++) {
      if (dateStr <= subPeriods[s].endDate) {
        subIdx = s;
        break;
      }
    }

    if (subIdx === -1) {
      // Past all sub-periods
      timeline[i].cumulativeTWR = Number(finalTwrPercent.toFixed(2));
      continue;
    }

    const sp = subPeriods[subIdx];
    const baseCF = subPeriodStartCF[subIdx];
    const startVal = sp.startValue;

    if (startVal <= 0) {
      timeline[i].cumulativeTWR = Number(((baseCF - 1) * 100).toFixed(2));
      continue;
    }

    // If dateStr is exactly the endDate of the sub-period, subtract flow on that date (pre-flow valuation)
    let valPre = pt.portfolioValue;
    if (dateStr === sp.endDate) {
      const flow = cashFlowsByDate.get(dateStr) || 0;
      valPre = pt.portfolioValue - flow;
    }

    const periodRet = (valPre - startVal) / startVal;
    const factor = baseCF * Math.max(0, 1 + periodRet);
    timeline[i].cumulativeTWR = Number(((factor - 1) * 100).toFixed(2));
  }

  // Strictly enforce that the final timeline point matches finalTwrPercent
  timeline[timeline.length - 1].cumulativeTWR = Number(finalTwrPercent.toFixed(2));
}

