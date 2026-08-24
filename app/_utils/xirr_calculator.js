import xirr from 'xirr'

// Returns both the raw Newton-converged rate (usable as a warm-start guess for a
// nearby cashflow set) and the display value. `warm_start` must be a raw rate from a
// previous call — the display value is sign-transformed and would mislead Newton.
export function calculate_xirr_detailed(cashflows, warm_start) {
  if (cashflows.length < 2) return null
  const amounts = cashflows.map(c => c.amount)
  const sum = amounts.reduce((a, b) => a + b, 0)
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  const times = cashflows.map(c => Math.floor(c.when.getTime() / 86400000))
  const start = Math.min(...times)
  const end = Math.max(...times)

  if (!(min < 0 && max > 0 && start !== end)) return null

  // A warm start that fails in any way falls through to the standard sweep, so it can
  // only speed things up, never change which cashflow sets resolve.
  if (warm_start !== undefined && Number.isFinite(warm_start) && warm_start > -1) {
    try {
      const rate = xirr(cashflows, { guess: warm_start })
      if (Number.isFinite(rate) && Math.abs(rate) <= 10) {
        if (Math.abs(rate) < 1e-6) return { raw: rate, display: 0 }
        return { raw: rate, display: Math.abs(rate) * Math.sign(sum) }
      }
    } catch {}
  }

  const guesses = [undefined, 0, 0.05, -0.05, 0.25, -0.25, 1, -0.9]
  for (const guess of guesses) {
    try {
      const rate = xirr(cashflows, guess === undefined ? undefined : { guess })

      if (Math.abs(rate) < 1e-6) return { raw: rate, display: 0 }

      if (!Number.isFinite(rate) || Math.abs(rate) > 10) return null

      return { raw: rate, display: Math.abs(rate) * Math.sign(sum) }
    } catch {}
  }
  return null
}

export function calculate_xirr(cashflows) {
  const result = calculate_xirr_detailed(cashflows)
  return result === null ? null : result.display
}
