export function calc_xirr(cashFlows: { date: Date; amount: number }[]): number | null {
  // Input validation
  if (cashFlows.length < 2) {
    // console.error('XIRR requires at least 2 cash flows');
    return null;
  }

  // Check for mixed signs (at least one positive and one negative)
  const hasPositive = cashFlows.some(cf => cf.amount > 0);
  const hasNegative = cashFlows.some(cf => cf.amount < 0);

  if (!hasPositive || !hasNegative) {
    // console.error('XIRR requires both positive and negati/ve cash flows');
    return null;
  }

  // Sort cash flows by date to ensure proper calculation
  const sortedCashFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());

  let xirr = 0.1; // Initial guess

  for (let i = 0; i < 1000; i++) {
    let f = 0; // Function value
    let df = 0; // Derivative value

    for (const { date, amount } of sortedCashFlows) {
      // Calculate time difference in years from the first cash flow
      const t = (date.getTime() - sortedCashFlows[0].date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

      // Avoid division by zero or negative base in power calculation
      if (1 + xirr <= 0 && t !== 0) {
        // console.error('Invalid rate leading to negative base in power calculation');
        return null;
      }

      const term = t === 0 ? 1 : Math.pow(1 + xirr, t);

      // NPV calculation
      f += amount / term;

      // Derivative calculation
      if (t !== 0) {
        df -= (t * amount) / (term * (1 + xirr));
      }
    }

    // Check if derivative is too small (would cause division issues)
    if (Math.abs(df) < 1e-12) {
      // console.error('Derivative too small, cannot continue iteration');
      return null;
    }

    // Newton-Raphson update
    const newXirr = xirr - f / df;

    // Check for convergence
    if (Math.abs(newXirr - xirr) < 1e-8) {
      return newXirr * 100;
    }

    // Prevent extreme values that could cause overflow
    if (Math.abs(newXirr) > 100000) {
      // console.error('XIRR calculation diverged to extreme values');
      return null;
    }

    xirr = newXirr;
  }

  // console.error('XIRR did not converge after 1000 iterations');
  return null;
}
