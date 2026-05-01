import xirr from 'xirr';

export function calculate_xirr(cashflows) {
  if (cashflows.length < 2) return null;
  const amounts = cashflows.map(c => c.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const times = cashflows.map(c => Math.floor(c.when.getTime() / 86400000));
  const start = Math.min(...times);
  const end = Math.max(...times);

  if (min < 0 && max > 0 && start !== end) {
    try {
      return xirr(cashflows);
    } catch (e) {
      console.warn('XIRR calculation failed', e);
      return null;
    }
  }
  return null;
}
