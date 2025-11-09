/**
 * Formats a number according to Indian numbering system
 * Example: 1234567.89 -> ₹12,34,567.89
 */
export function format_indian_currency(amount: number | null | undefined, decimals: number = 2): string {
  if (amount === null || amount === undefined) {
    return '—';
  }
  const fixed = Number(amount).toFixed(decimals);
  const [integer, decimal] = fixed.split('.');

  // Handle sign for negative numbers
  const isNegative = integer.startsWith('-');
  const unsignedInt = isNegative ? integer.slice(1) : integer;

  // Indian numbering system: last 3 digits, then groups of 2
  const lastThree = unsignedInt.slice(-3);
  const otherDigits = unsignedInt.slice(0, -3);

  const grouped = otherDigits.length > 0 ? otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree : lastThree;

  const formatted = isNegative ? `-${grouped}` : grouped;

  return '₹ ' + (decimal !== '' && parseInt(decimal) !== 0 ? `${formatted}.${decimal}` : formatted);
}
