export const currency_fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

export const precise_currency_fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
  signDisplay: 'exceptZero',
})

/**
 * No sign display — for figures that are not flows (unit prices, absolute balances quoted
 * in prose). A price is never "+₹90.86".
 */
export const plain_currency_fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

export const precise_plain_currency_fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
})
