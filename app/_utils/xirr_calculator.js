import xirr from 'xirr'

export function calculate_xirr(cashflows) {
  if (cashflows.length < 2) return null
  const amounts = cashflows.map(c => c.amount)
  const sum = amounts.reduce((a, b) => a + b, 0)
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  const times = cashflows.map(c => Math.floor(c.when.getTime() / 86400000))
  const start = Math.min(...times)
  const end = Math.max(...times)

  if (!(min < 0 && max > 0 && start !== end)) return null

  const guesses = [undefined, 0, 0.05, -0.05, 0.25, -0.25, 1, -0.9]
  for (const guess of guesses) {
    try {
      const rate = xirr(cashflows, guess === undefined ? undefined : { guess })

      if (Math.abs(rate) < 1e-6) return 0

      if (!Number.isFinite(rate) || Math.abs(rate) > 10) return null

      return Math.abs(rate) * Math.sign(sum)
    } catch {}
  }
  return null
}
