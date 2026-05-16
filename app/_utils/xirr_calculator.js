import xirr from 'xirr'

export function calculate_xirr(cashflows) {
  if (cashflows.length < 2) return null
  const amounts = cashflows.map(c => c.amount)
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  const times = cashflows.map(c => Math.floor(c.when.getTime() / 86400000))
  const start = Math.min(...times)
  const end = Math.max(...times)

  if (!(min < 0 && max > 0 && start !== end)) return null

  // Newton-Raphson can fail to converge from a single starting guess, especially
  // for portfolios with many small flows whose true XIRR sits near 0. Retry with
  // a spread of guesses before giving up.
  const guesses = [undefined, 0, 0.05, -0.05, 0.25, -0.25, 1, -0.9]
  for (const guess of guesses) {
    try {
      const rate = xirr(cashflows, guess === undefined ? undefined : { guess })
      // Newton-Raphson on a true-zero return lands on floating-point noise
      // (e.g. 8e-16). Snap to exact 0 below display precision so colour logic
      // and rounding agree.
      if (Math.abs(rate) < 1e-6) return 0
      // Tiny-time-window cashflows (e.g. a buy just hours ago) can produce
      // astronomical annualized returns. Treat anything beyond ±1000% as
      // noise — chart libraries can't render values that large anyway.
      if (!Number.isFinite(rate) || Math.abs(rate) > 10) return null
      return rate
    } catch {
      // try next guess
    }
  }
  return null
}
