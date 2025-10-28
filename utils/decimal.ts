import DecimalJS from 'decimal.js';

// Small wrapper helpers for consistent Decimal usage across project
export const Decimal = DecimalJS;

export function toDecimal(value: unknown): DecimalJS {
  if ((value as any) instanceof DecimalJS) return value as DecimalJS;
  if (value === null || value === undefined || value === '') return new DecimalJS(0);
  return new DecimalJS(value as any);
}

export function sumDecimals(values: Array<unknown>): DecimalJS {
  return values.reduce<DecimalJS>((acc, v) => acc.plus(toDecimal(v)), new DecimalJS(0));
}

export function mul(a: unknown, b: unknown): DecimalJS {
  return toDecimal(a).times(toDecimal(b));
}

export function toFixedString(d: DecimalJS, decimals = 2): string {
  return d.toFixed(decimals);
}

export default Decimal;
