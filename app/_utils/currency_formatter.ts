export const currency_fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

// Formatter for displaying precise prices without rounding (useful for asset prices from external sources)
// Using up to 8 decimal places to preserve precision while avoiding excessively long displays
export const precise_currency_fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
  signDisplay: 'exceptZero',
})
