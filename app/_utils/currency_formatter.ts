export const currency_fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, signDisplay: 'exceptZero' });

// Formatter for displaying precise prices without rounding (useful for asset prices from external sources)
export const precise_currency_fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 20, signDisplay: 'exceptZero' });
