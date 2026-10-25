/**
 * Quantities arrive from the API as exact decimal strings ("12513.9"). They are formatted for Colombia
 * (thousands with ".", decimals with ",") without ever going through floating point.
 */
export function formatDecimal(value: string): string {
  const negative = value.startsWith('-');
  const [integerPart = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;
}

const UNIT_LABELS: Record<string, string> = {
  un: 'und',
  L: 'L',
  mL: 'mL',
  kg: 'kg',
  g: 'g',
  mg: 'mg',
};

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

export function isZero(value: string): boolean {
  return /^-?0+(\.0+)?$/.test(value);
}

export function isNegative(value: string): boolean {
  return value.startsWith('-') && !isZero(value);
}

/**
 * Reads what people type in Colombia: "1.200" (thousands), "2,5" (decimal comma) or "2.5".
 * Returns the API format ("1200", "2.5") or null when it is not a number.
 */
export function parseDecimalInput(raw: string): string | null {
  const value = raw.trim().replace(/\s/g, '');
  if (value === '') return null;
  let normalised: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) {
    normalised = value.replace(/\./g, '').replace(',', '.');
  } else if (value.includes(',')) {
    normalised = value.replace(/\./g, '').replace(',', '.');
  } else {
    normalised = value;
  }
  return /^\d+(\.\d+)?$/.test(normalised) ? normalised : null;
}

/** Ratio of two decimal strings, for bar widths only (display, never business math). */
export function ratio(part: string, whole: string): number {
  const w = Number(whole);
  if (!Number.isFinite(w) || w <= 0) return 0;
  return Math.max(0, Math.min(1, Number(part) / w));
}

const dateFormat = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFormat = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** "2026-11-03" → "3 nov 2026" (date-only values are calendar dates, not instants). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return dateTimeFormat.format(new Date(value));
}

/** Days from today to a calendar date: negative when it is in the past. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - todayUtc) / 86_400_000);
}

export function relativeDays(value: string | null | undefined): string {
  const days = daysUntil(value);
  if (days === null) return 'Sin fecha';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days === -1) return 'Ayer';
  return days > 0 ? `En ${String(days)} días` : `Hace ${String(-days)} días`;
}

export function todayIso(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** "1 preventa" / "3 preventas". */
export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/**
 * Rounds a decimal string up (away from zero) to `digits` decimals, for display: "0.457275" → "0.46".
 * Never rounds a requirement down, so what is shown is always enough.
 */
export function roundUpDecimal(value: string, digits = 2): string {
  const negative = value.startsWith('-');
  const [integerPart = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (fraction.length <= digits) return value;
  const kept = fraction.slice(0, digits);
  const bumped = /[1-9]/.test(fraction.slice(digits));
  const scaled = (BigInt(`${integerPart}${kept}`) + (bumped ? 1n : 0n))
    .toString()
    .padStart(digits + 1, '0');
  const integer = digits > 0 ? scaled.slice(0, -digits) : scaled;
  const decimals = (digits > 0 ? scaled.slice(-digits) : '').replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${decimals ? `.${decimals}` : ''}`;
}
