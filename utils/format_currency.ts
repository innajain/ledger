/**
 * Formats a number according to Indian numbering system
 * Example: 1234567.89 -> 12,34,567.89
 */
export function formatIndianCurrency(amount: number, decimals: number = 2): string {
  const fixed = amount.toFixed(decimals);
  const [integer, decimal] = fixed.split('.');
  
  // Indian numbering system: last 3 digits, then groups of 2
  const lastThree = integer.slice(-3);
  const otherDigits = integer.slice(0, -3);
  
  const formatted = otherDigits.length > 0
    ? otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;
  
  return decimal ? `${formatted}.${decimal}` : formatted;
}
