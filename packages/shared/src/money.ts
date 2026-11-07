// Money: integer minor units + currency. GCC precision rules (ADR-0006):
// AED/SAR/QAR = 2dp; KWD/BHD/OMR = 3dp. No binary floats anywhere.
export type Currency = 'AED' | 'SAR' | 'QAR' | 'KWD' | 'BHD' | 'OMR' | 'USD' | 'EUR';

export const CURRENCY_DP: Record<Currency, number> = {
  AED: 2, SAR: 2, QAR: 2, KWD: 3, BHD: 3, OMR: 3, USD: 2, EUR: 2,
};

export class MoneyError extends Error {}

export function toMinor(value: string | number, currency: Currency): number {
  if (typeof value === 'number') value = String(value);
  const dp = CURRENCY_DP[currency];
  const re = new RegExp(`^-?\\d{1,15}(\\.\\d{1,${dp}})?$`);
  if (!re.test(value.trim())) {
    throw new MoneyError(`Invalid amount ${JSON.stringify(value)} for ${currency} (${dp} decimal places)`);
  }
  const neg = value.trim().startsWith('-');
  const [i, f = ''] = value.trim().replace('-', '').split('.');
  const frac = (f + '0'.repeat(dp)).slice(0, dp);
  const minor = Number(i) * 10 ** dp + Number(frac);
  return neg ? -minor : minor;
}

export function fromMinor(minor: number, currency: Currency): string {
  const dp = CURRENCY_DP[currency];
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const s = String(abs).padStart(dp + 1, '0');
  return `${sign}${s.slice(0, -dp)}.${s.slice(-dp)}`;
}

export function formatMoney(minor: number, currency: Currency): string {
  return `${currency} ${fromMinor(minor, currency)}`;
}

export function addMinor(...values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
