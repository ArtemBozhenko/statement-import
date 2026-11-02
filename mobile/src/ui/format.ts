/**
 * Formatting for the screens. No device locale: amounts arrive in minor units and the
 * currency as a code from the response, so the output is deterministic ("19.99 AUD").
 */
export function formatMoneyMinor(amountMinor: number, currency: string): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${currency}`;
}

export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, value) => total + value, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `YYYY-MM-DD` → "1 Oct 2026". Unrecognized input is returned as is. */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const month = match && MONTHS[Number(match[2]) - 1];
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : iso;
}

/** "monthly" → "Monthly". The server returns cadence as an arbitrary string. */
export function formatCadence(cadence: string): string {
  return cadence.charAt(0).toUpperCase() + cadence.slice(1);
}
