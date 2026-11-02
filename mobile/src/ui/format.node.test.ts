import { formatBytes, formatCadence, formatIsoDate, formatMoneyMinor, sumMinor } from './format';

describe('format helpers', () => {
  it('formats minor units with two decimals and the currency code', () => {
    expect(formatMoneyMinor(1999, 'AUD')).toBe('19.99 AUD');
    expect(formatMoneyMinor(13200, 'AUD')).toBe('132.00 AUD');
    expect(formatMoneyMinor(5, 'EUR')).toBe('0.05 EUR');
    expect(formatMoneyMinor(-250, 'USD')).toBe('-2.50 USD');
  });

  it('sums the kit fixtures to 151.99 AUD per month', () => {
    expect(formatMoneyMinor(sumMinor([1999, 13200]), 'AUD')).toBe('151.99 AUD');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(112)).toBe('112 B');
    expect(formatBytes(33882)).toBe('33.1 KB');
    expect(formatBytes(10485771)).toBe('10.0 MB');
  });

  it('formats ISO dates and cadence, passing unknown input through', () => {
    expect(formatIsoDate('2026-10-01')).toBe('1 Oct 2026');
    expect(formatIsoDate('yesterday')).toBe('yesterday');
    expect(formatCadence('monthly')).toBe('Monthly');
    expect(formatCadence('')).toBe('');
  });
});
