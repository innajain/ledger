/**
 * Formats a number according to Indian numbering system
 * Example: 1234567.89 -> 12,34,567.89
 */
import { toDecimal } from './decimal';

export function formatIndianCurrency(amount: number | any, decimals: number = 2): string {
  const fixed = toDecimal(amount).toFixed(decimals);
  const [integer, decimal] = fixed.split('.');

  // Handle sign for negative numbers
  const isNegative = integer.startsWith('-');
  const unsignedInt = isNegative ? integer.slice(1) : integer;

  // Indian numbering system: last 3 digits, then groups of 2
  const lastThree = unsignedInt.slice(-3);
  const otherDigits = unsignedInt.slice(0, -3);

  const grouped = otherDigits.length > 0
    ? otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;

  const formatted = isNegative ? `-${grouped}` : grouped;

  return decimal ? `${formatted}.${decimal}` : formatted;
}
