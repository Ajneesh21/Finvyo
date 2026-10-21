export interface CashFlow {
  date: Date;
  amount: number; // Negative for outflow (deposits/investments), Positive for inflow/current value
}

/**
 * Calculates Money-Weighted Return (XIRR) using Newton-Raphson with Bisection fallback.
 * Returns annualized return percentage (e.g. 18.5 for 18.5%).
 */
export function calculateXIRR(
  cashFlows: { date: string | Date; amount: number }[]
): number {
  if (cashFlows.length < 2) return 0;

  const validFlows: CashFlow[] = cashFlows
    .map((cf) => ({
      date: typeof cf.date === "string" ? new Date(cf.date) : cf.date,
      amount: cf.amount,
    }))
    .filter((cf) => !isNaN(cf.date.getTime()) && Math.abs(cf.amount) > 0.001)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (validFlows.length < 2) return 0;

  // Check if we have at least one positive and one negative cash flow
  const hasPositive = validFlows.some((cf) => cf.amount > 0);
  const hasNegative = validFlows.some((cf) => cf.amount < 0);

  if (!hasPositive || !hasNegative) {
    return 0;
  }

  const d0 = validFlows[0].date.getTime();
  const dayFractions = validFlows.map(
    (cf) => (cf.date.getTime() - d0) / (1000 * 60 * 60 * 24 * 365.25)
  );

  // Net Present Value function
  const npv = (rate: number): number => {
    let sum = 0;
    for (let i = 0; i < validFlows.length; i++) {
      const denom = Math.pow(1 + rate, dayFractions[i]);
      if (isNaN(denom) || denom === 0) return NaN;
      sum += validFlows[i].amount / denom;
    }
    return sum;
  };

  // Derivative of NPV with respect to rate
  const dNpv = (rate: number): number => {
    let sum = 0;
    for (let i = 0; i < validFlows.length; i++) {
      const t = dayFractions[i];
      const denom = Math.pow(1 + rate, t + 1);
      if (isNaN(denom) || denom === 0) return NaN;
      sum += (-t * validFlows[i].amount) / denom;
    }
    return sum;
  };

  // 1. Try Newton-Raphson method
  let rate = 0.1; // initial guess 10%
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
    const val = npv(rate);
    const deriv = dNpv(rate);

    if (Math.abs(val) < tolerance) {
      return rate * 100;
    }

    if (isNaN(deriv) || Math.abs(deriv) < 1e-12) {
      break; // Fallback
    }

    const newRate = rate - val / deriv;

    // Keep rate in sensible bounds for Newton-Raphson (-0.99 to 10.0)
    if (newRate <= -0.99 || newRate > 10 || isNaN(newRate)) {
      break;
    }

    if (Math.abs(newRate - rate) < tolerance) {
      return newRate * 100;
    }

    rate = newRate;
  }

  // 2. Fallback: Bisection search in range [-0.99, 10.0]
  let low = -0.99;
  let high = 10.0;
  let npvLow = npv(low);
  let npvHigh = npv(high);

  if (npvLow * npvHigh > 0) {
    // If endpoints have same sign, check total simple return
    const totalOut = Math.abs(
      validFlows.filter((c) => c.amount < 0).reduce((s, c) => s + c.amount, 0)
    );
    const totalIn = validFlows
      .filter((c) => c.amount > 0)
      .reduce((s, c) => s + c.amount, 0);
    const years = dayFractions[dayFractions.length - 1] || 1;
    if (totalOut > 0) {
      const simpleReturn = (totalIn - totalOut) / totalOut;
      if (1 + simpleReturn <= 0) return -100;
      return (Math.pow(1 + simpleReturn, 1 / Math.max(0.1, years)) - 1) * 100;
    }
    return 0;
  }

  for (let i = 0; i < 150; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);

    if (Math.abs(npvMid) < tolerance || (high - low) / 2 < tolerance) {
      return mid * 100;
    }

    if (npvLow * npvMid < 0) {
      high = mid;
      npvHigh = npvMid;
    } else {
      low = mid;
      npvLow = npvMid;
    }
  }

  return ((low + high) / 2) * 100;
}
